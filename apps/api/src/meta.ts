// Meta Model API adapter (server-only). Standard models only.
// Every call: live-call switch → budget reservation → bounded retry → strict parsing → settle cost.

import type { ModelTask } from '../../../packages/core/src/prompts.ts';
import { parseJsonText, ShapeError } from '../../../packages/core/src/schema.ts';
import { isPriced, PRICED_MODELS, sparkCost, sparkMaxCost, transcribeCost, verifiedAudioSeconds, verifiedImageCount, verifiedSparkUsage, type Operation } from '../../../packages/core/src/budget.ts';
import { parseWav } from '../../../packages/core/src/wav.ts';

export interface MetaEnv {
  MODEL_API_KEY?: string;
  META_API_BASE_URL?: string;
  META_TEXT_MODEL?: string;
  META_IMAGE_MODEL?: string;
  META_TRANSCRIBE_MODEL?: string;
  META_SEGMENT_MODEL?: string;
  COEVO_ALLOW_LIVE_CALLS?: string;
  /** Local development only: route calls to a scripted fake server on 127.0.0.1. Output is labeled fixture. */
  COEVO_TEST_FAKE_META?: string;
}

/** True only for local test runs against the scripted fake model server. */
export function fakeMeta(env: MetaEnv): boolean {
  return env.COEVO_TEST_FAKE_META === 'true' && (env.META_API_BASE_URL ?? '').startsWith('http://127.0.0.1:');
}

/** Provenance for model output: fixture under the fake server, live-model otherwise. */
export function modelProvenance(env: MetaEnv): 'live-model' | 'fixture' {
  return fakeMeta(env) ? 'fixture' : 'live-model';
}

export interface Spender {
  /** Reserve an estimated cost; throws BudgetExceeded when over a cap. */
  reserve(estimateUsd: number, label: string): Promise<string>;
  /** Replace the reservation with the actual cost (0 when the call failed unbilled). */
  settle(ticket: string, actualUsd: number): Promise<void>;
}

export class LiveCallsDisabled extends Error {
  constructor() { super('Live model calls are disabled on this server.'); this.name = 'LiveCallsDisabled'; }
}

export class BudgetExceeded extends Error {
  readonly scope: string;
  constructor(scope: string) { super(`Budget cap reached (${scope}).`); this.name = 'BudgetExceeded'; this.scope = scope; }
}

export class MetaError extends Error {
  readonly status: number;
  readonly type: string | null;
  readonly code: string | null;
  constructor(status: number, message: string, type: string | null, code: string | null) {
    super(message);
    this.name = 'MetaError';
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

export class InvalidOutput extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidOutput'; }
}

/** The input cost could not be verified with the token-count endpoint, so the call was not made. */
export class CostUnverifiable extends Error {
  constructor(message: string) { super(message); this.name = 'CostUnverifiable'; }
}

/** The provider asked us to wait longer than we can block for. Surface "try later". */
export class RetryLater extends Error {
  readonly waitSeconds: number;
  constructor(waitSeconds: number) { super(`The model service asked to wait ${Math.ceil(waitSeconds)} s.`); this.name = 'RetryLater'; this.waitSeconds = waitSeconds; }
}

/**
 * Only outcomes the provider documents as unbilled may be refunded to $0:
 * calls never sent, 4xx rejections, and 503 overload/shutdown. Timeouts, lost
 * responses, malformed bodies, 500 and 504 may have completed and been billed,
 * so their reservation is kept.
 */
export function unbilled(e: unknown): boolean {
  if (e instanceof LiveCallsDisabled || e instanceof BudgetExceeded || e instanceof RetryLater || e instanceof CostUnverifiable || e instanceof ModelNotAllowed || e instanceof InvalidAudio) return true;
  if (e instanceof MetaError) return (e.status >= 400 && e.status < 500) || e.status === 503;
  return false;
}

/** Parse Retry-After (delta-seconds or HTTP-date) into seconds; null when absent or invalid. */
export function retryAfterSeconds(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, (at - nowMs) / 1000) : null;
}

