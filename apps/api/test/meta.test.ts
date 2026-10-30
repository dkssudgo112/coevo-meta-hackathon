import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CostUnverifiable, generateImage, InvalidAudio, ModelNotAllowed, INPUT_COUNT_MARGIN, INPUT_COUNT_PAD, LiveCallsDisabled, MAX_BLOCKING_WAIT_S, MetaError, models, outputText, parseSamBoxes, retryAfterSeconds, RetryLater, runTask, segmentBoxes, transcribe, transcribeKeywords, type MetaEnv, type Spender } from '../src/meta.ts';
import { sparkMaxCost } from '../../../packages/core/src/budget.ts';
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

const reading = { legible: true, tool: 'Meta AI', task: 'poster', userRequest: 'more premium', userTyping: false, aiResponseSummary: null, aiAskedClarifyingQuestion: false, aiAskedFor: [], artifactVisible: true, vagueTerms: ['premium'], ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false }, confidence: 0.8 };

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Route the token-count endpoint to a fixed count; everything else to `gen`. */
function withCount(gen: (url: string, init: RequestInit) => Promise<Response>, count = 2000) {
  const calls: string[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push(url.endsWith('/responses/input_tokens') ? 'count' : 'gen');
    return url.endsWith('/responses/input_tokens') ? response({ object: 'response.input_tokens', input_tokens: count }) : gen(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}

/** Build a WAV with the given duration and format (defaults: 16 kHz mono 16-bit). */
function wavBytes(seconds: number, rate = 16000, channels = 1, bits = 16): Uint8Array {
  const n = Math.round(seconds * rate) * channels * (bits / 8);
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const w = (o: number, t: string) => { for (let i = 0; i < 4; i++) b[o + i] = t.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, channels, true); v.setUint32(24, rate, true); v.setUint32(28, rate * channels * bits / 8, true); v.setUint16(32, channels * bits / 8, true); v.setUint16(34, bits, true);
  w(36, 'data'); v.setUint32(40, n, true);
  return b;
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
  const { f, calls } = withCount(async (_url, init) => { sent = JSON.parse(init.body as string); return ok(JSON.stringify(reading)); });
  const r = await runTask(env, l.spender, readingTask, { text: 'Read', images: ['data:image/jpeg;base64,AAAA'] }, f);
  assert.deepEqual(calls, ['count', 'gen'], 'input tokens are counted before the generation is sent');
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
  const { f } = withCount(async () => { n++; return n === 1 ? response({ error: { message: 'slow down', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }, 429, { 'retry-after': '0.01' }) : ok(JSON.stringify(reading)); });
  await runTask(env, ledger().spender, readingTask, { text: 'x' }, f);
  assert.equal(n, 2);
});

test('documented unbilled rejections refund; 500/504 are not retried and keep the reservation', async () => {
  for (const [status, refunded] of [[400, true], [402, true], [429, true], [503, true], [500, false], [504, false]] as const) {
    let calls = 0;
    const { f: g } = withCount(async () => { calls++; return response({ error: { message: 'no', type: 'x', code: null } }, status, status === 429 || status === 503 ? { 'retry-after': '0' } : {}); });
    const l = ledger();
    await assert.rejects(runTask(env, l.spender, readingTask, { text: 'x' }, g), (e: unknown) => e instanceof MetaError && e.status === status);
    assert.equal(calls, status === 429 || status === 503 ? 3 : 1, `attempts for ${status}`);
    assert.equal(l.total() === 0, refunded, `refund for ${status}`);
  }
});

test('lost responses keep the reservation: timeout after acceptance and malformed body', async () => {
  const timeout = (async () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
  const l1 = ledger();
  await assert.rejects(runTask(env, l1.spender, readingTask, { text: 'x' }, withCount(async () => timeout('', {})).f));
  assert.ok(l1.total() > 0, 'a request the provider may have completed stays charged');
  const l2 = ledger();
  await assert.rejects(runTask(env, l2.spender, readingTask, { text: 'x' }, withCount(async () => new Response('{not json', { status: 200 })).f));
  assert.ok(l2.total() > 0);
  const img = ledger();
  await assert.rejects(generateImage(env, img.spender, 'p', '1024x1536', timeout));
  assert.ok(Math.abs(img.total() - 0.01) < 1e-9);
});

test('Retry-After is honored in full: long waits surface RetryLater instead of a shortened retry', async () => {
  let calls = 0;
  const started = Date.now();
  const { f } = withCount(async () => { calls++; return response({ error: { message: 'busy', type: 'server_error', code: 'service_overloaded' } }, 503, { 'retry-after': '60' }); });
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
  const { f, calls } = withCount(async () => { n++; return ok('{"legible": "yes"}'); });
  await assert.rejects(runTask(env, ledger().spender, readingTask, { text: 'x' }, f), /Invalid screen_reading output/);
  assert.equal(n, 2);
  assert.deepEqual(calls, ['count', 'gen', 'count', 'gen'], 'the second attempt is counted and reserved again');
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
  const r = await transcribe(env, ledger().spender, wavBytes(4), ['premium'], f);
  assert.equal(r.transcript, 'office workers');
  assert.match(url, /\/asr\/transcribe$/);
  const req = JSON.parse(await (form!.get('request') as Blob).text());
  assert.equal(req.audioEncoding, 'WAV');
  assert.equal(req.model, 'muse-voice-transcribe-1.0');
  assert.ok(form!.get('audio') instanceof Blob);
});

test('transcribe sends single-word keyword hints and retries once without them after a 400', async () => {
  assert.deepEqual(transcribeKeywords(['more premium', 'Premium dessert poster for Morning Table café', 'a']), ['more', 'premium', 'dessert', 'poster', 'for', 'Morning', 'Table', 'café']);
  const l = ledger();
  const sent: (string[] | undefined)[] = [];
  const f = (async (_u: string, init: RequestInit) => {
    const req = JSON.parse(await ((init.body as FormData).get('request') as Blob).text());
    sent.push(req.keywords);
    return req.keywords ? response({ error: { message: 'invalid keywords', type: 'invalid_request_error', code: null } }, 400) : response({ transcript: 'for office workers', audioDurationMs: 4000 });
  }) as unknown as typeof fetch;
  const r = await transcribe(env, l.spender, wavBytes(4), ['more premium'], f);
  assert.equal(r.transcript, 'for office workers');
  assert.deepEqual(sent, [['more', 'premium'], undefined]);
  assert.ok(Math.abs(l.total() - r.costUsd) < 1e-12, 'the rejected first attempt is refunded; only the retry is charged');
  // Other errors are not retried.
  let calls = 0;
  const g = (async () => { calls++; return response({ error: { message: 'busy' } }, 500); }) as unknown as typeof fetch;
  await assert.rejects(transcribe(env, ledger().spender, wavBytes(4), ['premium'], g), MetaError);
  assert.equal(calls, 1);
});

test('image generation returns bytes and bills $0.01', async () => {
  const l = ledger();
  const f = (async () => response({ data: [{ b64_json: btoa('png-bytes') }] })) as unknown as typeof fetch;
  const r = await generateImage(env, l.spender, 'a poster', '1024x1536', f);
  assert.equal(new TextDecoder().decode(r.bytes), 'png-bytes');
  assert.ok(Math.abs(l.total() - 0.01) < 1e-9);
});

test('reservation is the exact maximum from the counted input tokens', async () => {
  const reserves: number[] = [];
  const spender: Spender = { async reserve(usd) { reserves.push(usd); return `t:${usd}`; }, async settle() {} };
  const { f } = withCount(async () => ok(JSON.stringify(reading)), 3000);
  await runTask(env, spender, readingTask, { text: 'x' }, f);
  const maxOut = readingTask.maxOutputTokens + 1500;
  assert.ok(Math.abs(reserves[0] - sparkMaxCost(Math.ceil(3000 * INPUT_COUNT_MARGIN) + INPUT_COUNT_PAD, maxOut)) < 1e-12);
});

test('cost that cannot be verified is refused before any generation is sent', async () => {
  for (const countFails of [() => response({ error: { message: 'bad', type: 'invalid_request_error', code: null } }, 400), () => response({ object: 'response.input_tokens' }), () => { throw new TypeError('fetch failed'); }]) {
    let generated = false;
    const f = (async (url: string) => { if (url.endsWith('/input_tokens')) return countFails(); generated = true; return ok(JSON.stringify(reading)); }) as unknown as typeof fetch;
    const l = ledger();
    await assert.rejects(runTask(env, l.spender, readingTask, { text: 'x' }, f), CostUnverifiable);
    assert.equal(generated, false);
    assert.equal(l.total(), 0, 'nothing was reserved');
  }
});

test('missing or partial usage keeps the full reservation (never shrinks to a guess)', async () => {
  for (const usage of [undefined, { input_tokens: 10 }, { output_tokens: 10 }]) {
    const l = ledger();
    const { f } = withCount(async () => response({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reading) }] }], ...(usage ? { usage } : {}) }));
    await runTask(env, l.spender, readingTask, { text: 'x' }, f);
    const max = sparkMaxCost(Math.ceil(2000 * INPUT_COUNT_MARGIN) + INPUT_COUNT_PAD, readingTask.maxOutputTokens + 1500);
    assert.ok(Math.abs(l.total() - max) < 1e-12, `usage ${JSON.stringify(usage)}`);
  }
});

