// Moment pipeline: reading → decision → guardrails → observed change → evidence.

import { type ArtifactPart, type CaddieCard, type Decision, type Ingredients, type Moment, type MomentTiming, type Pointer, type Reading, type Session, type SkillObservation } from '../../../packages/contracts/index.ts';
import { allowedStep, applyGuardrails, toDecision, type Proposal } from '../../../packages/core/src/ladder.ts';
import { cardObserved } from '../../../packages/core/src/cards.ts';
import { askedParts, choosePointers, insidePoster, MAX_SAM_CALLS, PART_PHRASES, pickPoster, POSTER_PHRASES } from '../../../packages/core/src/pointers.ts';
import { dimensionFor, observeChange, presentIngredients, strengthFor } from '../../../packages/core/src/labels.ts';
import { decisionTask, readingTask, turnTask, type DecisionInput, type TurnContext } from '../../../packages/core/src/prompts.ts';
import { BudgetExceeded, CostUnverifiable, InvalidAudio, InvalidOutput, liveEnabled, LiveCallsDisabled, MetaError, modelProvenance, ModelNotAllowed, models, RetryLater, runTask, segmentBoxes, type Box, type Spender } from './meta.ts';
import type { Env } from './env.ts';
import type { Store } from './store.ts';
import { id, now } from './util.ts';

export interface Ctx {
  env: Env;
  wsId: string;
  /** A judge/sample workspace: everything in it comes from a scripted scenario. */
  sampleWorkspace?: boolean;
  store: Store;
  /** Meta Model API budget (lifetime authority). */
  spender: Spender;
  /** Modal media budget (separate free balance). */
  mediaSpender: Spender;
  r2: R2Bucket;
  memory: () => Promise<string[]>;
  notice: (level: 'info' | 'warn', code: string, message: string) => void;
  /** Register a Modal media job for alarm-driven polling. */
  trackJob: (contentId: string, jobId: string) => Promise<void>;
  /** Make sure the stuck-generation watchdog runs soon after an item could stall. */
  watchdog?: () => Promise<void>;
  /** Id of this server instance; stored on items it is generating. */
  runner?: string;
}

export function failureStatus(e: unknown): { status: Moment['readingStatus']; message: string } {
  if (e instanceof LiveCallsDisabled) return { status: 'disabled', message: 'Live model calls are off on this server, so the Caddie cannot read the screen yet.' };
  if (e instanceof BudgetExceeded) return { status: 'budget', message: e.scope === 'sample' ? 'This sample used its whole budget, so nothing more is made here. Start a new sample to try again.' : e.scope === 'workspace' ? 'This workspace reached its spending limit for today. The Caddie will stay quiet.' : 'The project’s model budget is used up. The Caddie will stay quiet.' };
  if (e instanceof ModelNotAllowed) return { status: 'disabled', message: 'This server is configured with a model that has no verified price, so the Caddie will not call it.' };
  if (e instanceof InvalidAudio) return { status: 'error', message: 'The recording could not be read. Try again.' };
  if (e instanceof CostUnverifiable) return { status: 'error', message: 'The Caddie could not verify what this call would cost, so it did not make it.' };
  if (e instanceof RetryLater) return { status: 'error', message: `The model service is busy and asked to wait ${Math.ceil(e.waitSeconds)} s. The Caddie will look again on the next change.` };
  if (e instanceof MetaError) return { status: 'error', message: e.status === 402 ? 'Model billing is not available.' : `The model service returned ${e.status}.` };
  if (e instanceof InvalidOutput) return { status: 'error', message: 'The model reply could not be used.' };
  return { status: 'error', message: 'The Caddie could not reach the model service.' };
}

export function sessionMoments(store: Store, sessionId: string): Moment[] {
  return store.list('moment').filter(m => m.work.sessionId === sessionId).sort((a, b) => a.index - b.index);
}

/** Cards the person has put into their AI (applied), which can change what the AI does. */
export function appliedCards(store: Store): CaddieCard[] {
  return store.list('card').filter(c => c.status === 'applied' || c.status === 'observed-working');
}

/** The applied card this reading shows working, if any (same tool and task, AI asked for its details). */
export function matchedCard(store: Store, reading: Reading | null): { card: CaddieCard; asked: string[] } | null {
  for (const card of appliedCards(store)) {
    const m = cardObserved(card, reading);
    if (m.ok) return { card, asked: m.asked };
  }
  return null;
}