/** Longest delay we will block a request for before surfacing RetryLater. */
export const MAX_BLOCKING_WAIT_S = 10;

const FORBIDDEN = /-contributor$/;

/** The configured model is not on the priced allowlist for this operation. Fails closed, nothing sent. */
export class ModelNotAllowed extends Error {
  constructor(op: string, model: string) { super(`Model "${model}" is not on the priced allowlist for ${op}.`); this.name = 'ModelNotAllowed'; }
}

/** The audio is not a valid 16/24 kHz mono 16-bit PCM WAV, so its cost cannot be verified. */
export class InvalidAudio extends Error {
  constructor() { super('The recording could not be read as 16-bit mono WAV.'); this.name = 'InvalidAudio'; }
}

export function liveEnabled(env: MetaEnv): boolean {
  return env.COEVO_ALLOW_LIVE_CALLS === 'true' && (fakeMeta(env) || Boolean(env.MODEL_API_KEY?.trim()));
}

/** The real key never leaves for the local fake server. */
function authKey(env: MetaEnv): string {
  return fakeMeta(env) ? 'fake-test-key' : env.MODEL_API_KEY!;
}

function model(op: Operation, name: string | undefined, fallback: string): string {
  const m = (name ?? fallback).trim();
  if (FORBIDDEN.test(m)) throw new Error('Contributor model variants are not allowed for user data.');
  if (!isPriced(op, m)) throw new ModelNotAllowed(op, m);
  return m;
}

export const models = (env: MetaEnv) => ({
  text: model('text', env.META_TEXT_MODEL, 'muse-spark-1.3'),
  image: model('image', env.META_IMAGE_MODEL, 'muse-image-1.0'),
  transcribe: model('transcribe', env.META_TRANSCRIBE_MODEL, 'muse-voice-transcribe-1.0'),
  segment: model('segment', env.META_SEGMENT_MODEL, 'sam-3.1'),
});

const IMAGE_USD = PRICED_MODELS.image['muse-image-1.0'].each;
const SAM_USD = PRICED_MODELS.segment['sam-3.1'].perImage;

function base(env: MetaEnv): string {
  const b = env.META_API_BASE_URL ?? 'https://api.meta.ai/v1';
  if (fakeMeta(env)) return b.replace(/\/$/, '');
  if (b !== 'https://api.meta.ai/v1') throw new Error('Only the verified Meta endpoint is allowed.');
  return b;
}

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * POST with bounded retries for documented unbilled rejections only (429, 503),
 * honoring Retry-After in full. Never retries 500/504 or transport failures,
 * which may have been billed: the caller owns that decision and its budget.
 */
async function post(env: MetaEnv, path: string, body: BodyInit, headers: Record<string, string>, f: Fetch, timeoutMs: number): Promise<unknown> {
  if (!liveEnabled(env)) throw new LiveCallsDisabled();
  let attempt = 0;
  for (;;) {
    const res = await f(`${base(env)}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authKey(env)}`, Accept: 'application/json', ...headers },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return res.json();
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; type?: string; code?: string } };
    const err = new MetaError(res.status, data.error?.message ?? `Meta API error ${res.status}`, data.error?.type ?? null, data.error?.code ?? null);
    if (!(res.status === 429 || res.status === 503) || attempt >= 2) throw err;
    const asked = retryAfterSeconds(res.headers.get('retry-after'));
    const wait = asked ?? 0.8 * 2 ** attempt;
    if (wait > MAX_BLOCKING_WAIT_S) throw new RetryLater(wait);
    attempt++;
    await sleep(wait * 1000);
  }
}

interface ResponsesOutput {
  status?: string;
  output?: { type: string; phase?: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; images_processed?: number };
  incomplete_details?: { reason?: string } | null;
}

