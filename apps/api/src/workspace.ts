// One Durable Object per paired phone + Desk. All state for a workspace lives
// here, so workspaces are isolated by construction.

import { DurableObject } from 'cloudflare:workers';
import type { CaptureSource, CropRect, FrameRef, Moment, PodcastPayload, ServerEvent, Session, ShortPayload, Snapshot, WorkspaceSummary } from '../../../packages/contracts/index.ts';
import { CAPS, charge, dayKey, remaining, type BudgetState } from '../../../packages/core/src/budget.ts';
import { parseWav } from '../../../packages/core/src/wav.ts';
import { asksFromText } from '../../../packages/core/src/cards.ts';
import { BudgetExceeded, egressProbe, fakeMeta, liveEnabled, segmentBoxes, transcribe, type Spender } from './meta.ts';
import { pollJob } from './media.ts';
import { followUp, failureStatus, processMoment, retainOrDiscard, ruleDecision, sessionMoments, type Ctx } from './pipeline.ts';
import { cardAction, generate, podcastAsk, practiceAttempt, practiceRetryImage, reviewFlashcard, startPractice, wrapSession, type CardAction } from './content.ts';
import { Store } from './store.ts';
import type { LedgerScope } from './budget-do.ts';
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
  /** TEST ONLY (fake models on 127.0.0.1): this workspace spends on its own fake ledger. */
  testLedger?: string;
}

interface Job { contentId: string; jobId: string; startedAt: number }

/** Real paid calls and fake test runs never share a ledger; Meta and Modal are separate budgets. */
export function ledgerName(env: Env, kind: 'meta' | 'modal' = 'meta', testLedger?: string): string {
  if (fakeMeta(env)) return `${kind === 'meta' ? 'fake-test-ledger' : 'fake-modal-ledger'}${testLedger ? `:${testLedger}` : ''}`;
  return kind === 'meta' ? 'global' : 'modal';
}

export function ledgerScope(env: Env, kind: 'meta' | 'modal' = 'meta'): LedgerScope {
  return fakeMeta(env) ? 'fake' : kind;
}

const IDLE_END_MS = 10 * 60_000;
/** The Practice Range drill is a 30-second spoken brief (approved plan). */
const PRACTICE_MAX_SECONDS = 30;
const STUCK_MS = 6 * 60_000;
const JOB_TIMEOUT_MS = 12 * 60_000;
const MIN_FRAME_GAP_MS = 2500;
/** Disclosed benchmark test mode: at most this many kept frames per workspace. */
export const BENCHMARK_MAX_FRAMES = 20;

