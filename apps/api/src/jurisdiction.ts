import type { Env } from './env.ts';

/**
 * The US-jurisdiction workspace namespace. Local workerd (wrangler dev) does not implement
 * jurisdictions and says so; only then is the plain namespace used, for local tests. Deployed, any
 * other failure is raised, never silently replaced.
 */
export function usWorkspaces(env: Env): DurableObjectNamespace<Env['WORKSPACE'] extends DurableObjectNamespace<infer T> ? T : never> {
  try {
    const us = env.WORKSPACE.jurisdiction('us');
    us.idFromName('probe');
    return us;
  } catch (e) {
    if (e instanceof Error && /not implemented in workerd/i.test(e.message)) return env.WORKSPACE;
    throw e;
  }
}
