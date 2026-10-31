// Session wrap: shared learning design → five formats. Each format fails alone.

import type {
  Assistance, CaddieCard, ContentFormat, ContentItem, DraftVerdict, FlashcardsPayload, Ingredients, ManualPayload, Moment, NotePayload, PodcastPayload,
  PracticeAttempt, PracticeJudgment, PracticeRevision, Session, ShortPayload,
} from '../../../packages/contracts/index.ts';
import { CONTENT_FORMATS, INGREDIENT_KEYS } from '../../../packages/contracts/index.ts';
import { designTask, flashcardsTask, manualTask, noteTask, podcastAskTask, podcastTask, practiceCheckTask, practiceObserveTask, practiceScenarioTask, shortTask } from '../../../packages/core/src/prompts.ts';
import { isGroundedQuote, speechSeconds } from '../../../packages/core/src/text.ts';
import { firstDue, nextDue } from '../../../packages/core/src/spaced.ts';
import { labelPractice, practiceInputFixture, skillFixture, strengthFor } from '../../../packages/core/src/labels.ts';
import { applyHint, asksFromText } from '../../../packages/core/src/cards.ts';
import { generateImage, modelProvenance, runTask, transcribe } from './meta.ts';
import { MediaUnavailable, startJob, type ShortJobScene } from './media.ts';
import { failureStatus, sessionMoments, type Ctx } from './pipeline.ts';
import { bytesToDataUrl, id, now } from './util.ts';

export const VOICES = { caddie: 'af_heart', guest: 'am_michael' } as const;