export class Workspace extends DurableObject<Env> {
  private store: Store;
  private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private meta: Meta | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lastFrameAt = 0;
  private encoder = new TextEncoder();
  private pinger: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage, e => this.broadcast(e));
  }

  // ------------------------------------------------------------ infra

  /**
   * What the Caddie remembers across sessions, derived from records that still exist: answers on
   * moments that were not deleted or marked misread, and the CURRENT text of rules still in use.
   * Nothing is stored separately, so deleting a session, revoking or editing a card takes effect at once.
   */
  private derivedMemory(): string[] {
    const answers = this.store.list('moment')
      .filter(m => (m.response?.kind === 'voice-answer' || m.response?.kind === 'typed-answer') && m.response.transcript && !m.misread
        && this.store.alive('moment', m.id) && this.store.alive('session', m.work.sessionId))
      .sort((a, b) => a.response!.at.localeCompare(b.response!.at))
      .slice(-6)
      .map(m => `${m.response!.kind === 'typed-answer' ? 'They wrote' : 'They said'}: ${m.response!.transcript!.slice(0, 300)}`);
    const rules = this.store.list('card')
      .filter(c => c.status === 'approved' || c.status === 'applied' || c.status === 'observed-working')
      .map(c => `Approved rule for ${c.targetTool}: ${c.text.slice(0, 300)}`);
    return [...answers, ...rules];
  }

  /** This instance. Work started by another (pre-restart) instance cannot still be running here. */
  private runner = crypto.randomUUID();
  private lastDiagAt = 0;
  private recovered = false;

  private async loadMeta(): Promise<Meta | null> {
    if (!this.meta) this.meta = (await this.ctx.storage.get<Meta>('meta')) ?? null;
    await this.store.load();
    if (this.meta && !this.recovered) { this.recovered = true; await this.recoverInterrupted(); }
    return this.meta;
  }

  /**
   * After a restart (e.g. a code update), items left "generating" by the previous instance
   * with no tracked media job were cut off mid-step: say so at once so they can be retried.
   */
  private async recoverInterrupted(): Promise<void> {
    // Older builds kept an unscoped "memory" list that outlived deleted sessions and revoked rules.
    await this.ctx.storage.delete('memory');
    const jobs = (await this.ctx.storage.get<Job[]>('jobs')) ?? [];
    const lost = 'Generation was interrupted when the server restarted. Retry to make it again.';
    for (const c of this.store.list('content')) {
      if (jobs.some(j => j.contentId === c.id)) continue; // a tracked media job is still polled
      // Queued items belong to a wrap chain that no longer exists after a restart.
      if (c.status === 'queued') { await this.store.put('content', { ...c, status: 'failed', error: lost, updatedAt: now() }); continue; }
      if (c.status !== 'generating' || c.runner === this.runner) continue;
      if (!c.runner && Date.now() - Date.parse(c.updatedAt) < STUCK_MS) continue; // older items: leave to the watchdog
      await this.store.put('content', { ...c, status: 'failed', error: lost, updatedAt: now() });
    }
    for (const s of this.store.list('session')) {
      if (s.wrapStatus === 'planning') await this.store.put('session', { ...s, wrapStatus: 'failed' }); // the wrap-up shows Retry
    }
    // Moments: reading and deciding run in memory. A moment the previous instance left unread or
    // undecided is closed honestly — nothing is invented, no skill is recorded, its reservation stays
    // as it was — and the phone offers to look again. Work started by this instance is never touched.
    const ctx = this.context();
    for (const m of this.store.list('moment')) {
      if (m.runner === this.runner || m.interrupted) continue;
      if (m.readingStatus === 'pending') {
        // Same raw-frame rule as any failed read: discard it unless it is an explicit benchmark frame.
        const drop = !!m.frame?.storedKey && !m.benchmark;
        if (drop) await this.bucket().delete(m.frame!.storedKey!).catch(() => undefined);
        const reason = 'The Caddie restarted while reading this screen, so it was not read. It looks again at the next change, or send one photo.';
        await this.store.put('moment', { ...m, readingStatus: 'error', readingError: reason, interrupted: true, frame: m.frame && drop ? { ...m.frame, storedKey: undefined, deleted: true } : m.frame, decision: ruleDecision(reason, 'interrupted') });
      } else if (m.readingStatus === 'ok' && !m.decision) {
        // The reading (and any observed change) is kept; only the lost decision is reported.
        const reason = m.frame
          ? 'The Caddie restarted before deciding about this screen, so it said nothing. It looks again at the next change.'
          : 'The Caddie restarted before replying. Your answer is kept; it looks again at the next change.';
        const history = sessionMoments(this.store, m.work.sessionId).filter(h => h.index < m.index);
        const closed = await retainOrDiscard(ctx, { ...m, interrupted: true, decision: ruleDecision(reason, 'decision-interrupted') }, history);
        await this.store.put('moment', closed);
      }
    }
    // Practice steps run in memory too: keep what finished (scenario, transcript, check) and offer a retry.
    const cut = 'Interrupted when the server restarted. Try again.';
    for (const p of this.store.list('practice')) {
      if (p.status === 'scenario') await this.store.put('practice', { ...p, status: 'failed', error: cut });
      else if (p.status === 'transcribing' || p.status === 'checking') await this.store.put('practice', { ...p, status: 'failed', error: cut, imageStatus: p.imageStatus === 'generating' ? 'failed' : p.imageStatus });
      else if (p.status === 'done' && p.imageStatus === 'generating') await this.store.put('practice', { ...p, imageStatus: 'failed', error: cut });
    }
    // Cards made before checked details existed: derive them once from the exact rule text,
    // recorded in the card's history; wording that is not recognized stays unverified.
    for (const c of this.store.list('card')) {
      if (c.asks !== undefined) continue;
      const asks = asksFromText(c.text);
      await this.store.put('card', { ...c, asks, history: [...c.history, { status: c.status, at: now(), by: 'caddie', note: asks.length ? `Checked details read from the rule text: ${asks.join(', ')}.` : 'This rule\'s wording cannot be checked automatically.' }] });
    }
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

  /**
   * Spender for one budget (Meta or Modal). Each reservation is made in the
   * lifetime authority BEFORE the call is dispatched and returns a durable
   * ticket; settlement is idempotent per ticket in both the authority and this
   * workspace, so duplicate or late settlements can never refund other spend.
   */
  private spender(kind: 'meta' | 'modal' = 'meta'): Spender {
    const authority = () => this.env.BUDGET.get(this.env.BUDGET.idFromName(ledgerName(this.env, kind, this.meta?.testLedger)));
    return {
      reserve: async (usd, label) => {
        if (!(usd >= 0) || !Number.isFinite(usd)) throw new BudgetExceeded('invalid-estimate');
        const st = await this.budgetState();
        // Sample workspaces have a lifetime cap, user workspaces a daily cap (both inside the global lifetime cap).
        const left = this.meta?.kind === 'sample' ? Math.max(0, this.cap() - st.spentUsd) : remaining(st, this.cap(), Date.now());
        if (left < usd) throw new BudgetExceeded(this.meta?.kind === 'sample' ? 'sample' : 'workspace');
        const ticket = await authority().reserve(usd, ledgerScope(this.env, kind), `${this.meta?.id}:${label}`);
        if (!ticket) throw new BudgetExceeded(kind === 'meta' ? 'global' : 'modal');
        await this.ctx.storage.put({
          budget: this.meta?.kind === 'sample' ? { day: st.day, spentUsd: st.spentUsd + usd } : charge(st, usd, Date.now()),
          [`wt:${ticket}`]: { usd, kind, settled: false },
        });
        return ticket;
      },
      settle: async (ticket, actual) => {
        const key = `wt:${ticket}`;
        const local = await this.ctx.storage.get<{ usd: number; kind: string; settled: boolean }>(key);
        if (!local || local.settled) return;
        await this.ctx.storage.put(key, { ...local, settled: true });
        const applied = await authority().settle(ticket, actual);
        if (!applied) return;
        const delta = actual - local.usd;
        if (Math.abs(delta) >= 1e-9) {
          const st = await this.budgetState();
          await this.ctx.storage.put('budget', { day: st.day, spentUsd: Math.max(0, st.spentUsd + delta) });
        }
        this.broadcast({ type: 'workspace', workspace: await this.summary() });
      },
    };
  }

  private contentAlive(contentId: string): boolean {
    const c = this.store.get('content', contentId);
    return !!c && this.store.alive('content', contentId) && this.store.alive('session', c.sessionId);
  }

  /** TEST ONLY (local fake models): delay the next object writes so tests can race deletion against them. */
  private testR2 = { delayMs: 0, count: 0, keys: [] as string[] };

  private bucket(): R2Bucket {
    const b = this.env.MEDIA;
    if (!fakeMeta(this.env) || this.testR2.count <= 0) return b;
    const t = this.testR2;
    return new Proxy(b, {
      get: (target, prop) => {
        if (prop === 'put') {
          return async (key: string, ...rest: unknown[]) => {
            if (t.count > 0) { t.count--; t.keys.push(key); await new Promise(r => setTimeout(r, t.delayMs)); }
            return (target.put as (...a: unknown[]) => Promise<R2Object | null>).call(target, key, ...rest);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  private context(): Ctx {
    const self = this;
    return {
      env: this.env,
      wsId: this.meta!.id,
      store: this.store,
      spender: this.spender('meta'),
      mediaSpender: this.spender('modal'),
      get r2() { return self.bucket(); },
      memory: async () => this.derivedMemory(),
      notice: (l, c, m) => this.notice(l, c, m),
      trackJob: async (contentId, jobId) => {
        const jobs = (await this.ctx.storage.get<Job[]>('jobs')) ?? [];
        await this.ctx.storage.put('jobs', [...jobs.filter(j => j.contentId !== contentId), { contentId, jobId, startedAt: Date.now() }]);
        await this.schedule(5_000);
      },
      watchdog: () => this.schedule(STUCK_MS + 5_000),
      runner: this.runner,
    };
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch(e => {
      console.error(JSON.stringify({ event: 'task_error', name: (e as Error)?.name, message: String((e as Error)?.message ?? e).slice(0, 300) }));
      this.notice('warn', 'task-failed', 'A background step failed. You can retry it.');
    });
    // Durable Objects stay alive while I/O is pending; waitUntil is used when the runtime offers it.
    (this.ctx as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil?.(this.queue);
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
    // New jobs can be added while this alarm awaits the media service, so the list is
    // never written back from this snapshot: only jobs settled here are removed at the end.
    const jobs = (await this.ctx.storage.get<Job[]>('jobs')) ?? [];
    const settled = new Set<string>();
    const current = async (jobId: string) => ((await this.ctx.storage.get<Job[]>('jobs')) ?? []).some(j => j.jobId === jobId);
    for (const job of jobs) {
      const item = this.store.get('content', job.contentId);
      if (!item || !this.contentAlive(job.contentId)) { settled.add(job.jobId); continue; } // deleted: drop the job, store nothing
      if (Date.now() - job.startedAt > JOB_TIMEOUT_MS) {
        settled.add(job.jobId);
        await this.store.put('content', { ...item, status: 'failed', error: 'Rendering took too long. Retry to render again.', updatedAt: now() });
        continue;
      }
      try {
        const r = await pollJob(this.env, job.jobId);
        if (r.status === 'running') continue;
        settled.add(job.jobId);
        if (!(await current(job.jobId))) continue; // replaced by a retry while polling: the newer job decides
        if (r.status === 'failed') { await this.store.put('content', { ...item, status: 'failed', error: r.error, updatedAt: now() }); continue; }
        if (!this.contentAlive(item.id)) continue;
        const ext = item.format === 'podcast' ? 'm4a' : 'mp4';
        const key = `w/${this.meta!.id}/media/${item.id}-${item.attempts}.${ext}`;
        await this.bucket().put(key, r.bytes, { httpMetadata: { contentType: r.mime } });
        // Deleted while the file was being written: remove it so nothing is left behind.
        if (!this.contentAlive(item.id)) { await this.bucket().delete(key); continue; }
        const fresh = this.store.get('content', item.id)!;
        if (fresh.format === 'podcast') {
          const p = fresh.payload as PodcastPayload;
          const lines = p.lines.map((l, i) => { const t = r.timings.find(x => x.index === i); return t ? { ...l, start: t.start, end: t.end } : l; });
          await this.store.put('content', { ...fresh, status: 'ready', payload: { ...p, lines, audioKey: key, durationSec: r.durationSec, renderTiming: r.renderTiming }, updatedAt: now() });
        } else {
          const p = fresh.payload as ShortPayload;
          const scenes = p.scenes.map((s, i) => { const t = r.timings.find(x => x.index === i); return t ? { ...s, start: t.start, end: t.end } : s; });
          await this.store.put('content', { ...fresh, status: 'ready', payload: { ...p, scenes, videoKey: key, durationSec: r.durationSec, renderTiming: r.renderTiming }, updatedAt: now() });
        }
      } catch (e) {
        if (Date.now() - job.startedAt >= JOB_TIMEOUT_MS) {
          settled.add(job.jobId);
          await this.store.put('content', { ...item, status: 'failed', error: failureStatus(e).message, updatedAt: now() });
        }
      }
    }
    const remainingJobs = ((await this.ctx.storage.get<Job[]>('jobs')) ?? []).filter(j => !settled.has(j.jobId));
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
      if (seg[0] === 'test' && seg[1] === 'r2-delay' && fakeMeta(this.env)) {
        if (method === 'POST') {
          const b = (await req.json().catch(() => ({}))) as { ms?: number; count?: number };
          this.testR2 = { delayMs: Math.min(20_000, Math.max(0, Number(b.ms) || 0)), count: Math.min(5, Math.max(0, Number(b.count) || 0)), keys: [] };
          return json({ ok: true });
        }
        return json({ keys: this.testR2.keys });
      }
      if (seg[0] === 'test' && seg[1] === 'restart' && method === 'POST' && fakeMeta(this.env)) {
        // TEST ONLY: behave like a freshly started instance (the old in-memory work is treated as lost).
        this.runner = crypto.randomUUID();
        await this.recoverInterrupted();
        return json({ ok: true });
      }

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
      if (path === '/diag/egress' && method === 'GET' && this.env.COEVO_EGRESS_DIAG === 'true') {
        // Diagnosis window only: one free probe per 30 s per workspace (no generation, nothing billed).
        if (Date.now() - this.lastDiagAt < 30_000) return error(429, 'too_fast', 'One probe per 30 seconds.');
        this.lastDiagAt = Date.now();
        const r = await egressProbe(this.env);
        console.log(JSON.stringify({ event: 'egress_probe', ...r }));
        return json(r);
      }
      if (path === '/benchmark' && method === 'GET') return this.benchmarkExport(url.searchParams.get('images') === '1');
      if (path === '/benchmark' && method === 'DELETE') return this.benchmarkDelete();
      if (seg[0] === 'frames' && seg.length === 1 && method === 'POST') return this.frame(req);
      if (seg[0] === 'frames' && seg[1] && method === 'DELETE') return this.deleteFrame(seg[1]);

      if (seg[0] === 'moments' && seg[2] === 'respond' && method === 'POST') return this.respond(req, seg[1]);
      if (seg[0] === 'moments' && seg[2] === 'client-timing' && method === 'POST') {
        // Benchmark frames only: the phone's own change→card and upload→card times.
        const m = this.store.get('moment', seg[1]);
        if (!m?.benchmark || !m.timing) return error(404, 'not_found', 'Unknown benchmark moment.');
        const b = (await req.json().catch(() => ({}))) as { changeToCardMs?: unknown; uploadToCardMs?: unknown };
        const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 600_000;
        if (!ok(b.uploadToCardMs) || (b.changeToCardMs !== null && !ok(b.changeToCardMs))) return error(400, 'bad_timing', 'Timing values must be milliseconds.');
        return json(await this.store.put('moment', { ...m, timing: { ...m.timing, client: { changeToCardMs: b.changeToCardMs as number | null, uploadToCardMs: b.uploadToCardMs as number } } }));
      }

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
          if (item.status === 'skipped') await this.store.put('content', { ...item, requestedByUser: true, updatedAt: now() });
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
          if ((req.headers.get('content-type') ?? '').startsWith('application/json')) {
            // Typed fallback when speaking is not possible; recorded as typed.
            const b = (await req.json().catch(() => ({}))) as { text?: unknown };
            const text = typeof b.text === 'string' ? b.text.trim() : '';
            if (text.length < 3 || text.length > 600) return error(400, 'bad_text', 'Type a brief of up to 600 characters.');
            this.enqueue(() => practiceAttempt(ctx, p.id, { text }));
            return json({ ok: true });
          }
          const wav = new Uint8Array(await req.arrayBuffer());
          if (wav.length > MAX_AUDIO_BYTES) return error(413, 'too_large', 'Keep the brief under 30 seconds.');
          const info = parseWav(wav);
          if (info && info.seconds > PRACTICE_MAX_SECONDS + 1) return error(413, 'too_long', 'Keep the brief under 30 seconds.');
          this.enqueue(() => practiceAttempt(ctx, p.id, { wav }));
          return json({ ok: true });
        }
        if (seg[2] === 'image' && method === 'POST') { this.enqueue(() => practiceRetryImage(ctx, p.id)); return json({ ok: true }); }
      }
      return error(404, 'not_found', 'Unknown route.');
    } catch (e) {
      if (e instanceof SyntaxError) return error(400, 'bad_request', 'Malformed request.');
      if (e instanceof TypeError && /form|multipart|boundary/i.test(String((e as Error).message))) return error(400, 'bad_request', 'The upload could not be read.');
      console.error(JSON.stringify({ event: 'workspace_error', path: path.replace(/_[a-z0-9]+/g, '_*'), name: (e as Error)?.name, message: String((e as Error)?.message ?? e).slice(0, 300) }));
      throw e;
    }
  }

  // ------------------------------------------------------------ handlers

  private async init(req: Request, url: URL): Promise<Response> {
    if (this.meta) return error(409, 'exists', 'Workspace already exists.');
    const b = (await req.json().catch(() => ({}))) as { kind?: 'user' | 'sample'; testLedger?: string | null };
    const testLedger = fakeMeta(this.env) && typeof b.testLedger === 'string' && /^[a-z0-9-]{4,40}$/.test(b.testLedger) ? b.testLedger : undefined;
    const deskToken = secret();
    const pairSecret = secret();
    const wsId = url.pathname.split('/')[3];
    this.meta = {
      id: wsId, kind: b.kind === 'sample' ? 'sample' : 'user', createdAt: now(),
      tokens: { [await sha256(deskToken)]: 'desk' }, pairSecretHash: await sha256(pairSecret), pairExpiresAt: Date.now() + 15 * 60_000, paired: false,
      ...(testLedger ? { testLedger } : {}),
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
    // Mark it deleted before the first await, so in-flight work stops creating things during cleanup.
    await this.store.markRemoved('session', s.id);
    const keys: string[] = [];
    for (const m of sessionMoments(this.store, s.id)) {
      if (m.frame?.storedKey) keys.push(m.frame.storedKey);
      await this.store.remove('moment', m.id);
    }
    for (const c of this.store.list('content').filter(c => c.sessionId === s.id)) await this.store.remove('content', c.id);
    for (const c of this.store.list('card').filter(c => c.sessionId === s.id && c.status === 'proposed')) await this.store.remove('card', c.id);
    for (const pr of this.store.list('practice').filter(x => x.sessionId === s.id)) {
      if (pr.imageKey) keys.push(pr.imageKey);
      for (const sk of this.store.list('skill').filter(k => k.practiceId === pr.id)) await this.store.remove('skill', sk.id);
      await this.store.remove('practice', pr.id);
    }
    for (const sk of this.store.list('skill')) if (sk.momentId && !this.store.get('moment', sk.momentId)) await this.store.remove('skill', sk.id);
    const listed = await this.bucket().list({ prefix: `w/${this.meta!.id}/` });
    for (const o of listed.objects) if (o.key.includes(`/short/`) || o.key.includes('/media/')) {
      const owner = this.store.list('content').some(c => o.key.includes(c.id));
      if (!owner) keys.push(o.key);
    }
    if (keys.length) await this.bucket().delete(keys);
    const jobs = (await this.ctx.storage.get<Job[]>('jobs')) ?? [];
    await this.ctx.storage.put('jobs', jobs.filter(j => this.store.alive('content', j.contentId)));
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
    const benchmark = form.get('benchmark') === 'true';
    if (benchmark && this.store.list('moment').filter(m => m.benchmark).length >= BENCHMARK_MAX_FRAMES) {
      return error(409, 'benchmark_full', `The benchmark already has ${BENCHMARK_MAX_FRAMES} frames. Export or delete them first.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = imageSize(bytes);
    if (!size) return error(415, 'unsupported', 'Send a JPEG or PNG frame.');
    let session = this.store.list('session').find(s => s.status === 'live' && this.store.alive('session', s.id));
    if (!session) {
      if (this.store.list('session').some(s => s.status === 'paused')) return error(409, 'paused', 'Watching is paused.');
      session = await this.startSession(new Request('http://x', { method: 'POST', body: JSON.stringify({ fixture: source === 'sample' }) }));
    }
    const frameId = id('f');
    const key = `w/${this.meta!.id}/frames/${frameId}.${size.mime === 'image/png' ? 'png' : 'jpg'}`;
    await this.bucket().put(key, bytes, { httpMetadata: { contentType: size.mime } });
    if (!this.store.alive('session', session.id)) {
      await this.bucket().delete(key); // the session was deleted during the upload
      return error(409, 'session_deleted', 'That session was deleted. Start watching again.');
    }
    const frame: FrameRef = {
      id: frameId, capturedAt: (form.get('capturedAt') as string) || now(), source, storedKey: key, deleted: false,
      width: size.width, height: size.height, deviceCropped: form.get('deviceCropped') === 'true' || source === 'screen-share', fixture: source === 'sample',
    };
    const all = sessionMoments(this.store, session.id);
    const moment: Moment = {
      id: id('m'), work: { projectId: this.meta!.id, sessionId: session.id, workId: session.workId }, index: all.length ? all[all.length - 1].index + 1 : 0,
      at: now(), frame, readingStatus: 'pending', readingError: null, reading: null, misread: false, decision: null, response: null, change: null,
      provenance: source === 'sample' ? 'fixture' : 'observed', runner: this.runner,
      ...(benchmark ? { benchmark: true } : {}),
    };
    await this.store.put('moment', moment);
    const dataUrl = bytesToDataUrl(bytes, size.mime);
    this.enqueue(() => processMoment(this.context(), moment.id, dataUrl));
    await this.schedule(IDLE_END_MS + 1000);
    return json({ momentId: moment.id, sessionId: session.id }, 202);
  }

  /** Private export of the benchmark: readings, decisions and timings, optionally with the frames. */
  private async benchmarkExport(images: boolean): Promise<Response> {
    const ms = this.store.list('moment').filter(m => m.benchmark).sort((a, b) => a.at.localeCompare(b.at));
    const frames = [];
    for (const [i, m] of ms.entries()) {
      let image: string | null = null;
      if (images && m.frame?.storedKey) {
        const obj = await this.env.MEDIA.get(m.frame.storedKey);
        if (obj) image = bytesToDataUrl(new Uint8Array(await obj.arrayBuffer()), obj.httpMetadata?.contentType ?? 'image/jpeg');
      }
      frames.push({
        index: i + 1, momentId: m.id, at: m.at, source: m.frame?.source ?? null, deviceCropped: m.frame?.deviceCropped ?? null,
        width: m.frame?.width ?? null, height: m.frame?.height ?? null, readingStatus: m.readingStatus, readingError: m.readingError,
        legible: m.reading?.legible ?? null, tool: m.reading?.tool ?? null, userRequest: m.reading?.userRequest ?? null,
        userTyping: m.reading?.userTyping ?? null, aiAskedClarifyingQuestion: m.reading?.aiAskedClarifyingQuestion ?? null,
        decision: m.decision ? { action: m.decision.action, step: m.decision.step, provenance: m.decision.provenance } : null,
        timing: m.timing ?? null, image,
      });
    }
    const totals = ms.map(m => m.timing?.totalMs).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    const q = (p: number) => (totals.length ? totals[Math.min(totals.length - 1, Math.floor(p * totals.length))] : null);
    return json({
      kind: 'coevo-benchmark', label: 'TEST MODE — synthetic test conversation; not production data', exportedAt: now(), workspaceId: this.meta!.id,
      summary: { frames: ms.length, legible: ms.filter(m => m.reading?.legible).length, p50ServerMs: q(0.5), p90ServerMs: q(0.9), max: BENCHMARK_MAX_FRAMES },
      frames,
    }, 200, { 'Content-Disposition': `attachment; filename="coevo-benchmark-${this.meta!.id}.json"` });
  }

  private async benchmarkDelete(): Promise<Response> {
    const ms = this.store.list('moment').filter(m => m.benchmark);
    const keys = ms.map(m => m.frame?.storedKey).filter((k): k is string => !!k);
    if (keys.length) await this.env.MEDIA.delete(keys);
    for (const m of ms) {
      for (const sk of this.store.list('skill').filter(x => x.momentId === m.id)) await this.store.remove('skill', sk.id);
      await this.store.remove('moment', m.id);
    }
    return json({ deleted: ms.length });
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
        const { transcript } = await transcribe(this.env, ctx.spender, wav, keywords);
        if (!transcript) return error(422, 'no_speech', 'No speech was detected. Try again closer to the microphone.');
        const updated = await this.store.put('moment', { ...m, response: { kind: 'voice-answer', transcript, at: now() } });
        this.enqueue(() => followUp(ctx, updated, 'The person just answered your last card by voice. Reply to their answer. '));
        return json(updated);
      } catch (e) {
        const f = failureStatus(e);
        return error(f.status === 'budget' ? 429 : 503, f.status, f.message);
      }
    }
    const b = (await req.json()) as { kind: 'later' | 'dismissed' | 'misread' | 'asked-example' | 'typed-answer'; text?: unknown };
    if (b.kind === 'typed-answer') {
      // Typed instead of spoken (e.g. in an open office); treated like a voice answer and marked typed.
      const text = typeof b.text === 'string' ? b.text.trim() : '';
      if (text.length < 2 || text.length > 600) return error(400, 'bad_text', 'Type an answer of up to 600 characters.');
      const updated = await this.store.put('moment', { ...m, response: { kind: 'typed-answer', transcript: text, at: now() } });
      this.enqueue(() => followUp(ctx, updated, 'The person just answered your last card in writing. Reply to their answer. '));
      return json(updated);
    }
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
        question = (await transcribe(this.env, this.context().spender, wav)).transcript;
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
