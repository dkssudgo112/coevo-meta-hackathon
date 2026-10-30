import type { Readiness } from '../../../packages/contracts/index.ts';
import { liveEnabled, models } from './meta.ts';
import { mediaConfigured } from './media.ts';
import type { Env } from './env.ts';
import { error, id, json, sha256 } from './util.ts';

export { Workspace } from './workspace.ts';
export { Budget } from './budget-do.ts';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' blob: data:", "media-src 'self' blob:", "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; '),
  'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function withHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

async function createWorkspace(req: Request, env: Env, kind: 'user' | 'sample'): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const budget = env.BUDGET.get(env.BUDGET.idFromName('global'));
  if (!(await budget.allowCreate(await sha256(`coevo:${ip}`), kind === 'sample' ? 10 : 20))) {
    return error(429, 'rate_limited', 'Too many new workspaces from this network. Try again later.');
  }
  const wsId = id('w');
  const stub = env.WORKSPACE.get(env.WORKSPACE.idFromName(wsId));
  return stub.fetch(new Request(`https://do/api/w/${wsId}/init`, { method: 'POST', body: JSON.stringify({ kind }) }));
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);

  if (path === '/api/health' && req.method === 'GET') {
    const global = await env.BUDGET.get(env.BUDGET.idFromName('global')).status();
    const payload: Readiness & { budget: typeof global } = {
      service: 'coevo', mode: liveEnabled(env) ? 'live' : 'mock', metaKeyConfigured: Boolean(env.MODEL_API_KEY?.trim()),
      liveCallsEnabled: liveEnabled(env), mediaServiceConfigured: mediaConfigured(env), model: models(env).text, implementation: 'caddie', budget: global,
    };
    return json(payload);
  }
  if (path === '/api/workspaces' && req.method === 'POST') return createWorkspace(req, env, 'user');
  if (path === '/api/sample' && req.method === 'POST') return createWorkspace(req, env, 'sample');

  const m = path.match(/^\/api\/w\/(w_[a-z0-9]{8,24})(\/.*)?$/);
  if (m) {
    if (m[2] === '/init') return error(404, 'not_found', 'Unknown route.');
    return env.WORKSPACE.get(env.WORKSPACE.idFromName(m[1])).fetch(req);
  }
  return error(404, 'not_found', 'Unknown route.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return withHeaders(await route(req, env));
    } catch {
      return withHeaders(error(500, 'server_error', 'Something went wrong on the server.'));
    }
  },
} satisfies ExportedHandler<Env>;
