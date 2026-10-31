import type { MetaEnv } from './meta.ts';
import type { MediaEnv } from './media.ts';
import type { Workspace } from './workspace.ts';
import type { Budget } from './budget-do.ts';

export interface Env extends MetaEnv, MediaEnv {
  WORKSPACE: DurableObjectNamespace<Workspace>;
  BUDGET: DurableObjectNamespace<Budget>;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  COEVO_AI_MODE?: string;
  /** Lifetime spend ceiling for all paid calls, in USD. */
  COEVO_LIFETIME_CAP_USD?: string;
  /** Modal lifetime ceiling: defaults to $0.90; explicit funded opt-in is clamped to $25. */
  COEVO_MODAL_CAP_USD?: string;
  /** Enables /api/admin/* (ledger view, external reservations). Absent = routes do not exist. */
  COEVO_ADMIN_TOKEN?: string;
  /** 'true' only during a diagnosis window: enables /diag/egress (free, rate-limited). Absent = route does not exist. */
  COEVO_EGRESS_DIAG?: string;
  /** 'combined' (default): read + decide in one call. 'separate': two calls. */
  COEVO_TURN_MODE?: string;
}
