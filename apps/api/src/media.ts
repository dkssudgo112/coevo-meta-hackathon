// Client for the Modal media service (open-source TTS + ffmpeg composition).
// Jobs are started, then polled from a Durable Object alarm because Modal web
// requests time out after ~150 s.

export interface MediaEnv {
  MODAL_MEDIA_URL?: string;
  MODAL_MEDIA_TOKEN?: string;
  COEVO_ALLOW_LIVE_CALLS?: string;
}

export class MediaUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'MediaUnavailable'; }
}

export function mediaConfigured(env: MediaEnv): boolean {
  return Boolean(env.MODAL_MEDIA_URL?.startsWith('https://') && env.MODAL_MEDIA_TOKEN?.trim());
}

export interface PodcastJob { kind: 'podcast'; lines: { speaker: 'caddie' | 'guest'; text: string }[]; voices: { caddie: string; guest: string } }

export interface ShortJobScene { role: string; narration: string; imageB64: string | null; diagram: { nodes: string[] } | null; label: string | null }

export interface ShortJob { kind: 'short'; title: string; voice: string; scenes: ShortJobScene[] }

export type MediaJob = PodcastJob | ShortJob;

export type JobResult =
  | { status: 'running' }
  | { status: 'done'; bytes: Uint8Array; mime: string; durationSec: number; timings: { index: number; start: number; end: number }[] }
  | { status: 'failed'; error: string };

function guard(env: MediaEnv): void {
  if (env.COEVO_ALLOW_LIVE_CALLS !== 'true') throw new MediaUnavailable('Live media rendering is disabled on this server.');
  if (!mediaConfigured(env)) throw new MediaUnavailable('The media service is not configured.');
}

export async function startJob(env: MediaEnv, job: MediaJob, f: typeof fetch = fetch): Promise<string> {
  guard(env);
  const res = await f(`${env.MODAL_MEDIA_URL}/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.MODAL_MEDIA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(30_000),
  });
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
  const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string; mime?: string; data_b64?: string; duration?: number; timings?: { index: number; start: number; end: number }[] };
  if (!res.ok || data.status === 'failed') return { status: 'failed', error: data.error ?? `Media job failed (${res.status}).` };
  if (data.status !== 'done' || !data.data_b64) return { status: 'running' };
  const bytes = Uint8Array.from(atob(data.data_b64), c => c.charCodeAt(0));
  return { status: 'done', bytes, mime: data.mime ?? 'application/octet-stream', durationSec: data.duration ?? 0, timings: data.timings ?? [] };
}
