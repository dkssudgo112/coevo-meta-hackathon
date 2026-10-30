// Session wrap: shared learning design → five formats. Each format fails alone.

import type {
  CaddieCard, ContentFormat, ContentItem, FlashcardsPayload, ManualPayload, Moment, NotePayload, PodcastPayload,
  PracticeAttempt, Session, ShortPayload,
} from '../../../packages/contracts/index.ts';
import { CONTENT_FORMATS } from '../../../packages/contracts/index.ts';
import { designTask, flashcardsTask, manualTask, noteTask, podcastAskTask, podcastTask, practiceCheckTask, practiceScenarioTask, shortTask } from '../../../packages/core/src/prompts.ts';
import { isGroundedQuote, speechSeconds } from '../../../packages/core/src/text.ts';
import { firstDue, nextDue } from '../../../packages/core/src/spaced.ts';
import { labelPractice, strengthFor } from '../../../packages/core/src/labels.ts';
import { applyHint } from '../../../packages/core/src/cards.ts';
import { generateImage, modelProvenance, runTask, transcribe } from './meta.ts';
import { MediaUnavailable, startJob, type ShortJobScene } from './media.ts';
import { failureStatus, sessionMoments, type Ctx } from './pipeline.ts';
import { bytesToDataUrl, id, now } from './util.ts';

export const VOICES = { caddie: 'af_heart', guest: 'am_michael' } as const;

function clock(iso: string): string {
  return iso.slice(11, 16);
}

/** Compact, quotable evidence text for content prompts. */
export function evidenceText(ctx: Ctx, session: Session): string {
  const lines: string[] = [`Session ${session.id}: tool=${session.tool ?? 'unknown'}; task=${session.task ?? 'unknown'}; fixture=${session.fixture}`];
  for (const m of sessionMoments(ctx.store, session.id)) {
    if (m.misread) { lines.push(`[${m.id}] ${clock(m.at)} (marked misread by the person; ignore)`); continue; }
    const r = m.reading;
    const parts: string[] = [];
    if (r?.legible && r.userRequest) parts.push(`person asked the AI: "${r.userRequest}"`);
    if (r?.vagueTerms.length) parts.push(`vague words: ${r.vagueTerms.join(', ')}`);
    if (r?.aiResponseSummary) parts.push(`AI: ${r.aiResponseSummary}`);
    if (r?.aiAskedClarifyingQuestion) parts.push('AI asked clarifying questions first');
    const d = m.decision;
    if (d?.action === 'intervene') parts.push(`Caddie (${d.step}): "${d.message}"`);
    else if (d?.note) parts.push(`Caddie stayed quiet: ${d.note}`);
    if (m.response) parts.push(`person ${m.response.kind}${m.response.transcript ? ` (voice): "${m.response.transcript}"` : ''}`);
    if (m.change) parts.push(`observed change: ${m.change.summary} [${m.change.assistance}]`);
    if (parts.length) lines.push(`[${m.id}] ${clock(m.at)} ${parts.join(' | ')}`);
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

async function setItem(ctx: Ctx, item: ContentItem, patch: Partial<ContentItem>): Promise<ContentItem> {
  const cur = ctx.store.get('content', item.id) ?? item;
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
    await ctx.store.put('session', { ...ctx.store.get('session', sessionId)!, wrapStatus: 'failed' });
    ctx.notice('warn', 'wrap-failed', failureStatus(e).message);
    return;
  }
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
  for (const format of CONTENT_FORMATS) {
    const item = ctx.store.list('content').find(c => c.sessionId === sessionId && c.format === format);
    if (item?.status === 'queued') await generate(ctx, item.id);
  }
}

export async function generate(ctx: Ctx, contentId: string): Promise<void> {
  const item = ctx.store.get('content', contentId);
  if (!item) return;
  const session = ctx.store.get('session', item.sessionId);
  if (!session?.design) return;
  const base = await setItem(ctx, item, { status: 'generating', error: null, attempts: item.attempts + 1 });
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
        await proposeCard(ctx, session, v.cardRule, item.sourceMomentIds);
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
          let bytes: Uint8Array | null = null;
          if (s.evidence) {
            const frame = (s.evidence === 'before' ? before : after)?.frame;
            const obj = frame?.storedKey ? await ctx.r2.get(frame.storedKey) : null;
            bytes = obj ? new Uint8Array(await obj.arrayBuffer()) : null;
          } else if (s.imagePrompt) {
            const img = await generateImage(ctx.env, ctx.spender, `${s.imagePrompt}. Vertical composition, calm natural light, no text, no letters, no logos.`, '1024x1536');
            const key = `w/${ctx.wsId}/short/${base.id}/${i}.png`;
            await ctx.r2.put(key, img.bytes, { httpMetadata: { contentType: img.mime } });
            scenes[i] = { ...s, imageKey: key };
            bytes = img.bytes;
          }
          jobScenes.push({ role: s.role, narration: s.narration, imageB64: bytes ? bytesToDataUrl(bytes, 'image/png').split(',')[1] : null, diagram: s.diagram, label: s.evidence ? (s.evidence === 'before' ? 'Before · your screen' : 'After · your screen') : null });
        }
        await setItem(ctx, base, { payload: { ...payload, scenes } });
        await startMedia(ctx, base.id, { kind: 'short', title: v.title, voice: VOICES.caddie, scenes: jobScenes });
        break;
      }
    }
  } catch (e) {
    const message = e instanceof MediaUnavailable ? e.message : e instanceof Error && !(e.name === 'MetaError' || e.name === 'LiveCallsDisabled' || e.name === 'BudgetExceeded' || e.name === 'InvalidOutput') ? e.message : failureStatus(e).message;
    await setItem(ctx, base, { status: 'failed', error: message });
  }
}

