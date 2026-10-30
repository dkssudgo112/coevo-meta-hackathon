// Visual coaching (plan 6.1): which SAM 3.1 boxes may be shown on the person's poster.
// Pure and deterministic so the rules are unit-tested; the Worker only fetches the boxes.

import { ARTIFACT_PARTS, type ArtifactPart, type Ingredients, type Pointer } from '../../contracts/index.ts';

export interface PixelBox { x1: number; y1: number; x2: number; y2: number; w: number; h: number; c: number | null }

/** Which poster parts the person's request asked for: a price, their real photo, the product itself. */
export const PART_ASKED: Record<ArtifactPart, (i: Ingredients) => boolean> = { price: i => i.price, photo: i => i.realPhoto, title: i => i.productDetail };
export const PART_PHRASE: Record<ArtifactPart, string> = { price: 'price text', photo: 'product photo', title: 'headline text' };
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
export function choosePointers(asked: ArtifactPart[], shows: ArtifactPart[], poster: PixelBox | null, partBoxes: Partial<Record<ArtifactPart, PixelBox[]>>): Pointer[] {
  if (!poster) return [];
  const out: Pointer[] = [];
  for (const p of asked) {
    if (!shows.includes(p)) { out.push({ part: p, found: false, box: norm(poster), confidence: poster.c, text: MISSING[p] }); continue; }
    const inside = (partBoxes[p] ?? []).filter(b => insidePoster(b, poster)).sort((a, b) => (b.c ?? 0) - (a.c ?? 0))[0];
    if (inside) out.push({ part: p, found: true, box: norm(inside), confidence: inside.c, text: FOUND[p] });
  }
  return out;
}
