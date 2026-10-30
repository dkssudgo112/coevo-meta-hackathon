// Deterministic guardrails around the model's intervention proposal.
// The model decides whether and how to intervene; these rules keep it from
// interrupting typing, skipping ladder steps, nagging, or praising.

import type { Decision, Ingredients, LadderStep, Moment, Reading } from '../../contracts/index.ts';
import { LADDER } from '../../contracts/index.ts';
import { isGroundedQuote, stripBanned } from './text.ts';

export interface LadderPolicy {
  cooldownMs: number;
  /** Cooldown multiplier after the user pressed Later or dismissed. */
  laterMultiplier: number;
  maxInterventionsPerSession: number;
}

export const DEFAULT_POLICY: LadderPolicy = {
  cooldownMs: 45_000,
  laterMultiplier: 2,
  maxInterventionsPerSession: 6,
};

export interface Proposal {
  action: 'stay-quiet' | 'intervene';
  step: LadderStep;
  reason: string;
  quote: string | null;
  message: string | null;
  note: string | null;
  missingIngredients: (keyof Ingredients)[];
  exampleBrief: string | null;
}

export interface LadderContext {
  reading: Reading | null;
  /** Earlier moments in the same session, oldest first. */
  history: Moment[];
  nowMs: number;
  /** An applied Caddie card matches this reading (same tool and task, AI asked for its details). */
  activeCard: boolean;
  policy?: LadderPolicy;
}

function stepIndex(step: LadderStep): number {
  return LADDER.indexOf(step);
}

const STEP_WORDS: Record<LadderStep, string> = {
  watch: 'watching',
  question: 'one question',
  ingredients: 'a list of what is missing',
  example: 'a full example',
};

/** Highest ladder step the Caddie may use next: one above the highest used so far (question first), or the example once the person asked for one. */
export function allowedStep(history: Moment[]): LadderStep {
  const interventions = history.filter(m => m.decision?.action === 'intervene');
  if (interventions.some(m => m.response?.kind === 'asked-example')) return 'example';
  const highest = interventions.reduce((max, m) => Math.max(max, stepIndex(m.decision!.step)), 0);
  return LADDER[Math.max(stepIndex('question'), Math.min(highest + 1, stepIndex('example')))];
}

function quiet(reason: string, guardrail: string, note: string | null = null): Proposal & { guardrail: string } {
  return { action: 'stay-quiet', step: 'watch', reason, quote: null, message: null, note, missingIngredients: [], exampleBrief: null, guardrail };
}

function cleanNote(note: string | null): string | null {
  return note ? stripBanned(note) : null;
}

/** Apply guardrails. Returns the final proposal plus the guardrail id that fired (or null). */
export function applyGuardrails(p: Proposal, ctx: LadderContext): Proposal & { guardrail: string | null } {
  const policy = ctx.policy ?? DEFAULT_POLICY;
  const r = ctx.reading;
  if (!r || !r.legible) return quiet('The screen was not readable, so the Caddie stays quiet.', 'illegible');
  if (r.userTyping) return quiet('You were typing. The Caddie does not interrupt input.', 'typing');
  if (ctx.activeCard && r.aiAskedClarifyingQuestion) {
    // An applied card is visibly working: this explanation beats a generic note (e.g. first sighting).
    // Keep the model's own wording only when it already says the AI asked first.
    const own = cleanNote(p.note);
    const note = own && /\bask/i.test(own) ? own : 'Your AI asked first, as your card says, so I am staying quiet.';
    return quiet('Your AI asked the questions your card asks for, so the Caddie stays quiet.', 'ai-asked-first', note);
  }
  if (p.action === 'stay-quiet') return { ...p, step: 'watch', message: null, note: cleanNote(p.note), exampleBrief: null, guardrail: null };

  const interventions = ctx.history.filter(m => m.decision?.action === 'intervene');
  if (interventions.length >= policy.maxInterventionsPerSession) {
    return quiet('The Caddie already spoke the maximum number of times this session.', 'session-limit');
  }

  const last = interventions[interventions.length - 1];
  if (last?.decision) {
    const lastMs = Date.parse(last.decision.decidedAt);
    const deferred = last.response?.kind === 'later' || last.response?.kind === 'dismissed';
    const answered = last.response?.kind === 'voice-answer' || last.response?.kind === 'typed-answer' || last.response?.kind === 'asked-example';
    const cooldown = policy.cooldownMs * (deferred ? policy.laterMultiplier : 1);
    if (!answered && ctx.nowMs - lastMs < cooldown) {
      return quiet('The Caddie spoke recently and is giving you room.', deferred ? 'later-cooldown' : 'cooldown');
    }
  }

  // Ladder: never skip ahead. A step above the allowed one is refused as a whole (its message was
  // written for that step), never relabelled; the pipeline may ask the model again for the allowed step.
  const allowed = allowedStep(ctx.history);
  const step: LadderStep = p.step === 'watch' ? 'question' : p.step;
  let guardrail: string | null = null;
  if (stepIndex(step) > stepIndex(allowed)) {
    return quiet(`The Caddie held back ${STEP_WORDS[step]}; it has to try ${STEP_WORDS[allowed]} first.`, 'ladder-step');
  }
  if (step === 'example' && !p.exampleBrief) {
    return quiet('The Caddie held back an example that had no sample brief in it.', 'missing-example');
  }

  let message = p.message ? stripBanned(p.message) : null;
  if (p.message && message !== p.message) guardrail = guardrail ?? 'banned-phrase';
  if (!message) return quiet('The proposed message was empty after removing filler.', 'empty-message');

  let quote = p.quote;
  if (quote && !isGroundedQuote(quote, r.userRequest)) {
    quote = null;
    guardrail = guardrail ?? 'ungrounded-quote';
  }

  const exampleBrief = step === 'example' ? p.exampleBrief : null;
  return { ...p, step, message, note: cleanNote(p.note), quote, exampleBrief, guardrail };
}

export function toDecision(p: Proposal & { guardrail: string | null }, model: string | null, decidedAt: string, provenance: Decision['provenance']): Decision {
  return {
    action: p.action,
    step: p.step,
    reason: p.reason,
    quote: p.quote,
    message: p.message,
    note: p.note,
    missingIngredients: p.missingIngredients,
    exampleBrief: p.exampleBrief,
    guardrail: p.guardrail,
    provenance,
    model,
    decidedAt,
  };
}