/** Time since the session started ("+3:05"). Server clocks are UTC, so clock times would be wrong for the person. */
function elapsed(iso: string, startIso: string): string {
  const sec = Math.max(0, Math.round((Date.parse(iso) - Date.parse(startIso)) / 1000));
  return `+${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Compact, quotable evidence text for content prompts. */
export function evidenceText(ctx: Ctx, session: Session): string {
  const lines: string[] = [`Session ${session.id}: tool=${session.tool ?? 'unknown'}; task=${session.task ?? 'unknown'}; fixture=${session.fixture}. Times are minutes:seconds since the session started.`];
  for (const m of sessionMoments(ctx.store, session.id)) {
    if (m.misread) { lines.push(`[${m.id}] ${elapsed(m.at, session.startedAt)} (marked misread by the person; ignore)`); continue; }
    const r = m.reading;
    const parts: string[] = [];
    if (r?.legible && r.userRequest) parts.push(`person asked the AI: "${r.userRequest}"`);
    if (r?.vagueTerms.length) parts.push(`vague words: ${r.vagueTerms.join(', ')}`);
    if (r?.aiResponseSummary) parts.push(`AI: ${r.aiResponseSummary}`);
    if (r?.aiAskedClarifyingQuestion) parts.push('AI asked clarifying questions first');
    const d = m.decision;
    if (d?.action === 'intervene') parts.push(`Caddie (${d.step}): "${d.message}"`);
    else if (d?.note) parts.push(`Caddie stayed quiet: ${d.note}`);
    if (m.response) parts.push(`person ${m.response.kind}${m.response.transcript ? ` (${m.response.kind === 'typed-answer' ? 'typed' : 'voice'}): "${m.response.transcript}"` : ''}`);
    if (m.change) parts.push(`observed change: ${m.change.summary} [${m.change.assistance}]`);
    if (parts.length) lines.push(`[${m.id}] ${elapsed(m.at, session.startedAt)} ${parts.join(' | ')}`);
  }
  return lines.join('\n');
}

function sources(ctx: Ctx, session: Session): string[] {
  const out: string[] = [];
  for (const m of sessionMoments(ctx.store, session.id)) {
    if (m.misread) continue;
    if (m.reading?.userRequest) out.push(m.reading.userRequest);
    if (m.response?.transcript) out.push(m.response.transcript);
  }
  return out;
}

const grounded = (quote: string, srcs: string[]) => srcs.some(s => isGroundedQuote(quote, s));

/** Raised when the content item (or its session) was deleted mid-generation. */
class Gone extends Error {
  constructor() { super('deleted'); this.name = 'Gone'; }
}

function contentAlive(ctx: Ctx, contentId: string): boolean {
  const c = ctx.store.get('content', contentId);
  return !!c && ctx.store.alive('content', contentId) && ctx.store.alive('session', c.sessionId);
}

function ensureAlive(ctx: Ctx, contentId: string): void {
  if (!contentAlive(ctx, contentId)) throw new Gone();
}

async function setItem(ctx: Ctx, item: ContentItem, patch: Partial<ContentItem>): Promise<ContentItem> {
  ensureAlive(ctx, item.id);
  const cur = ctx.store.get('content', item.id)!;
  return ctx.store.put('content', { ...cur, ...patch, updatedAt: now() });
}

export async function wrapSession(ctx: Ctx, sessionId: string): Promise<void> {
  let session = ctx.store.get('session', sessionId);
  if (!session || session.wrapStatus === 'planning') return;
  session = await ctx.store.put('session', { ...session, wrapStatus: 'planning' });
  const evidence = evidenceText(ctx, session);
  let design;
  try {
    design = (await runTask(ctx.env, ctx.spender, designTask, { text: evidence })).value;
  } catch (e) {
    if (!ctx.store.alive('session', sessionId)) return;
    await ctx.store.put('session', { ...ctx.store.get('session', sessionId)!, wrapStatus: 'failed' });
    ctx.notice('warn', 'wrap-failed', failureStatus(e).message);
    return;
  }
  if (!ctx.store.alive('session', sessionId)) return; // deleted while planning: make nothing
  session = await ctx.store.put('session', { ...ctx.store.get('session', sessionId)!, wrapStatus: 'planned', design });
  const at = Date.now();
  for (const format of CONTENT_FORMATS) {
    const choice = design.formats[format];
    const existing = ctx.store.list('content').find(c => c.sessionId === sessionId && c.format === format);
    const item: ContentItem = {
      id: existing?.id ?? id('c'), sessionId, format,
      status: choice.make ? 'queued' : 'skipped', whyNow: choice.why,
      sourceMomentIds: design.turningPoint.momentId ? [design.turningPoint.momentId] : [],
      arriveAt: new Date(format === 'flashcards' ? firstDue(at).dueAt : at).toISOString(),
      payload: null, error: null, attempts: 0, provenance: modelProvenance(ctx.env), updatedAt: now(),
    };
    await ctx.store.put('content', item);
  }
  // Media formats start first and in parallel with the text formats: their scripts are
  // needed early because rendering on the media service takes the longest.
  const chain = async (formats: ContentFormat[]) => {
    for (const format of formats) {
      if (!ctx.store.alive('session', sessionId)) return;
      const item = ctx.store.list('content').find(c => c.sessionId === sessionId && c.format === format);
      if (item?.status === 'queued') await generate(ctx, item.id);
    }
  };
  await Promise.all([chain(['note', 'manual', 'flashcards']), chain(['podcast', 'short'])]);
}

export async function generate(ctx: Ctx, contentId: string): Promise<void> {
  const item = ctx.store.get('content', contentId);
  if (!item) return;
  const session = ctx.store.get('session', item.sessionId);
  if (!session?.design) return;
  const base = await setItem(ctx, item, { status: 'generating', error: null, attempts: item.attempts + 1, runner: ctx.runner });
  await ctx.watchdog?.();
  const text = `Learning design:\n${JSON.stringify(session.design)}\n\nEvidence:\n${evidenceText(ctx, session)}`;
  const srcs = sources(ctx, session);
  try {
    switch (item.format) {
      case 'note': {
        const v = (await runTask(ctx.env, ctx.spender, noteTask, { text })).value;
        const quotes = v.quotes.filter(q => grounded(q.text, srcs));
        if (!quotes.length) throw new Error('The note quoted words that do not appear in the session.');
        await setItem(ctx, base, { status: 'ready', payload: { ...v, quotes } satisfies NotePayload });
        break;
      }
      case 'manual': {
        const v = (await runTask(ctx.env, ctx.spender, manualTask, { text })).value;
        await setItem(ctx, base, { status: 'ready', payload: v satisfies ManualPayload });
        if (ctx.store.alive('session', session.id)) await proposeCard(ctx, session, v.cardRule, v.cardAsks, item.sourceMomentIds);
        break;
      }
      case 'flashcards': {
        const cards = (await runTask(ctx.env, ctx.spender, flashcardsTask, { text })).value;
        const due = firstDue(Date.now());
        const payload: FlashcardsPayload = { cards: cards.map(c => ({ ...c, id: id('fc'), dueAt: due.dueAt, interval: due.interval, reviews: [] })) };
        await setItem(ctx, base, { status: 'ready', payload });
        break;
      }
      case 'podcast': {
        const v = (await runTask(ctx.env, ctx.spender, podcastTask, { text })).value;
        const words = v.lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
        if (speechSeconds(v.lines.map(l => l.text).join(' ')) < 60) throw new Error(`The script is too short for 60 seconds (${words} words).`);
        const payload: PodcastPayload = { title: v.title, words, speakers: { caddie: 'Caddie', guest: v.guest }, lines: v.lines.map(l => ({ ...l, start: 0, end: 0 })), audioKey: null, durationSec: null, asks: [] };
        await setItem(ctx, base, { status: 'generating', payload });
        ensureAlive(ctx, base.id); // never dispatch new media for deleted content
        await startMedia(ctx, base.id, { kind: 'podcast', lines: v.lines, voices: { ...VOICES } });
        break;
      }
      case 'short': {
        const v = (await runTask(ctx.env, ctx.spender, shortTask, { text })).value;
        const total = speechSeconds(v.scenes.map(s => s.narration).join(' '));
        // Same policy as the renderer: 30–45 s total; check before spending on images or rendering.
        if (total < 25 || total > 44) throw new Error(`The short's narration would run about ${Math.round(total)} s; it must fit 30–45 s. Retry to write it again.`);
        const frames = sessionMoments(ctx.store, session.id).filter(m => m.frame?.storedKey && m.reading?.artifactVisible && !m.misread);
        const before = frames[0] ?? null;
        const after = [...frames].reverse().find(m => m.change) ?? frames[frames.length - 1] ?? null;
        const scenes: ShortPayload['scenes'] = v.scenes.map(s => ({ ...s, imageKey: null, evidenceFrameId: s.evidence === 'before' ? before?.frame?.id ?? null : s.evidence === 'after' ? after?.frame?.id ?? null : null, start: 0, end: 0 }));
        const payload: ShortPayload = { title: v.title, scenes, videoKey: null, durationSec: null };
        await setItem(ctx, base, { status: 'generating', payload });
        const jobScenes: ShortJobScene[] = [];
        for (const [i, s] of scenes.entries()) {
          let b64: string | null = null;
          if (s.evidence) {
            const frame = (s.evidence === 'before' ? before : after)?.frame;
            const obj = frame?.storedKey ? await ctx.r2.get(frame.storedKey) : null;
            b64 = obj ? bytesToDataUrl(new Uint8Array(await obj.arrayBuffer()), 'image/jpeg').split(',')[1] : null;
          } else if (s.imagePrompt) {
            ensureAlive(ctx, base.id);
            const img = await generateImage(ctx.env, ctx.spender, `${s.imagePrompt}. Vertical composition, calm natural light, no text, no letters, no logos.`, '1024x1536');
            ensureAlive(ctx, base.id); // deleted while the image was being made: do not store it
            const key = `w/${ctx.wsId}/short/${base.id}/${i}.jpg`;
            await ctx.r2.put(key, img.bytes, { httpMetadata: { contentType: img.mime } });
            // Deleted while the object was being written: remove it so nothing is left behind.
            if (!contentAlive(ctx, base.id)) { await ctx.r2.delete(key); throw new Gone(); }
            scenes[i] = { ...s, imageKey: key };
            b64 = img.b64;
          }
          jobScenes.push({ role: s.role, narration: s.narration, imageB64: b64, diagram: s.diagram, label: s.evidence ? (s.evidence === 'before' ? 'Before · your screen' : 'After · your screen') : null });
        }
        await setItem(ctx, base, { payload: { ...payload, scenes } });
        ensureAlive(ctx, base.id);
        await startMedia(ctx, base.id, { kind: 'short', title: v.title, voice: VOICES.caddie, scenes: jobScenes });
        break;
      }
    }
  } catch (e) {
    if (e instanceof Gone || !contentAlive(ctx, base.id)) return; // deleted: nothing to record
    const message = e instanceof MediaUnavailable ? e.message : e instanceof Error && !(e.name === 'MetaError' || e.name === 'LiveCallsDisabled' || e.name === 'BudgetExceeded' || e.name === 'InvalidOutput') ? e.message : failureStatus(e).message;
    await setItem(ctx, base, { status: 'failed', error: message });
  }
}

