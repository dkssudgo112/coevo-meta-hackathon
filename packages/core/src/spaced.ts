// Spaced repetition for flashcards: 10 minutes, then 1, 3, 7 and 14 days.

export const INTERVALS_MS: readonly number[] = [
  10 * 60_000,
  24 * 3_600_000,
  3 * 24 * 3_600_000,
  7 * 24 * 3_600_000,
  14 * 24 * 3_600_000,
];

export function firstDue(fromMs: number): { dueAt: string; interval: number } {
  return { dueAt: new Date(fromMs + INTERVALS_MS[0]).toISOString(), interval: 0 };
}

/** `applied` advances to the next interval; `unsure` restarts at 10 minutes. */
export function nextDue(interval: number, result: 'applied' | 'unsure', nowMs: number): { dueAt: string; interval: number } {
  const next = result === 'applied' ? Math.min(interval + 1, INTERVALS_MS.length - 1) : 0;
  return { dueAt: new Date(nowMs + INTERVALS_MS[next]).toISOString(), interval: next };
}
