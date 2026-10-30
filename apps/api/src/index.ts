import type { Readiness } from '../../../packages/contracts/index';

interface Env {
  MODEL_API_KEY?: string;
  META_TEXT_MODEL?: string;
  COEVO_AI_MODE?: string;
  COEVO_ALLOW_LIVE_CALLS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/api/health') {
      const payload: Readiness = {
        service: 'coevo',
        mode: env.COEVO_AI_MODE === 'live' ? 'live' : 'mock',
        metaKeyConfigured: Boolean(env.MODEL_API_KEY?.trim()),
        liveCallsEnabled: env.COEVO_ALLOW_LIVE_CALLS === 'true',
        model: env.META_TEXT_MODEL ?? 'muse-spark-1.3',
        implementation: 'workspace-bootstrap',
      };
      return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