/**
 * Conservative flat Modal reservation per job, covering the worst case of the
 * renderer's limits: 4 physical cores and 3 GiB for 180 s startup + 300 s run,
 * plus ingress. Kept in the separate Modal ledger, never the Meta budget.
 */
const MEDIA_JOB_USD = { podcast: 0.04, short: 0.04 } as const;

async function startMedia(ctx: Ctx, contentId: string, job: Parameters<typeof startJob>[1]): Promise<void> {
  const ticket = await ctx.mediaSpender.reserve(MEDIA_JOB_USD[job.kind], `media-${job.kind}`);
  let jobId: string;
  try {
    jobId = await startJob(ctx.env, job);
  } catch (e) {
    // Refund only when the job was certainly not started (disabled or rejected).
    if (e instanceof MediaUnavailable) await ctx.mediaSpender.settle(ticket, 0);
    throw e;
  }
  await ctx.mediaSpender.settle(ticket, MEDIA_JOB_USD[job.kind]);
  await ctx.trackJob(contentId, jobId);
}

async function proposeCard(ctx: Ctx, session: Session, rule: string, asks: ManualPayload['cardAsks'], sourceMomentIds: string[]): Promise<void> {
  const existing = ctx.store.list('card').find(c => c.sessionId === session.id && c.status === 'proposed');
  const card: CaddieCard = {
    id: existing?.id ?? id('card'), sessionId: session.id, text: rule,
    scope: session.task ? `Tasks like: ${session.task}` : 'This kind of task', targetTool: session.tool ?? 'your AI', asks,
    status: 'proposed', history: [{ status: 'proposed', at: now(), by: 'caddie', note: null }], sourceMomentIds, provenance: modelProvenance(ctx.env),
  };
  await ctx.store.put('card', card);
}

