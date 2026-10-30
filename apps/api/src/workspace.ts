// One Durable Object per paired phone + Desk. All state for a workspace lives
// here, so workspaces are isolated by construction.

import { DurableObject } from 'cloudflare:workers';
import type { CaptureSource, CropRect, FrameRef, Moment, PodcastPayload, ServerEvent, Session, ShortPayload, Snapshot, WorkspaceSummary } from '../../../packages/contracts/index.ts';
import { CAPS, charge, dayKey, remaining, type BudgetState } from '../../../packages/core/src/budget.ts';
import { wavDurationSeconds } from '../../../packages/core/src/wav.ts';
import { BudgetExceeded, fakeMeta, liveEnabled, segmentBoxes, transcribe, type Spender } from './meta.ts';
import { pollJob } from './media.ts';
import { followUp, failureStatus, processMoment, sessionMoments, type Ctx } from './pipeline.ts';
import { cardAction, generate, podcastAsk, practiceAttempt, reviewFlashcard, startPractice, wrapSession, type CardAction } from './content.ts';
import { Store } from './store.ts';
import type { Env } from './env.ts';
import { bearer, bytesToDataUrl, error, id, imageSize, json, MAX_AUDIO_BYTES, MAX_FRAME_BYTES, now, secret, sha256 } from './util.ts';

type Role = 'desk' | 'phone';

interface Meta {
  id: string;
  kind: 'user' | 'sample';
  createdAt: string;
  tokens: Record<string, Role>;
  pairSecretHash: string | null;
  pairExpiresAt: number;
  paired: boolean;
}

interface Job { contentId: string; jobId: string; startedAt: number }

const IDLE_END_MS = 10 * 60_000;
const STUCK_MS = 6 * 60_000;
const JOB_TIMEOUT_MS = 12 * 60_000;
const MIN_FRAME_GAP_MS = 2500;

