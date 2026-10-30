// Evidence labeling rules. These are deterministic so the same history always
// produces the same labels. Lack of evidence is `unobserved`, never failure.

import type { Assistance, EvidenceStrength, Ingredients, Moment, ObservedChange, PracticeAttempt, Reading, SkillDimension } from '../../contracts/index.ts';
import { INGREDIENT_KEYS } from '../../contracts/index.ts';
import { similarity } from './text.ts';

export function presentIngredients(r: Reading | null): (keyof Ingredients)[] {
  if (!r) return [];
  return INGREDIENT_KEYS.filter(k => r.ingredients[k]);
}

function lastLegible(history: Moment[]): Moment | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.reading?.legible && !m.misread) return m;
  }
  return null;
}

/**
 * Compare the new reading with the previous legible moment and label the change.
 * - coached: the Caddie intervened (question/ingredients/example) since the person's last
 *   observed improvement (or the session start).
 * - ai-produced: the new request closely matches an example brief the Caddie supplied.
 * - independent: ingredients were added with no intervention in that window.
 */
export function observeChange(current: Reading, history: Moment[], opts: { newSessionAfterCard?: boolean } = {}): ObservedChange | null {
  const prev = lastLegible(history);
  const before = new Set(presentIngredients(prev?.reading ?? null));
  const added = presentIngredients(current).filter(k => !before.has(k));
  const aiAskedFirst = current.aiAskedClarifyingQuestion;
  // Discernment and diligence only from what the request explicitly says, and only once per request.
  const newRequest = !!current.userRequest && current.userRequest !== prev?.reading?.userRequest;
  const correctedDetail = newRequest && current.correctsAI ? current.correctsAI : null;
  const askedNoInvention = newRequest && current.asksNoInvention === true;
  if (!added.length && !aiAskedFirst && !correctedDetail && !askedNoInvention) return null;

  // Coaching counts from the person's last observed improvement (or the session start),
  // not just the last readable frame: a question two frames ago still shaped this change.
  const lastGain = [...history].reverse().find(m => !m.misread && (m.change?.addedIngredients.length ?? 0) > 0);
  const since = lastGain ? history.slice(history.indexOf(lastGain)) : history;
  const interventions = since.filter(m => m.decision?.action === 'intervene');
  const example = [...since].reverse().find(m => m.decision?.step === 'example' && m.decision.exampleBrief);
  let assistance: Assistance = 'independent';
  if (!added.length && aiAskedFirst && !correctedDetail && !askedNoInvention) {
    // The AI asking first is the effect of a Caddie card, not the person's own act.
    assistance = 'coached';
  } else if (example?.decision?.exampleBrief && current.userRequest && similarity(current.userRequest, example.decision.exampleBrief) >= 0.5) {
    assistance = 'ai-produced';
  } else if (interventions.length) {
    assistance = 'coached';
  }
  const parts: string[] = [];
  if (added.length) parts.push(`added ${added.join(', ')}`);
  if (aiAskedFirst) parts.push('the AI asked clarifying questions first');
  if (correctedDetail) parts.push(`told the AI to fix: ${correctedDetail}`);
  if (askedNoInvention) parts.push('told the AI not to invent details');
  void opts;
  return { addedIngredients: added, assistance, aiAskedFirst, correctedDetail, askedNoInvention, summary: parts.join('; ') };
}

export function strengthFor(assistance: Assistance, opts: { practice?: boolean; transfer?: boolean }): EvidenceStrength | null {
  if (assistance !== 'independent') return null;
  if (opts.practice) return 'practice';
  if (opts.transfer) return 'transfer';
  return 'in-task';
}

/**
 * Practice labels: an auto-opened exercise or a viewed hint can never count as
 * independent. Reusing the Caddie's example brief is ai-produced.
 */
export function labelPractice(a: Pick<PracticeAttempt, 'autoOpened' | 'hintViewed' | 'transcript'>, exampleBriefs: string[] = []): Assistance {
  if (!a.transcript || !a.transcript.trim()) return 'unobserved';
  if (exampleBriefs.some(b => similarity(a.transcript!, b) >= 0.5)) return 'ai-produced';
  if (a.autoOpened || a.hintViewed) return 'coached';
  return 'independent';
}

/** Map an observed change to the skill dimension it is evidence for. */
export function dimensionFor(change: ObservedChange): SkillDimension[] {
  const dims: SkillDimension[] = [];
  if (change.addedIngredients.length) dims.push('description');
  if (change.aiAskedFirst) dims.push('delegation');
  if (change.correctedDetail) dims.push('discernment');
  if (change.askedNoInvention) dims.push('diligence');
  return dims;
}