export type CardAction = 'approve' | 'edit' | 'reject' | 'revoke' | 'applied';

export async function cardAction(ctx: Ctx, cardId: string, action: CardAction, text?: string): Promise<CaddieCard | { error: string }> {
  const card = ctx.store.get('card', cardId);
  if (!card) return { error: 'not_found' };
  const allowed: Record<CardAction, CaddieCard['status'][]> = {
    approve: ['proposed'], edit: ['proposed', 'approved'], reject: ['proposed'],
    revoke: ['approved', 'applied', 'observed-working'], applied: ['approved'],
  };
  if (!allowed[action].includes(card.status)) return { error: `cannot_${action}_${card.status}` };
  const at = now();
  let next: CaddieCard = card;
  if (action === 'edit') {
    const t = (text ?? '').trim();
    if (t.length < 8 || t.length > 300) return { error: 'invalid_text' };
    // The edited rule decides what counts as "working": requirements come from its own words
    // (none recognized → never auto-verified), and the copy text follows the edit.
    const asks = asksFromText(t);
    next = { ...card, text: t, asks, provenance: 'user', history: [...card.history, { status: card.status, at, by: 'user', note: asks.length ? 'Edited the rule text.' : 'Edited the rule text; the Caddie cannot check this rule automatically.' }] };
  } else {
    const status = ({ approve: 'approved', reject: 'rejected', revoke: 'revoked', applied: 'applied' } as const)[action];
    next = { ...card, status, history: [...card.history, { status, at, by: 'user', note: null }] };
  }
  await ctx.store.put('card', next);
  if (action === 'edit') {
    const copy = ctx.store.list('inbox').find(i => i.refId === next.id && i.kind === 'caddie-card');
    if (copy) {
      const hint = applyHint(next.targetTool, next.text);
      await ctx.store.put('inbox', { ...copy, text: hint.text, applyHint: hint.how, at, copiedAt: null });
    }
  }
  if (action === 'approve') {
    const hint = applyHint(next.targetTool, next.text);
    await ctx.store.put('inbox', { id: id('in'), kind: 'caddie-card', text: hint.text, applyHint: hint.how, refId: next.id, at, copiedAt: null });
  }
  return next;
}