function repeatedVague(history: Moment[], reading: Reading): DecisionInput['repeatedVagueTerm'] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const m of [...history.filter(h => h.reading?.legible && !h.misread), { reading } as Moment]) {
    const req = m.reading?.userRequest;
    if (!req || seen.has(req)) continue;
    seen.add(req);
    for (const t of m.reading?.vagueTerms ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: DecisionInput['repeatedVagueTerm'] = null;
  for (const [term, count] of counts) if (!best || count > best.count) best = { term, count };
  return best && best.count >= 2 ? best : null;
}

export async function buildDecisionInput(ctx: Ctx, reading: Reading, history: Moment[]): Promise<DecisionInput> {
  const legible = history.filter(m => m.reading?.legible && !m.misread);
  const interventions = history.filter(m => m.decision?.action === 'intervene');
  const last = interventions[interventions.length - 1];
  const seen = new Set<string>();
  const recentRequests: DecisionInput['recentRequests'] = [];
  for (const m of legible) {
    const t = m.reading!.userRequest;
    if (!t || seen.has(t)) continue;
    seen.add(t);
    recentRequests.push({ at: m.at, text: t, vagueTerms: m.reading!.vagueTerms, ingredients: presentIngredients(m.reading) });
  }
  return {
    firstSighting: legible.length === 0,
    reading,
    recentRequests: recentRequests.slice(-6),
    repeatedVagueTerm: repeatedVague(history, reading),
    interventions: interventions.slice(-4).map(m => ({ at: m.decision!.decidedAt, step: m.decision!.step, message: m.decision!.message ?? '', response: m.response ? `${m.response.kind}${m.response.transcript ? `: ${m.response.transcript}` : ''}` : null })),
    activeCards: appliedCards(ctx.store).map(c => `${c.text} [applied in ${c.targetTool}; ${c.scope}]`),
    memory: (await ctx.memory()).slice(-8),
    secondsSinceLastIntervention: last?.decision ? Math.round((Date.now() - Date.parse(last.decision.decidedAt)) / 1000) : null,
    highestStepAllowed: allowedStep(history),
  };
}

export function ruleDecision(reason: string, guardrail: string): Decision {
  return { action: 'stay-quiet', step: 'watch', reason, quote: null, message: null, note: null, missingIngredients: [], exampleBrief: null, guardrail, provenance: 'rule', model: null, decidedAt: now() };
}

export async function decide(ctx: Ctx, reading: Reading, history: Moment[], extra = ''): Promise<{ decision: Decision; countMs: number; generateMs: number; calls: number }> {
  const input = await buildDecisionInput(ctx, reading, history);
  const res = await runTask(ctx.env, ctx.spender, decisionTask, { text: `${extra}${JSON.stringify(input)}` });
  const g = await guard(ctx, res.value, reading, history, res.model, extra);
  return { decision: g.decision, countMs: res.countMs + g.countMs, generateMs: res.latencyMs + g.generateMs, calls: res.calls + g.calls };
}

/** Guardrails that refuse a whole proposal because it was written for a step not allowed yet. */
const STEP_REFUSALS = new Set(['ladder-step', 'missing-example']);

/**
 * Apply the guardrails. When the model skipped ahead on the ladder (or offered an example with no
 * sample brief), ask the real model once more for the allowed step; if that also fails, stay quiet.
 * A refused message is never relabelled and shown under a lower step.
 */
async function guard(ctx: Ctx, proposal: Proposal, reading: Reading, history: Moment[], model: string, extra = ''): Promise<{ decision: Decision; countMs: number; generateMs: number; calls: number }> {
  const gctx = { reading, history, nowMs: Date.now(), activeCard: matchedCard(ctx.store, reading) !== null };
  const first = applyGuardrails(proposal, gctx);
  const zero = { countMs: 0, generateMs: 0, calls: 0 };
  if (!first.guardrail || !STEP_REFUSALS.has(first.guardrail)) return { decision: toDecision(first, model, now(), modelProvenance(ctx.env)), ...zero };
  const allowed = allowedStep(history);
  const why = first.guardrail === 'ladder-step'
    ? `Your previous proposal used the "${proposal.step}" step, which is not allowed yet.`
    : 'Your previous proposal used the example step without an exampleBrief.';
  try {
    const input = await buildDecisionInput(ctx, reading, history);
    const res = await runTask(ctx.env, ctx.spender, decisionTask, { text: `${extra}${why} The highest step allowed now is "${allowed}". Decide again: use that step or a lower one, or stay quiet. ${JSON.stringify(input)}` });
    const second = applyGuardrails(res.value, { ...gctx, nowMs: Date.now() });
    const timing = { countMs: res.countMs, generateMs: res.latencyMs, calls: res.calls };
    if (second.guardrail && STEP_REFUSALS.has(second.guardrail)) return { decision: toDecision(first, res.model, now(), modelProvenance(ctx.env)), ...timing };
    const tag = `${first.guardrail}-regenerated${second.guardrail ? `+${second.guardrail}` : ''}`;
    return { decision: toDecision({ ...second, guardrail: tag }, res.model, now(), modelProvenance(ctx.env)), ...timing };
  } catch (e) {
    console.log(JSON.stringify({ event: 'ladder_regenerate_failed', guardrail: first.guardrail, error: e instanceof Error ? e.name : 'unknown' }));
    return { decision: toDecision(first, model, now(), modelProvenance(ctx.env)), ...zero };
  }
}

/** Context for the combined turn: everything the decision needs except the reading itself. */
async function buildTurnContext(ctx: Ctx, history: Moment[]): Promise<TurnContext> {
  const legibleNone = !history.some(m => m.reading?.legible && !m.misread);
  const placeholder = { legible: true, tool: null, task: null, userRequest: null, userTyping: false, aiResponseSummary: null, aiAskedClarifyingQuestion: false, artifactVisible: false, vagueTerms: [], ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false }, confidence: 0 } satisfies Reading;
  const d = await buildDecisionInput(ctx, placeholder, history);
  return { firstSightingIfLegible: legibleNone, recentRequests: d.recentRequests, interventions: d.interventions, activeCards: d.activeCards, memory: d.memory, secondsSinceLastIntervention: d.secondsSinceLastIntervention, highestStepAllowed: d.highestStepAllowed };
}