export function outputText(r: ResponsesOutput): string {
  let text = '';
  for (const item of r.output ?? []) {
    if (item.type !== 'message' || item.phase === 'commentary') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'refusal') throw new InvalidOutput(`Model refused: ${part.refusal ?? ''}`.trim());
      if (part.type === 'output_text' && part.text) text += part.text;
    }
  }
  return text;
}

const HEADROOM = { minimal: 400, low: 1500, medium: 3500, high: 6000 } as const;

export interface TaskInput { text: string; images?: string[] }

export interface TaskResult<T> { value: T; costUsd: number; model: string; latencyMs: number; countMs: number; calls: number }

/** Safety margin on top of the provider's input-token count (documented for context checks, not billing). */
export const INPUT_COUNT_MARGIN = 1.1;
export const INPUT_COUNT_PAD = 64;

/**
 * Count input tokens with the documented endpoint (tokenizes only; records no
 * generation usage). Any failure means the cost is unverifiable and the
 * generation must not be sent.
 */
export async function countInputTokens(env: MetaEnv, body: Record<string, unknown>, f: Fetch = fetch): Promise<number> {
  let data: { input_tokens?: unknown };
  try {
    try {
      data = (await post(env, '/responses/input_tokens', JSON.stringify(body), { 'Content-Type': 'application/json' }, f, 20_000)) as { input_tokens?: unknown };
    } catch (first) {
      // Counting records no generation usage, so one retry after a transient failure costs nothing.
      if (first instanceof LiveCallsDisabled || first instanceof RetryLater || (first instanceof MetaError && first.status < 500 && first.status !== 429)) throw first;
      await sleep(1000);
      data = (await post(env, '/responses/input_tokens', JSON.stringify(body), { 'Content-Type': 'application/json' }, f, 20_000)) as { input_tokens?: unknown };
    }
  } catch (e) {
    if (e instanceof LiveCallsDisabled) throw e;
    const detail = e instanceof MetaError ? { status: e.status, type: e.type, code: e.code, message: e.message.slice(0, 200) } : { name: (e as Error).name };
    console.error(JSON.stringify({ event: 'count_failed', task: (body.text as { format?: { name?: string } } | undefined)?.format?.name ?? null, ...detail }));
    throw new CostUnverifiable(`Input tokens could not be counted (${e instanceof MetaError ? e.status : (e as Error).name}).`);
  }
  const n = data.input_tokens;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new CostUnverifiable('The token count response had no usable input_tokens.');
  return n;
}

/**
 * Run a structured Spark task. Before EVERY attempt: count input tokens, then
 * reserve the exact maximum (counted input × margin + max output incl. reasoning)
 * in the lifetime ledger. Settle to real usage only when usage is reported in
 * full; otherwise the maximum stays charged. One extra attempt only when the
 * output fails validation (that attempt is counted and reserved again).
 */