export async function reviewFlashcard(ctx: Ctx, contentId: string, cardId: string, result: 'applied' | 'unsure'): Promise<void> {
  await ctx.store.update('content', contentId, c => {
    const p = c.payload as FlashcardsPayload;
    const cards = p.cards.map(fc => {
      if (fc.id !== cardId) return fc;
      const n = nextDue(fc.interval, result, Date.now());
      return { ...fc, dueAt: n.dueAt, interval: n.interval, reviews: [...fc.reviews, { at: now(), result }] };
    });
    return { ...c, payload: { cards }, updatedAt: now() };
  });
}

export async function podcastAsk(ctx: Ctx, contentId: string, question: string, atSec: number): Promise<{ answer: string } | { error: string }> {
  const item = ctx.store.get('content', contentId);
  const session = item && ctx.store.get('session', item.sessionId);
  if (!item || item.format !== 'podcast' || !item.payload || !session) return { error: 'not_found' };
  const p = item.payload as PodcastPayload;
  const heard = p.lines.filter(l => l.end === 0 || l.start <= atSec).map(l => `${l.speaker}: ${l.text}`).join('\n');
  try {
    const { value } = await runTask(ctx.env, ctx.spender, podcastAskTask, { text: `Question: ${question}\n\nEpisode so far:\n${heard}\n\nEvidence:\n${evidenceText(ctx, session)}` });
    await setItem(ctx, item, { payload: { ...p, asks: [...p.asks, { question, answer: value.answer, atSec, at: now(), provenance: modelProvenance(ctx.env) }] } });
    return value;
  } catch (e) {
    return { error: failureStatus(e).message };
  }
}

// ---------------------------------------------------------------- Practice Range

/** Selected-session context only; standalone practice gets none (it never inherits unrelated work). */
function practiceContext(ctx: Ctx, session: Session | null, earlier: PracticeAttempt | null): string {
  const lines: string[] = [];
  if (session) {
    if (session.task) lines.push(`This session's task: ${session.task}`);
    if (session.design) lines.push(`Habit from this session: ${session.design.habit}`);
    const missing = new Set<string>();
    for (const m of sessionMoments(ctx.store, session.id)) if (m.decision?.action === 'intervene' && !m.misread) for (const k of m.decision.missingIngredients) missing.add(k);
    if (missing.size) lines.push(`Details the person's requests left out in this session: ${[...missing].join(', ')}`);
  } else lines.push('Standalone practice with no session. Use a small café launching a new menu item.');
  if (earlier?.scenario) lines.push(`Change exactly one condition of this earlier practice request and keep the same kind of business: ${earlier.scenario}`);
  return lines.join('\n');
}

export async function startPractice(ctx: Ctx, autoOpened: boolean, sessionId: string | null, changedFrom: string | null = null): Promise<PracticeAttempt> {
  const own = (sessionId ? ctx.store.get('session', sessionId) : null) ?? null;
  // A second tap while a scene is still being written returns that scene instead of paying for another.
  const pending = ctx.store.list('practice').find(x => x.status === 'scenario' && x.sessionId === sessionId && Date.now() - Date.parse(x.startedAt) < 90_000);
  if (pending) return pending;
  const earlier = changedFrom ? ctx.store.get('practice', changedFrom) : null;
  const attempt: PracticeAttempt = {
    id: id('pr'), sessionId, scenario: '', hint: null, startedAt: now(), autoOpened, hintViewed: false, transcript: null,
    imageKey: null, imageStatus: 'none', ingredients: null, checkNote: null, assistance: null, status: 'scenario', error: null, provenance: modelProvenance(ctx.env),
    fixture: practiceInputFixture(own, !!ctx.sampleWorkspace),
    scene: null, reading: null, readingStatus: 'none', judgment: null, revision: null, finishedAt: null,
    changedFrom: earlier && earlier.sessionId === sessionId ? earlier.id : null,
  };
  await ctx.store.put('practice', attempt);
  try {
    const { value } = await runTask(ctx.env, ctx.spender, practiceScenarioTask, { text: practiceContext(ctx, own, earlier && earlier.sessionId === sessionId ? earlier : null) });
    return ctx.store.put('practice', { ...ctx.store.get('practice', attempt.id)!, scenario: value.scenario, hint: value.hint, scene: value.scene, status: 'open' });
  } catch (e) {
    return ctx.store.put('practice', { ...ctx.store.get('practice', attempt.id)!, status: 'failed', error: failureStatus(e).message });
  }
}

