// Scene practice: deterministic feedback from stored data only (the scene's facts, what the brief check found,
// Muse Spark's reading of the draft, and the person's call). No score and no model-written verdict.
// Two limits are kept in every sentence: the reading is Muse Spark's, not a certified fact, and "can't tell" stays
// unknown; the brief check only says whether a kind of detail is present, never that its value was right.
import type { DraftReading, Ingredients, PracticeJudgment, PracticeScene, SeenStatus } from '../../contracts/index.ts';
import { INGREDIENT_KEYS } from '../../contracts/index.ts';

type Key = keyof Ingredients;

/** Short names for the five details, as the scene uses them. */
export const DETAIL_NAME: Record<Key, string> = {
  audience: 'who it’s for', price: 'the price', mood: 'the feeling', realPhoto: 'your real photo', productDetail: 'the product detail',
};

/**
 * What the draft shows per detail. The real photo is decided by a rule, not by looking: a generated image is never the
 * person's photo, and no photo is ever attached to compare with.
 */
export function seen(scene: PracticeScene, reading: DraftReading, k: Key): SeenStatus {
  if (k === 'realPhoto') return scene.hasRealPhoto ? 'missing' : 'unclear';
  return reading.items[k].status;
}

/** Details Muse Spark's reading found missing. "Can't tell" is never counted as missing. */
export function draftGaps(scene: PracticeScene, reading: DraftReading): Key[] {
  return INGREDIENT_KEYS.filter(k => seen(scene, reading, k) === 'missing');
}

/** Details Muse Spark could not tell from the image (the photo only when the scene has one to place). */
export function draftUnsure(scene: PracticeScene, reading: DraftReading): Key[] {
  return INGREDIENT_KEYS.filter(k => (k !== 'realPhoto' || scene.hasRealPhoto) && seen(scene, reading, k) === 'unclear');
}

export type GapCause = 'brief' | 'draft' | 'yours';

export interface GapPoint { key: Key; cause: GapCause; text: string }

/** Why a detail is missing: the brief check did not find it, the brief named it but the draft does not show it, or only the person can add it. */
export function gapCause(k: Key, brief: Ingredients | null): GapCause {
  if (k === 'realPhoto') return 'yours';
  return brief?.[k] ? 'draft' : 'brief';
}

function gapText(k: Key, cause: GapCause, scene: PracticeScene): string {
  if (cause === 'yours') return 'By rule, a generated image is never your photo. Place your own photo in the layout before it goes up.';
  if (cause === 'draft') return k === 'price'
    ? 'Your brief mentioned a price (the check does not compare the number with the notes), but Muse Spark did not see one in the draft. Image models often leave out exact text: add it yourself in the layout, or put it first and plainly.'
    : `Your brief mentioned ${DETAIL_NAME[k]} (the check does not compare it with the notes), but Muse Spark did not see it in the draft. Put it first and plainly.`;
  return `The check did not find ${DETAIL_NAME[k]} in your brief. The notes had: “${scene.facts[k].text}”`;
}

export type Tone = 'agree' | 'early' | 'partly';

export interface JudgeFeedback {
  tone: Tone;
  headline: string;
  points: GapPoint[];
  /** Details Muse Spark could not tell from the image: check them yourself. */
  unsure: Key[];
  /** The speaker's own line for up to two gaps (written with the scene). */
  stakes: { key: Key; text: string }[];
  next: string[];
}

export const names = (ks: Key[]) => ks.map(k => DETAIL_NAME[k]).join(', ').replace(/, ([^,]*)$/, ' and $1');

