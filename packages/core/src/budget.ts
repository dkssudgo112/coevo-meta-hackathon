// Cost estimates and hard caps. Prices from the public Meta pricing page
// (Standard tier, USD). Contributor variants are never used for user data.

export const PRICES = {
  sparkInputPerM: 1.25,
  sparkOutputPerM: 4.25,
  sparkCachedPerM: 0.15,
  imageEach: 0.01,
  samPerImage: 2.5 / 1000,
  transcribePerHour: 0.18,
  /** Rough Modal CPU cost per rendered audio minute (conservative). */
  mediaPerMinute: 0.01,
} as const;

export const CAPS = {
  globalPerDayUsd: 4.0,
  workspacePerDayUsd: 0.6,
  sampleWorkspaceUsd: 0.15,
} as const;

export interface Usage { input_tokens?: number; output_tokens?: number; cached_tokens?: number }

export function sparkCost(u: Usage): number {
  const cached = u.cached_tokens ?? 0;
  const input = Math.max(0, (u.input_tokens ?? 0) - cached);
  return (input * PRICES.sparkInputPerM + cached * PRICES.sparkCachedPerM + (u.output_tokens ?? 0) * PRICES.sparkOutputPerM) / 1_000_000;
}

/** Conservative pre-call reservation for a Spark call. */
export function sparkReserve(images: number, maxOutputTokens: number, textTokens = 3000): number {
  return sparkCost({ input_tokens: textTokens + images * 1600, output_tokens: maxOutputTokens });
}

export function transcribeCost(seconds: number): number {
  return (seconds / 3600) * PRICES.transcribePerHour;
}

export interface BudgetState { day: string; spentUsd: number }

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Returns the remaining budget after rolling the day if needed. */
export function remaining(state: BudgetState, capUsd: number, nowMs: number): number {
  const spent = state.day === dayKey(nowMs) ? state.spentUsd : 0;
  return Math.max(0, capUsd - spent);
}

export function charge(state: BudgetState, usd: number, nowMs: number): BudgetState {
  const day = dayKey(nowMs);
  return { day, spentUsd: (state.day === day ? state.spentUsd : 0) + usd };
}