/** Draw the practice poster from the person's own brief and store it; the data URL feeds the image reading. */
async function practiceImage(ctx: Ctx, practiceId: string, brief: string, suffix = ''): Promise<{ key: string; dataUrl: string }> {
  const img = await generateImage(ctx.env, ctx.spender, `A promotional poster. The owner's brief, in their own words: "${brief}". Render no small text.`, '1024x1536');
  const key = `w/${ctx.wsId}/practice/${practiceId}${suffix}.jpg`;
  await ctx.r2.put(key, img.bytes, { httpMetadata: { contentType: img.mime } });
  if (!ctx.store.alive('practice', practiceId)) { await ctx.r2.delete(key); throw new Gone(); }
  return { key, dataUrl: `data:${img.mime};base64,${img.b64}` };
}

type Which = 'first' | 'revision';

/** Write fields into the first draft or into the revision, on the latest stored copy. */
async function patchDraft(ctx: Ctx, practiceId: string, which: Which, fields: Partial<PracticeRevision>): Promise<PracticeAttempt | null> {
  const cur = ctx.store.get('practice', practiceId);
  if (!cur) return null;
  if (which === 'first') return ctx.store.put('practice', { ...cur, ...(fields as Partial<PracticeAttempt>) });
  if (!cur.revision) return null;
  return ctx.store.put('practice', { ...cur, revision: { ...cur.revision, ...fields } });
}

/** Muse Spark reads the draft against the scene's facts. It is never given the brief. */
async function readDraft(ctx: Ctx, practiceId: string, which: Which, dataUrl?: string): Promise<void> {
  const p = ctx.store.get('practice', practiceId);
  const key = which === 'first' ? p?.imageKey : p?.revision?.imageKey;
  if (!p?.scene || !key) return;
  await patchDraft(ctx, practiceId, which, { readingStatus: 'reading' });
  try {
    let url = dataUrl;
    if (!url) {
      const obj = await ctx.r2.get(key);
      if (!obj) throw new Error('The draft image is no longer stored.');
      url = bytesToDataUrl(new Uint8Array(await obj.arrayBuffer()), obj.httpMetadata?.contentType ?? 'image/jpeg');
    }
    const facts = INGREDIENT_KEYS.map(k => `${k}: ${p.scene!.facts[k].text}`).join('\n');
    const { value } = await runTask(ctx.env, ctx.spender, practiceObserveTask, { text: `Facts the poster was meant to carry:\n${facts}`, images: [url] });
    if (!ctx.store.alive('practice', practiceId)) return;
    await patchDraft(ctx, practiceId, which, { reading: { ...value, provenance: modelProvenance(ctx.env) }, readingStatus: 'ready' });
  } catch (e) {
    if (e instanceof Gone || !ctx.store.alive('practice', practiceId)) return;
    console.error(JSON.stringify({ event: 'practice_read_failed', which, name: (e as Error)?.name }));
    await patchDraft(ctx, practiceId, which, { readingStatus: 'failed' });
  }
}

export async function practiceRetryImage(ctx: Ctx, practiceId: string, which: Which = 'first'): Promise<void> {
  const p = ctx.store.get('practice', practiceId);
  const d = which === 'first' ? (p && p.status === 'done' ? p : null) : (p?.revision?.status === 'done' ? p.revision : null);
  if (!p || !d || d.imageStatus !== 'failed' || !d.transcript) return;
  await patchDraft(ctx, practiceId, which, { imageStatus: 'generating', error: null });
  try {
    const img = await practiceImage(ctx, practiceId, d.transcript, which === 'revision' ? '-r' : '');
    await patchDraft(ctx, practiceId, which, { imageKey: img.key, imageStatus: 'ready' });
    await readDraft(ctx, practiceId, which, img.dataUrl);
  } catch (e) {
    if (e instanceof Gone || !ctx.store.alive('practice', practiceId)) return;
    await patchDraft(ctx, practiceId, which, { imageStatus: 'failed', error: failureStatus(e).message });
  }
}

