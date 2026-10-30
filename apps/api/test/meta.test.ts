import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, LiveCallsDisabled, MAX_BLOCKING_WAIT_S, MetaError, models, outputText, parseSamBoxes, retryAfterSeconds, RetryLater, runTask, segmentBoxes, transcribe, type MetaEnv, type Spender } from '../src/meta.ts';
import { readingTask } from '../../../packages/core/src/prompts.ts';

const env: MetaEnv = { MODEL_API_KEY: 'test-key', COEVO_ALLOW_LIVE_CALLS: 'true', META_API_BASE_URL: 'https://api.meta.ai/v1' };

function ledger() {
  const events: string[] = [];
  let total = 0;
  const reserved = new Map<string, number>();
  const spender: Spender = {
    async reserve(usd, label) { const t = `${label}#${reserved.size}`; reserved.set(t, usd); total += usd; events.push(`reserve:${label}`); return t; },
    async settle(t, actual) { total += actual - (reserved.get(t) ?? 0); reserved.delete(t); events.push(`settle:${actual.toFixed(6)}`); },
  };
  return { spender, events, total: () => total };
}

const reading = { legible: true, tool: 'Meta AI', task: 'poster', userRequest: 'more premium', userTyping: false, aiResponseSummary: null, aiAskedClarifyingQuestion: false, artifactVisible: true, vagueTerms: ['premium'], ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false }, confidence: 0.8 };

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const ok = (text: string) => response({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 2000, output_tokens: 300, input_tokens_details: { cached_tokens: 0 } } });

test('live calls off: nothing is sent', async () => {
  let called = false;
  await assert.rejects(runTask({ ...env, COEVO_ALLOW_LIVE_CALLS: 'false' }, ledger().spender, readingTask, { text: 'x' }, (async () => { called = true; return ok('{}'); }) as typeof fetch), LiveCallsDisabled);
  assert.equal(called, false);
});

test('contributor model variants are refused', () => {
  assert.throws(() => models({ ...env, META_TEXT_MODEL: 'muse-spark-1.3-contributor' }), /Contributor/);
});

test('runTask sends strict json_schema, store:false, and settles real cost', async () => {
  const l = ledger();
  let sent: Record<string, unknown> = {};
  const f = (async (_url: string, init: RequestInit) => { sent = JSON.parse(init.body as string); return ok(JSON.stringify(reading)); }) as unknown as typeof fetch;
  const r = await runTask(env, l.spender, readingTask, { text: 'Read', images: ['data:image/jpeg;base64,AAAA'] }, f);
  assert.equal(r.value.userRequest, 'more premium');
  assert.equal(sent.store, false);
  assert.equal((sent.text as { format: { type: string; strict: boolean } }).format.type, 'json_schema');
  assert.equal((sent.text as { format: { strict: boolean } }).format.strict, true);
  const content = (sent.input as { content: { type: string }[] }[])[0].content;
  assert.deepEqual(content.map(c => c.type), ['input_text', 'input_image']);
  assert.ok(Math.abs(l.total() - (2000 * 1.25 + 300 * 4.25) / 1e6) < 1e-9);
});