test('transcription without a reported duration keeps the rounded-up reservation', async () => {
  const l = ledger();
  const f = (async () => response({ transcript: 'hi' })) as unknown as typeof fetch;
  await transcribe(env, l.spender, wavBytes(4.2), [], f);
  assert.ok(Math.abs(l.total() - (5 / 3600) * 0.18) < 1e-12);
});

test('audio cost comes from validated WAV bytes; invalid audio is refused before any reservation', async () => {
  for (const bad of [new Uint8Array(100), wavBytes(2, 44100), wavBytes(2, 16000, 2), wavBytes(2, 16000, 1, 8)]) {
    let sent = false;
    const l = ledger();
    await assert.rejects(transcribe(env, l.spender, bad, [], (async () => { sent = true; return response({ transcript: 'x' }); }) as unknown as typeof fetch), InvalidAudio);
    assert.equal(sent, false);
    assert.equal(l.total(), 0);
  }
});

test('models outside the priced allowlist fail closed before anything is reserved', async () => {
  let sent = false;
  const l = ledger();
  await assert.rejects(runTask({ ...env, META_TEXT_MODEL: 'muse-spark-9.9' }, l.spender, readingTask, { text: 'x' }, (async () => { sent = true; return ok('{}'); }) as unknown as typeof fetch), ModelNotAllowed);
  await assert.rejects(generateImage({ ...env, META_IMAGE_MODEL: 'other-image' }, l.spender, 'p', '1024x1536', (async () => { sent = true; return ok('{}'); }) as unknown as typeof fetch), ModelNotAllowed);
  assert.equal(sent, false);
  assert.equal(l.total(), 0);
});