export async function practiceRetryReading(ctx: Ctx, practiceId: string, which: Which = 'first'): Promise<void> {
  const p = ctx.store.get('practice', practiceId);
  const status = which === 'first' ? p?.readingStatus : p?.revision?.readingStatus;
  if (status !== 'failed') return;
  await readDraft(ctx, practiceId, which);
}

/** Example briefs the Caddie wrote, scoped like the attempt: its own session, or the whole workspace when standalone. */
function exampleBriefs(ctx: Ctx, p: PracticeAttempt): string[] {
  const ms = p.sessionId ? sessionMoments(ctx.store, p.sessionId) : ctx.store.list('moment');
  return ms.map(m => m.decision?.exampleBrief).filter((x): x is string => !!x);
}

export async function practiceAttempt(ctx: Ctx, practiceId: string, input: { wav: Uint8Array } | { text: string }): Promise<void> {
  let p = ctx.store.get('practice', practiceId);
  if (!p || (p.status !== 'open' && p.status !== 'failed') || !p.scenario) return;
  const briefSource = 'text' in input ? 'typed' : 'spoken';
  p = await ctx.store.put('practice', { ...p, status: 'text' in input ? 'checking' : 'transcribing', error: null, briefSource });
  let drawn: { key: string; dataUrl: string } | null = null;
  try {
    const transcript = 'text' in input ? input.text.trim() : (await transcribe(ctx.env, ctx.spender, input.wav)).transcript;
    if (!transcript) throw new Error('No speech was detected. Try again closer to the microphone, or type the brief.');
    if (!ctx.store.alive('practice', practiceId)) return;
    p = await ctx.store.put('practice', { ...ctx.store.get('practice', practiceId)!, transcript, status: 'checking', imageStatus: 'generating' });
    const [check, image] = await Promise.allSettled([
      runTask(ctx.env, ctx.spender, practiceCheckTask, { text: `Practice request: ${p.scenario}\n${briefSource === 'typed' ? 'Typed' : 'Spoken'} brief: "${transcript}"` }),
      practiceImage(ctx, practiceId, transcript),
    ]);
    if (!ctx.store.alive('practice', practiceId)) return;
    drawn = image.status === 'fulfilled' ? image.value : null;
    if (check.status === 'rejected') throw check.reason;
    const assistance = labelPractice({ autoOpened: p.autoOpened, hintViewed: p.hintViewed, transcript }, exampleBriefs(ctx, p));
    p = await ctx.store.put('practice', {
      ...ctx.store.get('practice', practiceId)!, ingredients: check.value.value.ingredients, checkNote: check.value.value.note, assistance,
      imageKey: drawn?.key ?? null, imageStatus: drawn ? 'ready' : 'failed', status: 'done',
    });
    await ctx.store.put('skill', { id: id('sk'), dimension: 'description', assistance, strength: strengthFor(assistance, { practice: true }), momentId: null, practiceId, note: check.value.value.note, at: now(), fixture: skillFixture(p.fixture, p.provenance) });
  } catch (e) {
    if (e instanceof Gone || !ctx.store.alive('practice', practiceId)) return;
    const msg = e instanceof Error && e.name === 'Error' ? e.message : failureStatus(e).message;
    const cur = ctx.store.get('practice', practiceId)!;
    await ctx.store.put('practice', { ...cur, status: 'failed', error: msg, imageStatus: cur.imageStatus === 'generating' ? 'failed' : cur.imageStatus });
    return;
  }
  if (drawn) await readDraft(ctx, practiceId, 'first', drawn.dataUrl);
}

const VERDICT_TEXT: Record<DraftVerdict, string> = { ready: 'ready to put up', fix: 'in need of one fix', redo: 'worth starting over' };