export async function runTask<T>(env: MetaEnv, spend: Spender, task: ModelTask<T>, input: TaskInput, f: Fetch = fetch): Promise<TaskResult<T>> {
  if (!liveEnabled(env)) throw new LiveCallsDisabled();
  const m = models(env).text;
  const maxOut = task.maxOutputTokens + HEADROOM[task.effort];
  const content: unknown[] = [{ type: 'input_text', text: input.text }];
  for (const url of input.images ?? []) content.push({ type: 'input_image', image_url: url, detail: 'high' });
  const shared = {
    model: m,
    instructions: task.instructions,
    input: [{ type: 'message', role: 'user', content }],
    text: { format: { type: 'json_schema', name: task.name, schema: task.schema, strict: true } },
    reasoning: { effort: task.effort },
  };
  const body = JSON.stringify({ ...shared, max_output_tokens: maxOut, store: false });
  let lastError: Error | null = null;
  let countMs = 0;
  let calls = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const c0 = Date.now();
    const counted = await countInputTokens(env, shared, f);
    countMs += Date.now() - c0;
    calls += 2;
    const maxCost = sparkMaxCost(Math.ceil(counted * INPUT_COUNT_MARGIN) + INPUT_COUNT_PAD, maxOut);
    const ticket = await spend.reserve(maxCost, task.name);
    const started = Date.now();
    let raw: ResponsesOutput;
    try {
      raw = (await post(env, '/responses', body, { 'Content-Type': 'application/json' }, f, 60_000)) as ResponsesOutput;
    } catch (e) {
      // Keep the reservation unless the provider documents the outcome as unbilled.
      if (unbilled(e)) await spend.settle(ticket, 0);
      throw e;
    }
    // Missing, partial or malformed usage never turns an accepted call into a smaller charge.
    const usage = verifiedSparkUsage(raw.usage);
    const cost = usage ? sparkCost(usage) : maxCost;
    await spend.settle(ticket, cost);
    try {
      if (raw.status === 'incomplete') throw new InvalidOutput(`Incomplete output (${raw.incomplete_details?.reason ?? 'unknown'})`);
      const value = task.read(parseJsonText(outputText(raw)));
      return { value, costUsd: cost, model: m, latencyMs: Date.now() - started, countMs, calls };
    } catch (e) {
      lastError = e instanceof ShapeError || e instanceof SyntaxError ? new InvalidOutput(`Invalid ${task.name} output: ${(e as Error).message}`) : (e as Error);
      if (!(lastError instanceof InvalidOutput) || attempt === 1) throw lastError;
    }
  }
  throw lastError ?? new InvalidOutput('Unknown');
}

/** Generate one image. Returns raw bytes (PNG). */
export async function generateImage(env: MetaEnv, spend: Spender, prompt: string, size: '1024x1536' | '1024x1024' | '1536x1024', f: Fetch = fetch): Promise<{ bytes: Uint8Array; mime: string; costUsd: number }> {
  const imageModel = models(env).image;
  const ticket = await spend.reserve(IMAGE_USD, 'image');
  try {
    const data = (await post(env, '/images/generations', JSON.stringify({
      model: imageModel, prompt, n: 1, size, response_format: 'b64_json', output_format: 'png', reasoning_strength: 'low',
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    }), { 'Content-Type': 'application/json' }, f, 120_000)) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new InvalidOutput('Image response had no data.');
    await spend.settle(ticket, IMAGE_USD);
    return { bytes: Uint8Array.from(atob(b64), c => c.charCodeAt(0)), mime: 'image/png', costUsd: IMAGE_USD };
  } catch (e) {
    await spend.settle(ticket, unbilled(e) ? 0 : IMAGE_USD);
    throw e;
  }
}

/**
 * Keyword hints for the recognizer: unique single words from the screen
 * (letters/digits only, 3–24 chars, at most 10). Phrases are split into words.
 */
export function transcribeKeywords(raw: string[]): string[] {
  const out: string[] = [];
  for (const phrase of raw) {
    for (const w of phrase.normalize('NFKC').split(/[^\p{L}\p{N}]+/u)) {
      if (w.length < 3 || w.length > 24 || out.some(x => x.toLowerCase() === w.toLowerCase())) continue;
      out.push(w);
      if (out.length === 10) return out;
    }
  }
  return out;
}