/** 'combined' reads and decides in one call (fewer round trips); 'separate' uses two calls. */
export function turnMode(ctx: Ctx): MomentTiming['mode'] {
  return ctx.env.COEVO_TURN_MODE === 'separate' ? 'separate' : 'combined';
}

async function recordSkills(ctx: Ctx, moment: Moment, session: Session): Promise<void> {
  const change = moment.change;
  if (!change) return;
  const priorSessions = ctx.store.list('session').filter(s => s.id !== session.id && Date.parse(s.startedAt) < Date.parse(session.startedAt));
  const coachedBefore = priorSessions.some(s => ctx.store.list('moment').some(m => m.work.sessionId === s.id && m.decision?.action === 'intervene'));
  for (const dimension of dimensionFor(change)) {
    // The AI asking first is evidence that the applied card works; the rule came from the Caddie.
    const assistance = dimension === 'delegation' ? 'coached' : change.assistance;
    const obs: SkillObservation = {
      id: id('sk'), dimension, assistance,
      strength: strengthFor(assistance, { transfer: coachedBefore }),
      momentId: moment.id, practiceId: null, note: change.summary, at: now(), fixture: session.fixture,
    };
    await ctx.store.put('skill', obs);
  }
}

const INGREDIENT_LABEL: Record<string, string> = { audience: 'who it is for', price: 'the price', mood: 'the feeling', realPhoto: 'a real photo', productDetail: 'what exactly it is' };

async function observeCards(ctx: Ctx, moment: Moment): Promise<void> {
  if (!moment.reading?.aiAskedClarifyingQuestion) return;
  for (const card of appliedCards(ctx.store)) {
    if (card.status !== 'applied' || card.sessionId === moment.work.sessionId) continue;
    const m = cardObserved(card, moment.reading);
    if (!m.ok) continue;
    await ctx.store.update('card', card.id, c => ({
      ...c, status: 'observed-working',
      history: [...c.history, { status: 'observed-working', at: now(), by: 'observation', note: `${moment.reading?.tool ?? 'The AI'} asked for ${m.asked.map(k => INGREDIENT_LABEL[k]).join(', ')} before making it (moment ${moment.index + 1}).` }],
    }));
  }
}

/**
 * Visual coaching (plan 6.1): when a kept frame shows a designed artifact (poster, flyer…) and the
 * person's request named a price, a real photo or the product, SAM 3.1 first finds the poster, then the
 * parts; only boxes inside the poster count, so the same words in the chat are never pointed at. A part
 * the reading says is missing boxes the whole poster ("The price isn't visible."). Once per request
 * text in a session, after the decision, so it never delays the NOW card.
 */