/** The person's call on the first draft, before any feedback. Returns an error message when it cannot be stored. */
export async function practiceJudge(ctx: Ctx, practiceId: string, verdict: DraftVerdict, fix: keyof Ingredients | null): Promise<PracticeAttempt | string> {
  const p = ctx.store.get('practice', practiceId);
  if (!p?.scene || p.status !== 'done' || p.imageStatus !== 'ready') return 'There is no draft to judge yet.';
  if (p.judgment) return 'This draft has already been judged.';
  const assistance: Assistance = p.autoOpened || p.hintViewed ? 'coached' : 'independent';
  const judgment: PracticeJudgment = { verdict, fix: verdict === 'fix' ? fix : null, at: now(), assistance };
  const saved = await ctx.store.put('practice', { ...p, judgment });
  const what = verdict === 'fix' && fix ? `in need of one fix (${fix})` : VERDICT_TEXT[verdict];
  await ctx.store.put('skill', { id: id('sk'), dimension: 'discernment', assistance, strength: strengthFor(assistance, { practice: true }), momentId: null, practiceId, note: `Called the AI's draft ${what} before any feedback.`, at: now(), fixture: skillFixture(p.fixture, p.provenance) });
  return saved;
}

/** One revised brief after the feedback. It never changes the first brief, its check, image or labels. */
export async function practiceRevise(ctx: Ctx, practiceId: string, input: { wav: Uint8Array } | { text: string }): Promise<void> {
  const p = ctx.store.get('practice', practiceId);
  if (!p?.scene || !p.judgment || (p.revision && p.revision.status !== 'failed')) return;
  const briefSource = 'text' in input ? 'typed' : 'spoken';
  const rev: PracticeRevision = {
    startedAt: now(), transcript: null, briefSource, imageKey: null, imageStatus: 'none', ingredients: null, checkNote: null,
    reading: null, readingStatus: 'none', assistance: 'coached', status: 'text' in input ? 'checking' : 'transcribing', error: null,
  };
  await ctx.store.put('practice', { ...p, revision: rev });
  let drawn: { key: string; dataUrl: string } | null = null;
  try {
    const transcript = 'text' in input ? input.text.trim() : (await transcribe(ctx.env, ctx.spender, input.wav)).transcript;
    if (!transcript) throw new Error('No speech was detected. Try again closer to the microphone, or type the brief.');
    if (!ctx.store.alive('practice', practiceId)) return;
    await patchDraft(ctx, practiceId, 'revision', { transcript, status: 'checking', imageStatus: 'generating' });
    const [check, image] = await Promise.allSettled([
      runTask(ctx.env, ctx.spender, practiceCheckTask, { text: `Practice request: ${p.scenario}\n${briefSource === 'typed' ? 'Typed' : 'Spoken'} brief: "${transcript}"` }),
      practiceImage(ctx, practiceId, transcript, '-r'),
    ]);
    if (!ctx.store.alive('practice', practiceId)) return;
    drawn = image.status === 'fulfilled' ? image.value : null;
    if (check.status === 'rejected') throw check.reason;
    const saved = await patchDraft(ctx, practiceId, 'revision', {
      ingredients: check.value.value.ingredients, checkNote: check.value.value.note, imageKey: drawn?.key ?? null, imageStatus: drawn ? 'ready' : 'failed', status: 'done',
    });
    await ctx.store.put('skill', { id: id('sk'), dimension: 'description', assistance: 'coached', strength: null, momentId: null, practiceId, note: `Revised brief: ${check.value.value.note}`, at: now(), fixture: skillFixture(saved?.fixture, p.provenance) });
  } catch (e) {
    if (e instanceof Gone || !ctx.store.alive('practice', practiceId)) return;
    const msg = e instanceof Error && e.name === 'Error' ? e.message : failureStatus(e).message;
    const cur = ctx.store.get('practice', practiceId)!;
    await patchDraft(ctx, practiceId, 'revision', { status: 'failed', error: msg, imageStatus: cur.revision?.imageStatus === 'generating' ? 'failed' : cur.revision?.imageStatus ?? 'none' });
    return;
  }
  if (drawn) await readDraft(ctx, practiceId, 'revision', drawn.dataUrl);
}

export async function practiceFinish(ctx: Ctx, practiceId: string): Promise<PracticeAttempt | null> {
  const p = ctx.store.get('practice', practiceId);
  if (!p?.judgment || p.finishedAt) return p ?? null;
  return ctx.store.put('practice', { ...p, finishedAt: now() });
}

export function momentsFor(ctx: Ctx, sessionId: string): Moment[] {
  return sessionMoments(ctx.store, sessionId);
}

export type { ContentFormat };