test('malformed usage numbers keep the full reservation', async () => {
  const max = sparkMaxCost(Math.ceil(2000 * INPUT_COUNT_MARGIN) + INPUT_COUNT_PAD, readingTask.maxOutputTokens + 1500);
  const bad = [
    { input_tokens: -5, output_tokens: 10 },
    { input_tokens: 10.5, output_tokens: 10 },
    { input_tokens: Number.NaN, output_tokens: 10 },
    { input_tokens: '100', output_tokens: 10 },
    { input_tokens: 100, output_tokens: -1 },
    { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 200 } },
    { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: -1 } },
  ];
  for (const usage of bad) {
    const l = ledger();
    // JSON cannot carry NaN; send it through a hand-built object instead.
    const body = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reading) }] }], usage };
    const { f } = withCount(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response));
    await runTask(env, l.spender, readingTask, { text: 'x' }, f);
    assert.ok(Math.abs(l.total() - max) < 1e-12, `usage ${JSON.stringify(usage)}`);
  }
  const good = ledger();
  const { f } = withCount(async () => response({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reading) }] }], usage: { input_tokens: 2000, output_tokens: 100, input_tokens_details: { cached_tokens: 500 } } }));
  await runTask(env, good.spender, readingTask, { text: 'x' }, f);
  assert.ok(good.total() < max, 'valid usage settles to the real, smaller cost');
});

test('reported audio duration must be valid and consistent with the WAV', async () => {
  const reserved = (5 / 3600) * 0.18; // 4.2 s rounds up to 5 s
  for (const audioDurationMs of [0, -100, 'x', null, 60_000, 1000]) {
    const l = ledger();
    const body = { transcript: 'hi', audioDurationMs };
    await transcribe(env, l.spender, wavBytes(4.2), [], (async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response)) as unknown as typeof fetch);
    assert.ok(Math.abs(l.total() - reserved) < 1e-12, `reported ${String(audioDurationMs)}`);
  }
  const ok4 = ledger();
  await transcribe(env, ok4.spender, wavBytes(4.2), [], (async () => response({ transcript: 'hi', audioDurationMs: 4200 })) as unknown as typeof fetch);
  assert.ok(Math.abs(ok4.total() - (4 / 3600) * 0.18) < 1e-12, 'a consistent duration settles to whole seconds');
});

test('SAM image count must be a positive integer, otherwise one image stays charged', async () => {
  for (const images_processed of [0, -1, 1.5, 'x', undefined]) {
    const l = ledger();
    const body = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '' }] }], usage: { images_processed } };
    await segmentBoxes(env, l.spender, 'data:image/jpeg;base64,AA', 'monitor', (async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response)) as unknown as typeof fetch);
    assert.ok(Math.abs(l.total() - 0.0025) < 1e-12, `images_processed ${String(images_processed)}`);
  }
});

test('a transient token-count failure is retried once (counting is unbilled)', async () => {
  let counts = 0;
  const f = (async (url: string) => {
    if (url.endsWith('/input_tokens')) { counts++; return counts === 1 ? response({ error: { message: 'oops', type: 'server_error', code: null } }, 500) : response({ object: 'response.input_tokens', input_tokens: 1000 }); }
    return ok(JSON.stringify(reading));
  }) as unknown as typeof fetch;
  await runTask(env, ledger().spender, readingTask, { text: 'x' }, f);
  assert.equal(counts, 2);
  let bad = 0;
  const g = (async (url: string) => { if (url.endsWith('/input_tokens')) { bad++; return response({ error: { message: 'bad', type: 'invalid_request_error', code: null } }, 400); } return ok('{}'); }) as unknown as typeof fetch;
  await assert.rejects(runTask(env, ledger().spender, readingTask, { text: 'x' }, g), CostUnverifiable);
  assert.equal(bad, 1, 'a 400 is not retried');
});
