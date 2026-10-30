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

/**
 * The maintainer approved US$3.00 in total for all Meta Model API development and
 * validation. The application stops at an operating ceiling of $2.50, keeping a
 * $0.50 margin. This is an application-enforced budget, not a provider billing cap.
 */
export const META_ABSOLUTE_MAX_USD = 3.0;
export const META_OPERATING_CEILING_USD = 2.5;
/** Modal uses its own separately verified free balance ($1.00); stay below it. */
export const MODAL_CEILING_USD = 0.9;

export const CAPS = {
  globalLifetimeUsd: META_OPERATING_CEILING_USD,
  workspacePerDayUsd: 0.6,
  sampleWorkspaceUsd: 0.15,
} as const;

/** Configuration may LOWER the Meta ceiling, never raise it above the approved operating ceiling. */
export function lifetimeCap(configured: string | undefined): number {
  const n = Number(configured);
  return Number.isFinite(n) && n > 0 ? Math.min(n, META_OPERATING_CEILING_USD) : META_OPERATING_CEILING_USD;
}

export function modalCap(configured: string | undefined): number {
  const n = Number(configured);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MODAL_CEILING_USD) : MODAL_CEILING_USD;
}

/** Lifetime ledger. No date field on purpose: day rollover can never reset it. */
export interface Ledger { spentUsd: number; reservations: number; since: string }

export function emptyLedger(nowIso: string): Ledger {
  return { spentUsd: 0, reservations: 0, since: nowIso };
}

/** Reserve if it fits under the cap; otherwise leave the ledger unchanged. */
export function ledgerReserve(l: Ledger, usd: number, cap: number): { ok: boolean; ledger: Ledger } {
  if (!(usd >= 0) || !Number.isFinite(usd)) return { ok: false, ledger: l };
  if (l.spentUsd + usd > cap + 1e-9) return { ok: false, ledger: l };
  return { ok: true, ledger: { ...l, spentUsd: l.spentUsd + usd, reservations: l.reservations + 1 } };
}

/** Settle a reservation to its actual amount. Never goes below zero. */
export function ledgerAdjust(l: Ledger, deltaUsd: number): Ledger {
  return { ...l, spentUsd: Math.max(0, l.spentUsd + deltaUsd) };
}

/** Exact maximum for one Spark attempt once input tokens are verified. */
export function sparkMaxCost(verifiedInputTokens: number, maxOutputTokens: number): number {
  return sparkCost({ input_tokens: verifiedInputTokens, output_tokens: maxOutputTokens });
}

export interface Usage { input_tokens?: number; output_tokens?: number; cached_tokens?: number }

export function sparkCost(u: Usage): number {
  const cached = u.cached_tokens ?? 0;
  const input = Math.max(0, (u.input_tokens ?? 0) - cached);
  return (input * PRICES.sparkInputPerM + cached * PRICES.sparkCachedPerM + (u.output_tokens ?? 0) * PRICES.sparkOutputPerM) / 1_000_000;
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
