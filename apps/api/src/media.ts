// Client for the Modal media service (open-source TTS + ffmpeg composition).
// Jobs are started, then polled from a Durable Object alarm because Modal web
// requests time out after ~150 s.

export interface MediaEnv {
  MODAL_MEDIA_URL?: string;
  MODAL_MEDIA_TOKEN?: string;
  COEVO_ALLOW_LIVE_CALLS?: string;
  COEVO_TEST_FAKE_META?: string;
}

export class MediaUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'MediaUnavailable'; }
}

export function mediaConfigured(env: MediaEnv): boolean {
  const local = env.COEVO_TEST_FAKE_META === 'true' && Boolean(env.MODAL_MEDIA_URL?.startsWith('http://127.0.0.1:'));
  return Boolean((env.MODAL_MEDIA_URL?.startsWith('https://') || local) && env.MODAL_MEDIA_TOKEN?.trim());
}

export interface PodcastJob { kind: 'podcast'; lines: { speaker: 'caddie' | 'guest'; text: string }[]; voices: { caddie: string; guest: string } }

export interface ShortJobScene { role: string; narration: string; imageB64: string | null; diagram: { nodes: string[] } | null; label: string | null }

export interface ShortJob { kind: 'short'; title: string; voice: string; scenes: ShortJobScene[] }

export type MediaJob = PodcastJob | ShortJob;

export type JobResult =
  | { status: 'running' }
  | { status: 'done'; bytes: Uint8Array; mime: string; durationSec: number; timings: { index: number; start: number; end: number }[]; renderTiming: Record<string, number | boolean> | null }
  | { status: 'failed'; error: string };

function guard(env: MediaEnv): void {
  if (env.COEVO_ALLOW_LIVE_CALLS !== 'true') throw new MediaUnavailable('Live media rendering is disabled on this server.');
  if (!mediaConfigured(env)) throw new MediaUnavailable('The media service is not configured.');
}

/** The renderer's ingress refuses bodies over 12,000,000 bytes; stay clear of it. */
export const MAX_JOB_BYTES = 11_500_000;

export async function startJob(env: MediaEnv, job: MediaJob, f: typeof fetch = fetch): Promise<string> {
  guard(env);
  const body = JSON.stringify(job);
  // Size, timing and status only; never the job's text or images.
  const log = (extra: Record<string, unknown>) => console.log(JSON.stringify({ event: 'media_dispatch', kind: job.kind, bytes: body.length, ...extra }));
  if (body.length > MAX_JOB_BYTES) {
    log({ ok: false, reason: 'too_large' });
    throw new MediaUnavailable(`This ${job.kind} is too large to render (${(body.length / 1e6).toFixed(1)} MB). Retry to make it again.`);
  }
  const t0 = Date.now();
  let res: Response;
  try {
    res = await f(`${env.MODAL_MEDIA_URL}/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.MODAL_MEDIA_TOKEN}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    log({ ok: false, ms: Date.now() - t0, error: (e as Error).name });
    throw e;
  }
  log({ ok: res.ok, ms: Date.now() - t0, status: res.status });
  if (!res.ok) throw new MediaUnavailable(`Media service rejected the job (${res.status}).`);
  const data = (await res.json()) as { job_id?: string };
  if (!data.job_id) throw new MediaUnavailable('Media service returned no job id.');
  return data.job_id;
}

export async function pollJob(env: MediaEnv, jobId: string, f: typeof fetch = fetch): Promise<JobResult> {
  guard(env);
  const res = await f(`${env.MODAL_MEDIA_URL}/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${env.MODAL_MEDIA_TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 202) return { status: 'running' };
  const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string; mime?: string; data_b64?: string; duration?: number; timings?: { index: number; start: number; end: number }[]; timing_s?: Record<string, number | boolean> };
  if (!res.ok || data.status === 'failed') return { status: 'failed', error: data.error ?? `Media job failed (${res.status}).` };
  if (data.status !== 'done' || !data.data_b64) return { status: 'running' };
  const bytes = Uint8Array.from(atob(data.data_b64), c => c.charCodeAt(0));
  return { status: 'done', bytes, mime: data.mime ?? 'application/octet-stream', durationSec: data.duration ?? 0, timings: data.timings ?? [], renderTiming: data.timing_s ?? null };
}
