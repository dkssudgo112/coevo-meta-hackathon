// Visual coaching (plan 6.1): which SAM 3.1 boxes may be shown on the person's poster.
// Pure and deterministic so the rules are unit-tested; the Worker only fetches the boxes.

import { ARTIFACT_PARTS, type ArtifactPart, type Ingredients, type Pointer } from '../../contracts/index.ts';

export interface PixelBox { x1: number; y1: number; x2: number; y2: number; w: number; h: number; c: number | null }

/** Which poster parts the person's request asked for: a price, their real photo, the product itself. */
export const PART_ASKED: Record<ArtifactPart, (i: Ingredients) => boolean> = { price: i => i.price, photo: i => i.realPhoto, title: i => i.productDetail };
/**
 * SAM noun phrases, tried in order until one gives a box inside the poster. Live check (Oct 31): on
 * a real Meta AI screenshot SAM found "price" (on the poster and in the chat above it) and the depicted
 * product ("cake", "cheesecake"), but nothing for "poster", "image", "picture", "price text" or "text".
 */
export const PART_PHRASES: Record<ArtifactPart, string[]> = { price: ['price'], photo: ['food'], title: ['title'] };
export const POSTER_PHRASES = ['poster'];

/** Phrases for a part, the reading's concrete subject first for the photo ("cheesecake"). */
export function partPhrases(part: ArtifactPart, subject: string | null | undefined): string[] {
  const s = subject?.toLowerCase().trim();
  return part === 'photo' && s && /^[a-z][a-z ]{1,38}$/.test(s) ? [s, ...PART_PHRASES.photo] : PART_PHRASES[part];
}

/** Muse Spark's estimate of the poster outline (fractions) as a pixel box in the frame's size. */
export function estimatedPoster(box: { x: number; y: number; w: number; h: number } | null | undefined, width: number, height: number): PixelBox | null {
  if (!box || !width || !height) return null;
  return { x1: Math.round(box.x * width), y1: Math.round(box.y * height), x2: Math.round((box.x + box.w) * width) - 1, y2: Math.round((box.y + box.h) * height) - 1, w: width, h: height, c: null };
}
/** At most this many SAM calls per checked moment ($0.0025 each). */
export const MAX_SAM_CALLS = 5;
const MISSING: Record<ArtifactPart, string> = { price: 'The price isn’t visible.', photo: 'Your product photo isn’t on it.', title: 'The product name isn’t on it.' };
const FOUND: Record<ArtifactPart, string> = { price: 'Price', photo: 'Product photo', title: 'Title' };

export function askedParts(i: Ingredients): ArtifactPart[] {
  return ARTIFACT_PARTS.filter(p => PART_ASKED[p](i));
}

function norm(b: PixelBox): Pointer['box'] {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(b.x1 / b.w), y: clamp(b.y1 / b.h), w: clamp((b.x2 - b.x1 + 1) / b.w), h: clamp((b.y2 - b.y1 + 1) / b.h) };
}
const area = (b: PixelBox) => (b.x2 - b.x1) * (b.y2 - b.y1);

/** The poster: the most confident box, larger first on ties. */
export function pickPoster(boxes: PixelBox[]): PixelBox | null {
  return [...boxes].sort((a, b) => (b.c ?? 0) - (a.c ?? 0) || area(b) - area(a))[0] ?? null;
}

/** A part box counts only when its centre lies inside the poster, so words in the chat above it are never pointed at. */
export function insidePoster(part: PixelBox, poster: PixelBox): boolean {
  const cx = (part.x1 + part.x2) / 2, cy = (part.y1 + part.y2) / 2;
  return cx >= poster.x1 && cx <= poster.x2 && cy >= poster.y1 && cy <= poster.y2 && area(part) < area(poster) * 0.9;
}

/**
 * Build the pointers. Missing parts (by the reading) box the whole poster with what is missing.
 * Present parts get their own box only when SAM found one inside the poster; otherwise nothing is claimed.
 */
export function choosePointers(asked: ArtifactPart[], shows: ArtifactPart[], poster: PixelBox | null, partBoxes: Partial<Record<ArtifactPart, PixelBox[]>>, posterSource: 'sam-3.1' | 'muse-spark' = 'sam-3.1'): Pointer[] {
  if (!poster) return [];
  const out: Pointer[] = [];
  for (const p of asked) {
    if (!shows.includes(p)) { out.push({ part: p, found: false, box: norm(poster), confidence: poster.c, text: MISSING[p], source: posterSource }); continue; }
    const inside = (partBoxes[p] ?? []).filter(b => insidePoster(b, poster)).sort((a, b) => (b.c ?? 0) - (a.c ?? 0))[0];
    if (inside) out.push({ part: p, found: true, box: norm(inside), confidence: inside.c, text: FOUND[p], source: 'sam-3.1' });
  }
  return out;
}