async function pointAtArtifact(ctx: Ctx, momentId: string, imageDataUrl: string, history: Moment[]): Promise<void> {
  const moment = ctx.store.get('moment', momentId);
  const r = moment?.reading;
  if (!moment || !r?.artifactVisible || r.artifactKind !== 'design' || !r.artifactShows || moment.benchmark || !moment.frame?.storedKey || !liveEnabled(ctx.env)) return;
  const asked = askedParts(r.ingredients);
  if (!asked.length) return;
  if (history.some(h => h.pointerCheck && h.reading?.userRequest === r.userRequest)) return;
  const present = asked.filter(p => r.artifactShows!.includes(p)).slice(0, 2);
  let model = 'sam-3.1';
  try { model = models(ctx.env).segment; } catch { /* reported by the call below */ }
  let pointers: Pointer[] = [];
  const trace: NonNullable<NonNullable<Moment['pointerCheck']>['trace']> = [];
  let check: NonNullable<Moment['pointerCheck']>;
  try {
    let calls = 0;
    const sam = async (phrase: string) => { calls++; const r = await segmentBoxes(ctx.env, ctx.spender, imageDataUrl, phrase); trace.push(r.trace); return r.boxes; };
    let poster: Box | null = null;
    for (const phrase of POSTER_PHRASES) { poster = pickPoster(await sam(phrase)); if (poster) break; }
    const partBoxes: Partial<Record<ArtifactPart, Box[]>> = {};
    if (poster) {
      for (const p of present) {
        for (const phrase of PART_PHRASES[p]) {
          if (calls >= MAX_SAM_CALLS) break;
          const boxes = await sam(phrase);
          partBoxes[p] = [...(partBoxes[p] ?? []), ...boxes];
          if (boxes.some(b => insidePoster(b, poster!))) break;
        }
      }
    }
    pointers = choosePointers(asked, r.artifactShows, poster, partBoxes);
    check = { status: 'done', model, at: now(), trace, ...(poster ? {} : { error: 'No poster found on this frame.' }) };
  } catch (e) {
    check = { status: 'failed', model, at: now(), trace, error: failureStatus(e).message };
  }
  if (!ctx.store.alive('moment', momentId)) return;
  await ctx.store.update('moment', momentId, m => ({ ...m, pointers, pointerCheck: check }));
}

/** Decide whether to keep the frame as evidence; otherwise delete it from storage. */
export async function retainOrDiscard(ctx: Ctx, moment: Moment, history: Moment[]): Promise<Moment> {
  const f = moment.frame;
  if (!f?.storedKey) return moment;
  if (moment.benchmark) return moment; // benchmark frames are kept for evaluation until the user deletes them
  const prevReq = [...history].reverse().find(m => m.reading?.legible)?.reading?.userRequest ?? null;
  const keep = moment.decision?.action === 'intervene' || !!moment.change || (moment.reading?.legible && moment.reading.userRequest !== prevReq) || moment.reading?.aiAskedClarifyingQuestion || !!moment.reading?.artifactVisible;
  if (keep) return moment;
  await ctx.r2.delete(f.storedKey);
  return { ...moment, frame: { ...f, storedKey: undefined, deleted: true } };
}