/** Modal CPU rendering is charged as a conservative flat estimate per job. */
const MEDIA_JOB_USD = { podcast: 0.03, short: 0.02 } as const;

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

async function proposeCard(ctx: Ctx, session: Session, rule: string, sourceMomentIds: string[]): Promise<void> {
  const existing = ctx.store.list('card').find(c => c.sessionId === session.id && c.status === 'proposed');
  const card: CaddieCard = {
    id: existing?.id ?? id('card'), sessionId: session.id, text: rule,
    scope: session.task ? `Tasks like: ${session.task}` : 'This kind of task', targetTool: session.tool ?? 'your AI',
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
    next = { ...card, text: t, provenance: 'user', history: [...card.history, { status: card.status, at, by: 'user', note: 'Edited the rule text.' }] };
  } else {
    const status = ({ approve: 'approved', reject: 'rejected', revoke: 'revoked', applied: 'applied' } as const)[action];
    next = { ...card, status, history: [...card.history, { status, at, by: 'user', note: null }] };
  }
  await ctx.store.put('card', next);
  if (action === 'approve') {
    const hint = applyHint(next.targetTool, next.text);
    await ctx.store.put('inbox', { id: id('in'), kind: 'caddie-card', text: hint.text, applyHint: hint.how, refId: next.id, at, copiedAt: null });
    await ctx.remember(`Approved rule for ${next.targetTool}: ${next.text}`);
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

export async function startPractice(ctx: Ctx, autoOpened: boolean, sessionId: string | null): Promise<PracticeAttempt> {
  const attempt: PracticeAttempt = {
    id: id('pr'), sessionId, scenario: '', hint: null, startedAt: now(), autoOpened, hintViewed: false, transcript: null,
    imageKey: null, imageStatus: 'none', ingredients: null, checkNote: null, assistance: null, status: 'scenario', error: null, provenance: modelProvenance(ctx.env),
  };
  await ctx.store.put('practice', attempt);
  const session = sessionId ? ctx.store.get('session', sessionId) : [...ctx.store.list('session')].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const context = [
    session?.task ? `Recent task: ${session.task}` : '',
    session?.design ? `Habit: ${session.design.habit}` : '',
    ...(await ctx.memory()).slice(-5).map(m => `Known: ${m}`),
  ].filter(Boolean).join('\n') || 'No prior session. Use a small café launching a new menu item.';
  try {
    const { value } = await runTask(ctx.env, ctx.spender, practiceScenarioTask, { text: context });
    return ctx.store.put('practice', { ...ctx.store.get('practice', attempt.id)!, scenario: value.scenario, hint: value.hint, status: 'open' });
  } catch (e) {
    return ctx.store.put('practice', { ...ctx.store.get('practice', attempt.id)!, status: 'failed', error: failureStatus(e).message });
  }
}

export async function practiceAttempt(ctx: Ctx, practiceId: string, wav: Uint8Array): Promise<void> {
  let p = ctx.store.get('practice', practiceId);
  if (!p || (p.status !== 'open' && p.status !== 'failed') || !p.scenario) return;
  p = await ctx.store.put('practice', { ...p, status: 'transcribing', error: null });
  try {
    const { transcript } = await transcribe(ctx.env, ctx.spender, wav);
    if (!transcript) throw new Error('No speech was detected. Try again closer to the microphone.');
    p = await ctx.store.put('practice', { ...ctx.store.get('practice', practiceId)!, transcript, status: 'checking', imageStatus: 'generating' });
    const examples = ctx.store.list('moment').map(m => m.decision?.exampleBrief).filter((x): x is string => !!x);
    const [check, image] = await Promise.allSettled([
      runTask(ctx.env, ctx.spender, practiceCheckTask, { text: `Practice request: ${p.scenario}\nSpoken brief: "${transcript}"` }),
      generateImage(ctx.env, ctx.spender, `A promotional poster. The owner's brief, in their own words: "${transcript}". Render no small text.`, '1024x1536'),
    ]);
    let imageKey: string | null = null;
    if (image.status === 'fulfilled') {
      imageKey = `w/${ctx.wsId}/practice/${practiceId}.png`;
      await ctx.r2.put(imageKey, image.value.bytes, { httpMetadata: { contentType: image.value.mime } });
    }
    if (check.status === 'rejected') throw check.reason;
    const assistance = labelPractice({ autoOpened: p.autoOpened, hintViewed: p.hintViewed, transcript }, examples);
    p = await ctx.store.put('practice', {
      ...ctx.store.get('practice', practiceId)!, ingredients: check.value.value.ingredients, checkNote: check.value.value.note, assistance,
      imageKey, imageStatus: image.status === 'fulfilled' ? 'ready' : 'failed', status: 'done',
    });
    await ctx.store.put('skill', { id: id('sk'), dimension: 'description', assistance, strength: strengthFor(assistance, { practice: true }), momentId: null, practiceId, note: check.value.value.note, at: now(), fixture: modelProvenance(ctx.env) === 'fixture' });
  } catch (e) {
    const msg = e instanceof Error && e.name === 'Error' ? e.message : failureStatus(e).message;
    await ctx.store.put('practice', { ...ctx.store.get('practice', practiceId)!, status: 'failed', error: msg, imageStatus: ctx.store.get('practice', practiceId)!.imageStatus === 'generating' ? 'failed' : ctx.store.get('practice', practiceId)!.imageStatus });
  }
}

export function momentsFor(ctx: Ctx, sessionId: string): Moment[] {
  return sessionMoments(ctx.store, sessionId);
}

export type { ContentFormat };