test('429 honors Retry-After then succeeds', async () => {
  let n = 0;
  const f = (async () => { n++; return n === 1 ? response({ error: { message: 'slow down', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }, 429, { 'retry-after': '0.01' }) : ok(JSON.stringify(reading)); }) as unknown as typeof fetch;
  await runTask(env, ledger().spender, readingTask, { text: 'x' }, f);
  assert.equal(n, 2);
});

test('documented unbilled rejections refund; 500/504 are not retried and keep the reservation', async () => {
  for (const [status, refunded] of [[400, true], [402, true], [429, true], [503, true], [500, false], [504, false]] as const) {
    let calls = 0;
    const g = (async () => { calls++; return response({ error: { message: 'no', type: 'x', code: null } }, status, status === 429 || status === 503 ? { 'retry-after': '0' } : {}); }) as unknown as typeof fetch;
    const l = ledger();
    await assert.rejects(runTask(env, l.spender, readingTask, { text: 'x' }, g), (e: unknown) => e instanceof MetaError && e.status === status);
    assert.equal(calls, status === 429 || status === 503 ? 3 : 1, `attempts for ${status}`);
    assert.equal(l.total() === 0, refunded, `refund for ${status}`);
  }
});

test('lost responses keep the reservation: timeout after acceptance and malformed body', async () => {
  const timeout = (async () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
  const l1 = ledger();
  await assert.rejects(runTask(env, l1.spender, readingTask, { text: 'x' }, timeout));
  assert.ok(l1.total() > 0, 'a request the provider may have completed stays charged');
  const malformed = (async () => new Response('{not json', { status: 200 })) as unknown as typeof fetch;
  const l2 = ledger();
  await assert.rejects(runTask(env, l2.spender, readingTask, { text: 'x' }, malformed));
  assert.ok(l2.total() > 0);
  const img = ledger();
  await assert.rejects(generateImage(env, img.spender, 'p', '1024x1536', timeout));
  assert.ok(Math.abs(img.total() - 0.01) < 1e-9);
});

test('Retry-After is honored in full: long waits surface RetryLater instead of a shortened retry', async () => {
  let calls = 0;
  const started = Date.now();
  const f = (async () => { calls++; return response({ error: { message: 'busy', type: 'server_error', code: 'service_overloaded' } }, 503, { 'retry-after': '60' }); }) as unknown as typeof fetch;
  const l = ledger();
  await assert.rejects(runTask(env, l.spender, readingTask, { text: 'x' }, f), (e: unknown) => e instanceof RetryLater && e.waitSeconds === 60);
  assert.equal(calls, 1, 'no early retry');
  assert.ok(Date.now() - started < 1000);
  assert.equal(l.total(), 0, 'a 503 rejection is unbilled');
  assert.equal(retryAfterSeconds('2.5'), 2.5);
  const now = Date.parse('2026-11-01T00:00:00Z');
  assert.equal(retryAfterSeconds('Sun, 01 Nov 2026 00:00:30 GMT', now), 30);
  assert.equal(retryAfterSeconds(null), null);
  assert.ok(MAX_BLOCKING_WAIT_S >= 5);
});

test('invalid model output is retried once, then rejected', async () => {
  let n = 0;
  const f = (async () => { n++; return ok('{"legible": "yes"}'); }) as unknown as typeof fetch;
  await assert.rejects(runTask(env, ledger().spender, readingTask, { text: 'x' }, f), /Invalid screen_reading output/);
  assert.equal(n, 2);
});

test('refusals and commentary are handled when extracting text', () => {
  assert.equal(outputText({ output: [{ type: 'message', phase: 'commentary', content: [{ type: 'output_text', text: 'thinking' }] }, { type: 'message', content: [{ type: 'output_text', text: 'final' }] }] }), 'final');
  assert.throws(() => outputText({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), /refused/);
});

test('SAM special tokens parse into pixel boxes (commas in mask data are safe)', async () => {
  const text = '<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561;c=0.96|><|mask;x=0;y=0;data=46,101,!abc|>,1<|box;x1=10;y1=20;x2=30;y2=40;w=537;h=561|><|mask;x=0;y=0;data=21,21,!x|>';
  const boxes = parseSamBoxes(text);
  assert.equal(boxes.length, 2);
  assert.deepEqual([boxes[0].x1, boxes[0].y2, boxes[0].w, boxes[0].c], [353, 427, 537, 0.96]);
  assert.equal(parseSamBoxes('').length, 0);
  let sent: Record<string, unknown> = {};
  const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(init.body as string); return response({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { images_processed: 1 } }); }) as unknown as typeof fetch;
  const r = await segmentBoxes(env, ledger().spender, 'data:image/jpeg;base64,AA', 'computer monitor screen', f);
  assert.equal(r.boxes.length, 2);
  assert.equal(sent.model, 'sam-3.1');
  assert.deepEqual(sent.metadata, { mask_encoding: 'one_bit', include_confidence: 'true' });
});

test('transcribe posts multipart request + audio parts', async () => {
  let form: FormData | null = null;
  let url = '';
  const f = (async (u: string, init: RequestInit) => { url = u; form = init.body as FormData; return response({ transcript: ' office workers ', audioDurationMs: 4000 }); }) as unknown as typeof fetch;
  const r = await transcribe(env, ledger().spender, new Uint8Array(100), 4, ['premium'], f);
  assert.equal(r.transcript, 'office workers');
  assert.match(url, /\/asr\/transcribe$/);
  const req = JSON.parse(await (form!.get('request') as Blob).text());
  assert.equal(req.audioEncoding, 'WAV');
  assert.equal(req.model, 'muse-voice-transcribe-1.0');
  assert.ok(form!.get('audio') instanceof Blob);
});

test('image generation returns bytes and bills $0.01', async () => {
  const l = ledger();
  const f = (async () => response({ data: [{ b64_json: btoa('png-bytes') }] })) as unknown as typeof fetch;
  const r = await generateImage(env, l.spender, 'a poster', '1024x1536', f);
  assert.equal(new TextDecoder().decode(r.bytes), 'png-bytes');
  assert.ok(Math.abs(l.total() - 0.01) < 1e-9);
});
