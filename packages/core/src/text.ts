// Text checks shared by the Caddie and content pipeline.

/** Phrases the Caddie never says: praise, cheerleading and filler. */
export const BANNED_PHRASES: readonly string[] = [
  'great job', 'good job', 'nice work', 'well done', 'awesome', 'amazing', 'fantastic', 'excellent',
  'keep it up', 'you got this', "you've got this", 'great question', 'perfect!', "don't worry", 'no worries',
  'as an ai', 'i hope this helps', 'happy to help', 'let me know if', 'in conclusion', 'delve',
  'hi there', 'hello!', 'hey there', 'neatly', 'perfectly', 'brilliant', 'impressive', 'love that',
];

export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function containsBanned(text: string): string | null {
  const n = normalize(text);
  for (const p of BANNED_PHRASES) if (n.includes(p)) return p;
  return null;
}

/** Remove sentences that contain banned phrases. Returns null if nothing is left. */
export function stripBanned(text: string): string | null {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const kept = sentences.filter(s => !containsBanned(s)).join('').trim();
  return kept.length ? kept : null;
}

/**
 * A quote is grounded only if it appears in the source after normalization
 * (quotes, markdown marks, whitespace and case are ignored).
 */
export function isGroundedQuote(quote: string, source: string | null | undefined): boolean {
  if (!source) return false;
  const q = normalize(quote).replace(/^["']|["']$/g, '').trim();
  if (q.length < 2) return false;
  const src = normalize(source);
  // An ellipsis is allowed only when every piece appears in order in the source.
  const pieces = q.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean);
  let from = 0;
  for (const piece of pieces) {
    const at = src.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return pieces.length > 0;
}

function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1));
}

/** Jaccard similarity on word tokens, 0..1. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Spoken-word estimate used to check podcast and short lengths. */
export function speechSeconds(text: string, wordsPerMinute = 155): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (words / wordsPerMinute) * 60;
}