export async function processMoment(ctx: Ctx, momentId: string, imageDataUrl: string): Promise<void> {
  let moment = ctx.store.get('moment', momentId);
  if (!moment) return;
  const session = ctx.store.get('session', moment.work.sessionId);
  if (!session) return;
  const history = sessionMoments(ctx.store, session.id).filter(m => m.index < moment!.index);

  const mode = turnMode(ctx);
  const timing: MomentTiming = { mode, countMs: 0, generateMs: 0, totalMs: 0, calls: 0 };
  let reading: Reading;
  let combinedProposal: Proposal | null = null;
  let combinedModel = '';
  try {
    if (mode === 'combined') {
      const context = await buildTurnContext(ctx, history);
      const res = await runTask(ctx.env, ctx.spender, turnTask, { text: `Context: ${JSON.stringify(context)}`, images: [imageDataUrl] });
      reading = res.value.reading;
      combinedProposal = res.value.proposal;
      combinedModel = res.model;
      timing.countMs += res.countMs; timing.generateMs += res.latencyMs; timing.calls += res.calls;
    } else {
      const res = await runTask(ctx.env, ctx.spender, readingTask, { text: 'Read this screen photo.', images: [imageDataUrl] });
      reading = res.value;
      timing.countMs += res.countMs; timing.generateMs += res.latencyMs; timing.calls += res.calls;
    }
  } catch (e) {
    if (!ctx.store.alive('moment', momentId) || ctx.store.get('moment', momentId)?.interrupted) return; // deleted, or closed by restart recovery
    const f = failureStatus(e);
    // Raw frame is discarded when it could not be read (benchmark frames are kept for evaluation).
    const drop = !moment.benchmark;
    if (drop && moment.frame?.storedKey) await ctx.r2.delete(moment.frame.storedKey);
    await ctx.store.put('moment', { ...moment, readingStatus: f.status, readingError: f.message, frame: moment.frame && drop ? { ...moment.frame, storedKey: undefined, deleted: true } : moment.frame, decision: ruleDecision(f.message, f.status), timing: { ...timing, totalMs: Date.now() - Date.parse(moment.at) } });
    return;
  }

  // The user may have deleted the session or frame while the model was running, or a restart
  // may already have closed this moment honestly (its old in-memory task must not overwrite that).
  if (!ctx.store.alive('moment', momentId) || !ctx.store.alive('session', session.id) || ctx.store.get('moment', momentId)?.interrupted) return;

  if (!reading.legible) {
    // Unreadable frames are never kept (except benchmark frames, kept for evaluation).
    const drop = !moment.benchmark;
    if (drop && moment.frame?.storedKey) await ctx.r2.delete(moment.frame.storedKey);
    await ctx.store.put('moment', {
      ...moment, readingStatus: 'illegible', reading,
      frame: moment.frame && drop ? { ...moment.frame, storedKey: undefined, deleted: true } : moment.frame,
      decision: ruleDecision('The screen was not readable in this frame.', 'illegible'),
      timing: { ...timing, totalMs: Date.now() - Date.parse(moment.at) },
    });
    return;
  }

  moment = { ...moment, readingStatus: 'ok', reading, change: observeChange(reading, history) };
  await ctx.store.put('moment', moment);
  if (session.tool !== reading.tool || session.task !== reading.task) {
    await ctx.store.put('session', { ...session, tool: reading.tool ?? session.tool, task: reading.task ?? session.task });
  }

  let decision: Decision;
  if (combinedProposal) {
    const g = await guard(ctx, combinedProposal, reading, history, combinedModel);
    decision = g.decision;
    timing.countMs += g.countMs; timing.generateMs += g.generateMs; timing.calls += g.calls;
  } else {
    try {
      const d = await decide(ctx, reading, history);
      decision = d.decision;
      timing.countMs += d.countMs; timing.generateMs += d.generateMs; timing.calls += d.calls;
    } catch (e) {
      const f = failureStatus(e);
      decision = ruleDecision(f.message, `decision-${f.status}`);
    }
  }
  if (!ctx.store.alive('moment', momentId) || !ctx.store.alive('session', session.id) || ctx.store.get('moment', momentId)?.interrupted) return;
  timing.totalMs = Date.now() - Date.parse(moment.at);
  moment = { ...ctx.store.get('moment', momentId)!, decision, timing };
  moment = await retainOrDiscard(ctx, moment, history);
  await ctx.store.put('moment', moment);
  if (!ctx.store.alive('moment', momentId)) return;
  await recordSkills(ctx, moment, session);
  await observeCards(ctx, moment);
  await pointAtArtifact(ctx, momentId, imageDataUrl, history);
}

/** After a voice answer or an example request, the Caddie replies on a frameless moment. */
export async function followUp(ctx: Ctx, source: Moment, extra: string): Promise<void> {
  const session = ctx.store.get('session', source.work.sessionId);
  if (!session || !source.reading) return;
  const all = sessionMoments(ctx.store, session.id);
  const reply: Moment = {
    id: id('m'), work: source.work, index: all.length ? all[all.length - 1].index + 1 : 0, at: now(), frame: null,
    readingStatus: 'ok', readingError: null, reading: { ...source.reading, userTyping: false }, misread: false,
    decision: null, response: null, change: null, provenance: modelProvenance(ctx.env), runner: ctx.runner,
  };
  await ctx.store.put('moment', reply);
  let decision: Decision;
  try {
    decision = (await decide(ctx, reply.reading!, all, extra)).decision;
  } catch (e) {
    const f = failureStatus(e);
    decision = ruleDecision(f.message, `decision-${f.status}`);
  }
  if (!ctx.store.alive('moment', reply.id) || ctx.store.get('moment', reply.id)?.interrupted) return; // deleted, or closed by restart recovery
  await ctx.store.put('moment', { ...ctx.store.get('moment', reply.id)!, decision });
}
