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
}