/** Transcribe 16/24 kHz mono 16-bit WAV. A request rejected with keyword hints is retried once without them. */
export async function transcribe(env: MetaEnv, spend: Spender, wav: Uint8Array, keywords: string[] = [], f: Fetch = fetch): Promise<{ transcript: string; durationMs: number; costUsd: number }> {
  if (!liveEnabled(env)) throw new LiveCallsDisabled();
  const transcribeModel = models(env).transcribe;
  // Duration (and therefore cost) comes from the validated WAV bytes, never from the client.
  const info = parseWav(wav);
  if (!info) throw new InvalidAudio();
  const durationSec = info.seconds;
  if (durationSec > 120) throw new InvalidOutput('Voice answers are limited to 2 minutes.');
  const estimate = transcribeCost(Math.ceil(durationSec));
  const once = async (hints: string[]) => {
    const ticket = await spend.reserve(estimate, 'transcribe');
    const fd = new FormData();
    fd.append('request', new Blob([JSON.stringify({ model: transcribeModel, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['English'], ...(hints.length ? { keywords: hints } : {}) })], { type: 'application/json' }));
    fd.append('audio', new Blob([wav], { type: 'audio/wav' }), 'answer.wav');
    try {
      const data = (await post(env, '/asr/transcribe', fd, {}, f, 60_000)) as { transcript?: string; audioDurationMs?: unknown };
      // A missing, malformed or contradictory reported duration keeps the WAV-based reservation.
      const reportedSec = verifiedAudioSeconds(data.audioDurationMs, durationSec);
      const cost = reportedSec === null ? estimate : Math.min(estimate, transcribeCost(Math.floor(reportedSec)));
      await spend.settle(ticket, cost);
      return { transcript: (typeof data.transcript === 'string' ? data.transcript : '').trim(), durationMs: Math.round((reportedSec ?? durationSec) * 1000), costUsd: cost };
    } catch (e) {
      if (unbilled(e)) await spend.settle(ticket, 0);
      const detail = e instanceof MetaError ? { status: e.status, type: e.type, code: e.code, message: e.message.slice(0, 200) } : { name: (e as Error).name };
      console.error(JSON.stringify({ event: 'transcribe_failed', keywordCount: hints.length, seconds: Math.round(durationSec), ...detail }));
      throw e;
    }
  };
  const hints = transcribeKeywords(keywords);
  try {
    return await once(hints);
  } catch (e) {
    if (hints.length && e instanceof MetaError && e.status === 400) return once([]);
    throw e;
  }
}

export interface Box { x1: number; y1: number; x2: number; y2: number; w: number; h: number; c: number | null }

/** Parse SAM 3.1 special-token output into boxes. Masks are ignored on purpose. */
export function parseSamBoxes(text: string): Box[] {
  const boxes: Box[] = [];
  const re = /<\|box;([^|]*)\|>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const kv = Object.fromEntries(m[1].split(';').map(p => p.split('=') as [string, string]));
    const n = (k: string) => Number(kv[k]);
    if ([n('x1'), n('y1'), n('x2'), n('y2'), n('w'), n('h')].some(v => !Number.isFinite(v))) continue;
    boxes.push({ x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2'), w: n('w'), h: n('h'), c: kv.c !== undefined ? Number(kv.c) : null });
  }
  return boxes;
}

/** Find objects matching a noun phrase. Returns pixel boxes in source-image coordinates. */
export async function segmentBoxes(env: MetaEnv, spend: Spender, imageDataUrl: string, phrase: string, f: Fetch = fetch): Promise<{ boxes: Box[]; costUsd: number; latencyMs: number }> {
  const segmentModel = models(env).segment;
  const ticket = await spend.reserve(SAM_USD, 'segment');
  const started = Date.now();
  try {
    const raw = (await post(env, '/responses', JSON.stringify({
      model: segmentModel,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: phrase }, { type: 'input_image', image_url: imageDataUrl }] }],
      metadata: { mask_encoding: 'one_bit', include_confidence: 'true' },
      store: false,
    }), { 'Content-Type': 'application/json' }, f, 30_000)) as ResponsesOutput;
    const processed = verifiedImageCount(raw.usage?.images_processed);
    await spend.settle(ticket, processed === null ? SAM_USD : SAM_USD * processed);
    return { boxes: parseSamBoxes(outputText(raw)), costUsd: SAM_USD, latencyMs: Date.now() - started };
  } catch (e) {
    if (unbilled(e)) await spend.settle(ticket, 0);
    throw e;
  }
}