export class Workspace extends DurableObject<Env> {
  private store: Store;
  private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private meta: Meta | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lastFrameAt = 0;
  private reservations = new Map<string, number>();
  private encoder = new TextEncoder();
  private pinger: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage, e => this.broadcast(e));
  }

  // ------------------------------------------------------------ infra

  private async loadMeta(): Promise<Meta | null> {
    if (!this.meta) this.meta = (await this.ctx.storage.get<Meta>('meta')) ?? null;
    await this.store.load();
    return this.meta;
  }

  private async saveMeta(): Promise<void> {
    if (this.meta) await this.ctx.storage.put('meta', this.meta);
  }

  private broadcast(e: ServerEvent): void {
    const data = this.encoder.encode(`data: ${JSON.stringify(e)}\n\n`);
    for (const w of this.clients) w.write(data).catch(() => this.clients.delete(w));
  }

  private notice(level: 'info' | 'warn', code: string, message: string): void {
    this.broadcast({ type: 'notice', level, code, message });
  }

  private async budgetState(): Promise<BudgetState> {
    return (await this.ctx.storage.get<BudgetState>('budget')) ?? { day: dayKey(Date.now()), spentUsd: 0 };
  }

  private cap(): number {
    return this.meta?.kind === 'sample' ? CAPS.sampleWorkspaceUsd : CAPS.workspacePerDayUsd;
  }

  private spender(): Spender {
    return {
      reserve: async (usd, label) => {
        const st = await this.budgetState();
        // Sample workspaces have a lifetime cap, user workspaces a daily cap.
        const left = this.meta?.kind === 'sample' ? Math.max(0, this.cap() - st.spentUsd) : remaining(st, this.cap(), Date.now());
        if (left < usd) throw new BudgetExceeded('workspace');
        const global = this.env.BUDGET.get(this.env.BUDGET.idFromName('global'));
        if (!(await global.reserve(usd))) throw new BudgetExceeded('global');
        await this.ctx.storage.put('budget', this.meta?.kind === 'sample' ? { day: st.day, spentUsd: st.spentUsd + usd } : charge(st, usd, Date.now()));
        const ticket = `${label}:${id('t')}`;
        this.reservations.set(ticket, usd);
        return ticket;
      },
      settle: async (ticket, actual) => {
        const reserved = this.reservations.get(ticket) ?? 0;
        this.reservations.delete(ticket);
        const delta = actual - reserved;
        if (Math.abs(delta) < 1e-9) return;
        const st = await this.budgetState();
        await this.ctx.storage.put('budget', { day: st.day, spentUsd: Math.max(0, st.spentUsd + delta) });
        await this.env.BUDGET.get(this.env.BUDGET.idFromName('global')).adjust(delta);
        this.broadcast({ type: 'workspace', workspace: await this.summary() });
      },
    };
  }

  private context(): Ctx {
    return {
      env: this.env,
      wsId: this.meta!.id,
      store: this.store,
      spender: this.spender(),
      r2: this.env.MEDIA,
      memory: async () => (await this.ctx.storage.get<string[]>('memory')) ?? [],
      remember: async fact => {
        const mem = (await this.ctx.storage.get<string[]>('memory')) ?? [];
        await this.ctx.storage.put('memory', [...mem, fact.slice(0, 300)].slice(-30));
      },
      notice: (l, c, m) => this.notice(l, c, m),
      trackJob: async (contentId, jobId) => {
        const jobs = (await this.ctx.storage.get<Job[]>('jobs')) ?? [];
        await this.ctx.storage.put('jobs', [...jobs.filter(j => j.contentId !== contentId), { contentId, jobId, startedAt: Date.now() }]);
        await this.schedule(5_000);
      },
    };
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch(e => this.notice('warn', 'task-failed', e instanceof Error ? e.message : 'A background task failed.'));
    this.ctx.waitUntil(this.queue);
  }

  private async schedule(inMs: number): Promise<void> {
    const at = Date.now() + inMs;
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }

  private async summary(): Promise<WorkspaceSummary> {
    const st = await this.budgetState();
    return {
      id: this.meta!.id, createdAt: this.meta!.createdAt, kind: this.meta!.kind, paired: this.meta!.paired,
      liveCalls: liveEnabled(this.env),
      testFakeModels: fakeMeta(this.env),
      budget: { spentUsd: Number((this.meta!.kind === 'sample' || st.day === dayKey(Date.now()) ? st.spentUsd : 0).toFixed(4)), capUsd: this.cap() },
    };
  }

  private async snapshot(): Promise<Snapshot> {
    return {
      workspace: await this.summary(),
      sessions: this.store.list('session'), moments: this.store.list('moment'), cards: this.store.list('card'),
      content: this.store.list('content'), practice: this.store.list('practice'), inbox: this.store.list('inbox'), skills: this.store.list('skill'),
    };
  }

  private async auth(req: Request): Promise<Role | null> {
    const t = bearer(req);
    if (!t || !this.meta) return null;
    return this.meta.tokens[await sha256(t)] ?? null;
  }

  // ------------------------------------------------------------ alarm

  async alarm(): Promise<void> {
    if (!(await this.loadMeta())) return;
    const ctx = this.context();
    let next: number | null = null;
    const jobs = (await this.ctx.storage.get<Job[]>('jobs')) ?? [];
    const remainingJobs: Job[] = [];
    for (const job of jobs) {
      const item = this.store.get('content', job.contentId);
      if (!item) continue;
      if (Date.now() - job.startedAt > JOB_TIMEOUT_MS) {
        await this.store.put('content', { ...item, status: 'failed', error: 'Rendering took too long. Retry to render again.', updatedAt: now() });
        continue;
      }
      try {
        const r = await pollJob(this.env, job.jobId);
        if (r.status === 'running') { remainingJobs.push(job); continue; }
        if (r.status === 'failed') { await this.store.put('content', { ...item, status: 'failed', error: r.error, updatedAt: now() }); continue; }
        const ext = item.format === 'podcast' ? 'm4a' : 'mp4';
        const key = `w/${this.meta!.id}/media/${item.id}-${item.attempts}.${ext}`;
        await this.env.MEDIA.put(key, r.bytes, { httpMetadata: { contentType: r.mime } });
        const fresh = this.store.get('content', item.id)!;
        if (fresh.format === 'podcast') {
          const p = fresh.payload as PodcastPayload;
          const lines = p.lines.map((l, i) => { const t = r.timings.find(x => x.index === i); return t ? { ...l, start: t.start, end: t.end } : l; });
          await this.store.put('content', { ...fresh, status: 'ready', payload: { ...p, lines, audioKey: key, durationSec: r.durationSec }, updatedAt: now() });
        } else {
          const p = fresh.payload as ShortPayload;
          const scenes = p.scenes.map((s, i) => { const t = r.timings.find(x => x.index === i); return t ? { ...s, start: t.start, end: t.end } : s; });
          await this.store.put('content', { ...fresh, status: 'ready', payload: { ...p, scenes, videoKey: key, durationSec: r.durationSec }, updatedAt: now() });
        }
      } catch (e) {
        if (Date.now() - job.startedAt < JOB_TIMEOUT_MS) remainingJobs.push(job);
        else await this.store.put('content', { ...item, status: 'failed', error: failureStatus(e).message, updatedAt: now() });
      }
    }
    await this.ctx.storage.put('jobs', remainingJobs);
    if (remainingJobs.length) next = 5_000;

    // Watchdog: generation that never finished (e.g. the object was evicted).
    for (const c of this.store.list('content')) {
      if (c.status === 'generating' && !remainingJobs.some(j => j.contentId === c.id) && Date.now() - Date.parse(c.updatedAt) > STUCK_MS) {
        await this.store.put('content', { ...c, status: 'failed', error: 'Generation was interrupted. Retry to make it again.', updatedAt: now() });
      }
    }
    // Idle sessions end on their own and get wrapped.
    for (const s of this.store.list('session')) {
      if (s.status !== 'live') continue;
      const last = sessionMoments(this.store, s.id).at(-1);
      const lastAt = Date.parse(last?.at ?? s.startedAt);
      if (Date.now() - lastAt > IDLE_END_MS) {
        await this.store.put('session', { ...s, status: 'ended', endedAt: now() });
        this.enqueue(() => wrapSession(ctx, s.id));
      } else next = Math.min(next ?? Infinity, IDLE_END_MS - (Date.now() - lastAt) + 1000);
    }
    if (this.store.list('content').some(c => c.status === 'generating')) next = Math.min(next ?? Infinity, 60_000);
    if (next !== null && Number.isFinite(next)) await this.ctx.storage.setAlarm(Date.now() + next);
  }

  // ------------------------------------------------------------ routing

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/w\/[^/]+/, '') || '/';
    const method = req.method;
    const meta = await this.loadMeta();

    if (path === '/init' && method === 'POST') return this.init(req, url);
    if (!meta) return error(404, 'not_found', 'Unknown workspace.');
    if (path === '/pair' && method === 'POST') return this.pair(req);

    const role = await this.auth(req);
    if (!role) return error(401, 'unauthorized', 'Pair this device first.');
    const ctx = this.context();
    const seg = path.split('/').filter(Boolean);

    try {
      if (path === '/events' && method === 'GET') return this.events();
      if (path === '/state' && method === 'GET') return json(await this.snapshot());
      if (path === '/repair' && method === 'POST' && role === 'desk') return this.repair();
      if (seg[0] === 'media' && method === 'GET') return this.media(seg.slice(1).join('/'));

      if (seg[0] === 'sessions') {
        if (seg.length === 1 && method === 'POST') return json(await this.startSession(req));
        const s = this.store.get('session', seg[1]);
        if (!s) return error(404, 'not_found', 'Unknown session.');
        if (method === 'DELETE') { await this.deleteSession(s); return json({ ok: true }); }
        if (seg[2] === 'end' && method === 'POST') {
          if (s.status !== 'ended') await this.store.put('session', { ...s, status: 'ended', endedAt: now() });
          this.enqueue(() => wrapSession(ctx, s.id));
          return json({ ok: true });
        }
        if (seg[2] === 'wrap' && method === 'POST') { this.enqueue(() => wrapSession(ctx, s.id)); return json({ ok: true }); }
        if ((seg[2] === 'pause' || seg[2] === 'resume') && method === 'POST') {
          return json(await this.store.put('session', { ...s, status: seg[2] === 'pause' ? 'paused' : 'live' }));
        }
      }

      if (path === '/calibrate' && method === 'POST') return this.calibrate(req);
      if (seg[0] === 'frames' && seg.length === 1 && method === 'POST') return this.frame(req);
      if (seg[0] === 'frames' && seg[1] && method === 'DELETE') return this.deleteFrame(seg[1]);

      if (seg[0] === 'moments' && seg[2] === 'respond' && method === 'POST') return this.respond(req, seg[1]);

      if (seg[0] === 'cards' && seg[2] === 'action' && method === 'POST') {
        const body = (await req.json()) as { action: CardAction; text?: string };
        const r = await cardAction(ctx, seg[1], body.action, body.text);
        return 'error' in r ? error(409, r.error, 'That change is not allowed for this card.') : json(r);
      }

      if (seg[0] === 'inbox') {
        if (seg.length === 1 && method === 'POST') {
          const body = (await req.json()) as { kind: 'example-brief' | 'note'; text: string; refId?: string };
          if (!body.text?.trim() || body.text.length > 2000) return error(400, 'invalid_text', 'Nothing to send.');
          return json(await this.store.put('inbox', { id: id('in'), kind: body.kind === 'note' ? 'note' : 'example-brief', text: body.text.trim(), applyHint: null, refId: body.refId ?? null, at: now(), copiedAt: null }));
        }
        if (seg[2] === 'copied' && method === 'POST') return json(await this.store.update('inbox', seg[1], i => ({ ...i, copiedAt: now() })));
      }

      if (seg[0] === 'content' && seg[1]) {
        const item = this.store.get('content', seg[1]);
        if (!item) return error(404, 'not_found', 'Unknown content.');
        if (seg[2] === 'retry' && method === 'POST') {
          if (item.status !== 'failed' && item.status !== 'skipped') return error(409, 'not_retryable', 'Only failed or skipped items can be made again.');
          this.enqueue(() => generate(ctx, item.id));
          return json({ ok: true });
        }
        if (seg[2] === 'review' && method === 'POST') {
          const b = (await req.json()) as { cardId: string; result: 'applied' | 'unsure' };
          await reviewFlashcard(ctx, item.id, b.cardId, b.result === 'applied' ? 'applied' : 'unsure');
          return json({ ok: true });
        }
        if (seg[2] === 'ask' && method === 'POST') return this.ask(req, item.id);
      }

      if (seg[0] === 'practice') {
        if (seg.length === 1 && method === 'POST') {
          const b = (await req.json().catch(() => ({}))) as { autoOpened?: boolean; sessionId?: string };
          const p = await startPractice(ctx, Boolean(b.autoOpened), b.sessionId ?? null);
          return json(p);
        }
        const p = this.store.get('practice', seg[1]);
        if (!p) return error(404, 'not_found', 'Unknown practice.');
        if (seg[2] === 'hint' && method === 'POST') return json(await this.store.put('practice', { ...p, hintViewed: true }));
        if (seg[2] === 'attempt' && method === 'POST') {
          const wav = new Uint8Array(await req.arrayBuffer());
          if (wav.length > MAX_AUDIO_BYTES) return error(413, 'too_large', 'Keep the brief under two minutes.');
          this.enqueue(() => practiceAttempt(ctx, p.id, wav, wavDurationSeconds(wav)));
          return json({ ok: true });
        }
      }
      return error(404, 'not_found', 'Unknown route.');
    } catch (e) {
      if (e instanceof SyntaxError) return error(400, 'bad_request', 'Malformed request.');
      throw e;
    }
  }

  // ------------------------------------------------------------ handlers

  private async init(req: Request, url: URL): Promise<Response> {
    if (this.meta) return error(409, 'exists', 'Workspace already exists.');
    const b = (await req.json().catch(() => ({}))) as { kind?: 'user' | 'sample' };
    const deskToken = secret();
    const pairSecret = secret();
    const wsId = url.pathname.split('/')[3];
    this.meta = {
      id: wsId, kind: b.kind === 'sample' ? 'sample' : 'user', createdAt: now(),
      tokens: { [await sha256(deskToken)]: 'desk' }, pairSecretHash: await sha256(pairSecret), pairExpiresAt: Date.now() + 15 * 60_000, paired: false,
    };
    await this.saveMeta();
    return json({ workspaceId: wsId, deskToken, pairSecret, pairExpiresAt: new Date(this.meta.pairExpiresAt).toISOString() });
  }

  private async pair(req: Request): Promise<Response> {
    const b = (await req.json().catch(() => ({}))) as { pairSecret?: string };
    const m = this.meta!;
    if (!b.pairSecret || !m.pairSecretHash || Date.now() > m.pairExpiresAt || (await sha256(b.pairSecret)) !== m.pairSecretHash) {
      return error(403, 'pair_expired', 'This QR code expired. Show a new one on the Desk.');
    }
    const phoneToken = secret();
    m.tokens[await sha256(phoneToken)] = 'phone';
    m.pairSecretHash = null; // one-time use
    m.paired = true;
    await this.saveMeta();
    this.broadcast({ type: 'workspace', workspace: await this.summary() });
    return json({ workspaceId: m.id, phoneToken });
  }

  private async repair(): Promise<Response> {
    const pairSecret = secret();
    this.meta!.pairSecretHash = await sha256(pairSecret);
    this.meta!.pairExpiresAt = Date.now() + 15 * 60_000;
    await this.saveMeta();
    return json({ pairSecret, pairExpiresAt: new Date(this.meta!.pairExpiresAt).toISOString() });
  }

  private async events(): Promise<Response> {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.clients.add(writer);
    writer.write(this.encoder.encode(`retry: 3000\ndata: ${JSON.stringify({ type: 'snapshot', snapshot: await this.snapshot() })}\n\n`)).catch(() => this.clients.delete(writer));
    if (!this.pinger) {
      this.pinger = setInterval(() => {
        const ping = this.encoder.encode(': ping\n\n');
        for (const w of this.clients) w.write(ping).catch(() => this.clients.delete(w));
        if (!this.clients.size && this.pinger) { clearInterval(this.pinger); this.pinger = null; }
      }, 20_000);
    }
    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  }

  private async media(key: string): Promise<Response> {
    if (!key.startsWith(`w/${this.meta!.id}/`)) return error(404, 'not_found', 'Unknown media.');
    const obj = await this.env.MEDIA.get(key);
    if (!obj) return error(404, 'not_found', 'This file was deleted.');
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=300' } });
  }

  private async startSession(req: Request): Promise<Session> {
    const b = (await req.json().catch(() => ({}))) as { fixture?: boolean };
    for (const s of this.store.list('session')) {
      if (s.status === 'live' || s.status === 'paused') {
        await this.store.put('session', { ...s, status: 'ended', endedAt: now() });
        this.enqueue(() => wrapSession(this.context(), s.id));
      }
    }
    const sid = id('s');
    const session: Session = {
      id: sid, workspaceId: this.meta!.id, startedAt: now(), endedAt: null, tool: null, task: null, workId: id('k'),
      status: 'live', fixture: Boolean(b.fixture) || this.meta!.kind === 'sample', wrapStatus: 'none', design: null,
    };
    await this.store.put('session', session);
    await this.schedule(IDLE_END_MS + 1000);
    return session;
  }

  private async deleteSession(s: Session): Promise<void> {
    const keys: string[] = [];
    for (const m of sessionMoments(this.store, s.id)) {
      if (m.frame?.storedKey) keys.push(m.frame.storedKey);
      await this.store.remove('moment', m.id);
    }
    for (const c of this.store.list('content').filter(c => c.sessionId === s.id)) await this.store.remove('content', c.id);
    for (const c of this.store.list('card').filter(c => c.sessionId === s.id && c.status === 'proposed')) await this.store.remove('card', c.id);
    for (const sk of this.store.list('skill')) if (sk.momentId && !this.store.get('moment', sk.momentId)) await this.store.remove('skill', sk.id);
    const listed = await this.env.MEDIA.list({ prefix: `w/${this.meta!.id}/` });
    for (const o of listed.objects) if (o.key.includes(`/short/`) || o.key.includes('/media/')) {
      const owner = this.store.list('content').some(c => o.key.includes(c.id));
      if (!owner) keys.push(o.key);
    }
    if (keys.length) await this.env.MEDIA.delete(keys);
    await this.store.remove('session', s.id);
  }

  private async calibrate(req: Request): Promise<Response> {
    // The one disclosed setup frame: used to find the screen, never stored.
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_FRAME_BYTES) return error(413, 'too_large', 'Setup photo is too large.');
    const size = imageSize(bytes);
    if (!size) return error(415, 'unsupported', 'Send a JPEG or PNG.');
    try {
      const r = await segmentBoxes(this.env, this.spender(), bytesToDataUrl(bytes, size.mime), 'computer monitor screen');
      const best = r.boxes.sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1))[0];
      if (!best) return json({ crop: null, found: 0, latencyMs: r.latencyMs });
      const crop: CropRect = { x: best.x1 / best.w, y: best.y1 / best.h, w: (best.x2 - best.x1 + 1) / best.w, h: (best.y2 - best.y1 + 1) / best.h };
      return json({ crop, found: r.boxes.length, confidence: best.c, latencyMs: r.latencyMs });
    } catch (e) {
      const f = failureStatus(e);
      return json({ crop: null, found: 0, error: f.message, status: f.status }, 200);
    }
  }

  private async frame(req: Request): Promise<Response> {
    const form = await req.formData();
    const file = form.get('frame');
    if (!(file instanceof File)) return error(400, 'no_frame', 'No frame attached.');
    if (file.size > MAX_FRAME_BYTES) return error(413, 'too_large', 'Frame is too large.');
    if (Date.now() - this.lastFrameAt < MIN_FRAME_GAP_MS) return error(429, 'too_fast', 'Frames are arriving faster than the Caddie reads them.');
    this.lastFrameAt = Date.now();
    const source = (['camera', 'photo', 'screen-share', 'sample'] as CaptureSource[]).includes(form.get('source') as CaptureSource) ? (form.get('source') as CaptureSource) : 'camera';
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = imageSize(bytes);
    if (!size) return error(415, 'unsupported', 'Send a JPEG or PNG frame.');
    let session = this.store.list('session').find(s => s.status === 'live');
    if (!session) {
      if (this.store.list('session').some(s => s.status === 'paused')) return error(409, 'paused', 'Watching is paused.');
      session = await this.startSession(new Request('http://x', { method: 'POST', body: JSON.stringify({ fixture: source === 'sample' }) }));
    }
    const frameId = id('f');
    const key = `w/${this.meta!.id}/frames/${frameId}.${size.mime === 'image/png' ? 'png' : 'jpg'}`;
    await this.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: size.mime } });
    const frame: FrameRef = {
      id: frameId, capturedAt: (form.get('capturedAt') as string) || now(), source, storedKey: key, deleted: false,
      width: size.width, height: size.height, deviceCropped: form.get('deviceCropped') === 'true' || source === 'screen-share', fixture: source === 'sample',
    };
    const all = sessionMoments(this.store, session.id);
    const moment: Moment = {
      id: id('m'), work: { projectId: this.meta!.id, sessionId: session.id, workId: session.workId }, index: all.length ? all[all.length - 1].index + 1 : 0,
      at: now(), frame, readingStatus: 'pending', readingError: null, reading: null, misread: false, decision: null, response: null, change: null,
      provenance: source === 'sample' ? 'fixture' : 'observed',
    };
    await this.store.put('moment', moment);
    const dataUrl = bytesToDataUrl(bytes, size.mime);
    this.enqueue(() => processMoment(this.context(), moment.id, dataUrl));
    await this.schedule(IDLE_END_MS + 1000);
    return json({ momentId: moment.id, sessionId: session.id }, 202);
  }

  private async deleteFrame(frameId: string): Promise<Response> {
    const m = this.store.list('moment').find(x => x.frame?.id === frameId);
    if (!m?.frame) return error(404, 'not_found', 'Unknown frame.');
    if (m.frame.storedKey) await this.env.MEDIA.delete(m.frame.storedKey);
    return json(await this.store.put('moment', { ...m, frame: { ...m.frame, storedKey: undefined, deleted: true } }));
  }

  private async respond(req: Request, momentId: string): Promise<Response> {
    const m = this.store.get('moment', momentId);
    if (!m) return error(404, 'not_found', 'Unknown moment.');
    const ctx = this.context();
    const type = req.headers.get('content-type') ?? '';
    if (type.startsWith('audio/')) {
      const wav = new Uint8Array(await req.arrayBuffer());
      if (wav.length > MAX_AUDIO_BYTES) return error(413, 'too_large', 'Keep the answer under two minutes.');
      try {
        const keywords = [...(m.reading?.vagueTerms ?? []), m.reading?.task ?? ''].filter(Boolean);
        const { transcript } = await transcribe(this.env, ctx.spender, wav, wavDurationSeconds(wav), keywords);
        if (!transcript) return error(422, 'no_speech', 'No speech was detected. Try again closer to the microphone.');
        const updated = await this.store.put('moment', { ...m, response: { kind: 'voice-answer', transcript, at: now() } });
        await ctx.remember(`They said: ${transcript}`);
        this.enqueue(() => followUp(ctx, updated, 'The person just answered your last card by voice. Reply to their answer. '));
        return json(updated);
      } catch (e) {
        const f = failureStatus(e);
        return error(f.status === 'budget' ? 429 : 503, f.status, f.message);
      }
    }
    const b = (await req.json()) as { kind: 'later' | 'dismissed' | 'misread' | 'asked-example' };
    if (!['later', 'dismissed', 'misread', 'asked-example'].includes(b.kind)) return error(400, 'bad_kind', 'Unknown response.');
    if (b.kind === 'misread') {
      const updated = await this.store.put('moment', { ...m, misread: true, change: null, response: { kind: 'misread', transcript: null, at: now() } });
      for (const sk of this.store.list('skill').filter(s => s.momentId === m.id)) await this.store.remove('skill', sk.id);
      return json(updated);
    }
    const updated = await this.store.put('moment', { ...m, response: { kind: b.kind, transcript: null, at: now() } });
    if (b.kind === 'asked-example') this.enqueue(() => followUp(ctx, updated, 'The person asked you for an example brief. Use the example step. '));
    return json(updated);
  }

  private async ask(req: Request, contentId: string): Promise<Response> {
    const type = req.headers.get('content-type') ?? '';
    const atSec = Number(new URL(req.url).searchParams.get('at') ?? '0') || 0;
    let question: string;
    if (type.startsWith('audio/')) {
      const wav = new Uint8Array(await req.arrayBuffer());
      try {
        question = (await transcribe(this.env, this.context().spender, wav, wavDurationSeconds(wav))).transcript;
      } catch (e) {
        const f = failureStatus(e);
        return error(503, f.status, f.message);
      }
    } else {
      question = String(((await req.json()) as { question?: string }).question ?? '').trim().slice(0, 300);
    }
    if (!question) return error(422, 'no_question', 'No question was heard.');
    const r = await podcastAsk(this.context(), contentId, question, atSec);
    return 'error' in r ? error(503, 'ask_failed', r.error) : json({ question, ...r });
  }
}