/** Compare the person's call with Muse Spark's reading of the draft. */
export function judgeFeedback(scene: PracticeScene, brief: Ingredients | null, reading: DraftReading, j: Pick<PracticeJudgment, 'verdict' | 'fix'>): JudgeFeedback {
  const gaps = draftGaps(scene, reading);
  const unsure = draftUnsure(scene, reading);
  const points = gaps.map(k => ({ key: k, cause: gapCause(k, brief), text: gapText(k, gapCause(k, brief), scene) }));
  const stakes = gaps.slice(0, 2).map(k => ({ key: k, text: scene.facts[k].stake }));
  const unsureLine = unsure.length ? ` Muse Spark could not tell ${names(unsure)} from the image; check ${unsure.length > 1 ? 'those' : 'that'} yourself.` : '';
  let tone: Tone; let headline: string;
  if (j.verdict === 'ready') {
    if (gaps.length) { tone = 'early'; headline = `Too early to put up: in Muse Spark’s reading, the draft is missing ${names(gaps)}.`; }
    else if (unsure.length) { tone = 'partly'; headline = `Muse Spark found nothing missing, but it could not tell ${names(unsure)} from the image. Check ${unsure.length > 1 ? 'those' : 'that'} before it goes up.`; }
    else { tone = 'agree'; headline = 'Muse Spark’s reading agrees: it saw every detail from the notes in the draft.'; }
    if (gaps.length && unsure.length) headline += unsureLine;
  } else if (j.verdict === 'fix') {
    const f = j.fix;
    const st = f ? seen(scene, reading, f) : null;
    const others = gaps.filter(k => k !== f);
    if (f && st === 'missing') {
      tone = others.length ? 'partly' : 'agree';
      headline = others.length ? `Right about ${DETAIL_NAME[f]}. In Muse Spark’s reading, the draft is also missing ${names(others)}.` : `Right: in Muse Spark’s reading, ${DETAIL_NAME[f]} is what is missing.`;
    } else if (f && st === 'unclear') {
      tone = 'partly';
      headline = `Muse Spark could not tell whether the draft shows ${DETAIL_NAME[f]}, so your call stands as yours.${others.length ? ` It did find ${names(others)} missing.` : ''}`;
    } else if (f && st === 'shown') {
      tone = 'partly';
      const ev = reading.items[f]?.evidence ?? '';
      headline = `Muse Spark saw ${DETAIL_NAME[f]} in the draft${ev ? ` (${ev.replace(/\.$/, '')})` : ''}. ${gaps.length ? `In its reading, what is missing is ${names(gaps)}.` : 'It found nothing missing.'}`;
    } else { tone = 'partly'; headline = gaps.length ? `In Muse Spark’s reading, the draft is missing ${names(gaps)}.` : 'Muse Spark found nothing missing.'; }
    if (st !== 'unclear') headline += unsureLine;
  } else {
    const fixable = gaps.filter(k => k !== 'realPhoto');
    if (gaps.includes('productDetail') || fixable.length >= 3) { tone = 'agree'; headline = `Starting over makes sense: in Muse Spark’s reading, the draft is missing ${names(gaps)}.`; }
    else if (gaps.length) { tone = 'partly'; headline = `Close: in Muse Spark’s reading, only ${names(gaps)} ${gaps.length > 1 ? 'are' : 'is'} missing. A targeted fix is quicker than starting over.`; }
    else { tone = 'partly'; headline = 'Muse Spark found nothing missing, so a targeted check may be enough.'; }
    headline += unsureLine;
  }
  const next: string[] = [];
  const unsaid = points.filter(p => p.cause === 'brief').map(p => p.key);
  const dropped = points.filter(p => p.cause === 'draft').map(p => p.key);
  if (unsaid.length) next.push(`Say ${names(unsaid)} in the brief, as the notes have ${unsaid.length > 1 ? 'them' : 'it'}.`);
  if (dropped.length) next.push(`Put ${names(dropped)} first and plainly, or add ${dropped.length > 1 ? 'them' : 'it'} yourself in the layout.`);
  if (unsure.length) next.push(`Look for ${names(unsure)} in the draft yourself.`);
  if (gaps.includes('realPhoto')) next.push('Use your own photo in the final poster; ask the AI for the layout around it.');
  return { tone, headline, points, unsure, stakes, next };
}

/**
 * Per detail across the two drafts. A detail counts as resolved only when the revised reading affirmatively shows it;
 * missing → can't tell is not an improvement, and stays among the unsure.
 */
export function compareDrafts(scene: PracticeScene, first: DraftReading, revised: DraftReading): { now: Key[]; still: Key[]; unsure: Key[] } {
  const now = INGREDIENT_KEYS.filter(k => seen(scene, revised, k) === 'shown' && seen(scene, first, k) !== 'shown');
  return { now, still: draftGaps(scene, revised), unsure: draftUnsure(scene, revised) };
}
