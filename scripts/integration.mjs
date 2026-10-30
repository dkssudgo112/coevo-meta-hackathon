// End-to-end HTTP checks against a running Coevo Caddie server (local or deployed).
// Usage: node scripts/integration.mjs [baseUrl]   (default http://127.0.0.1:8788)
// Makes no model calls unless the server has live calls enabled; then it sends ONE
// synthetic frame (fixture) and reports the reading status only.

import { deflateSync } from 'node:zlib';

const base = process.argv[2] ?? 'http://127.0.0.1:8788';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`); };

function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function call(path, init = {}, token) {
  const headers = { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { body = text; }
  return { res, body };
}

async function readSnapshot(wsId, token) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/w/${wsId}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
  const reader = res.body.getReader();
  let buf = '';
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    const m = buf.match(/data: (.+)\n\n/);
    if (m) { ctrl.abort(); return { type: res.headers.get('content-type'), event: JSON.parse(m[1]) }; }
  }
  ctrl.abort();
  return { type: res.headers.get('content-type'), event: null };
}

const health = await call('/api/health');
check('health responds', health.res.ok && health.body.implementation === 'caddie', `mode=${health.body.mode}, live=${health.body.liveCallsEnabled}, media=${health.body.mediaServiceConfigured}`);
check('security headers', Boolean(health.res.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")) && health.res.headers.get('permissions-policy')?.includes('camera=(self)'));

const page = await fetch(`${base}/caddie`);
check('SPA route served with CSP', page.ok && (await page.text()).includes('<div id="root">') && Boolean(page.headers.get('content-security-policy')));

const a = await call('/api/workspaces', { method: 'POST' });
check('create workspace', a.res.ok && /^w_/.test(a.body.workspaceId) && a.body.deskToken && a.body.pairSecret);
const b = await call('/api/workspaces', { method: 'POST' });

const unauth = await call(`/api/w/${a.body.workspaceId}/state`);
check('state requires a token', unauth.res.status === 401);

const badPair = await call(`/api/w/${a.body.workspaceId}/pair`, { method: 'POST', body: JSON.stringify({ pairSecret: 'nope' }), headers: { 'Content-Type': 'application/json' } });
check('wrong pair secret rejected', badPair.res.status === 403);
const pair = await call(`/api/w/${a.body.workspaceId}/pair`, { method: 'POST', body: JSON.stringify({ pairSecret: a.body.pairSecret }), headers: { 'Content-Type': 'application/json' } });
check('phone pairs with QR secret', pair.res.ok && Boolean(pair.body.phoneToken));
const replay = await call(`/api/w/${a.body.workspaceId}/pair`, { method: 'POST', body: JSON.stringify({ pairSecret: a.body.pairSecret }), headers: { 'Content-Type': 'application/json' } });
check('pair secret is one-time', replay.res.status === 403);

const cross = await call(`/api/w/${b.body.workspaceId}/state`, {}, pair.body.phoneToken);
check('token from workspace A cannot read workspace B', cross.res.status === 401);

const sse = await readSnapshot(a.body.workspaceId, a.body.deskToken);
check('SSE delivers a snapshot', sse.type?.startsWith('text/event-stream') && sse.event?.type === 'snapshot' && sse.event.snapshot.workspace.paired === true);

const form = new FormData();
form.append('frame', new File([png(64, 40, [240, 240, 236])], 'frame.png', { type: 'image/png' }));
form.append('source', 'sample');
form.append('deviceCropped', 'true');
const up = await call(`/api/w/${a.body.workspaceId}/frames`, { method: 'POST', body: form }, pair.body.phoneToken);
check('frame accepted', up.res.status === 202 && Boolean(up.body.momentId));
const fast = await call(`/api/w/${a.body.workspaceId}/frames`, { method: 'POST', body: (() => { const f = new FormData(); f.append('frame', new File([png(8, 8, [0, 0, 0])], 'f.png', { type: 'image/png' })); return f; })() }, pair.body.phoneToken);
check('frame rate limited', fast.res.status === 429);

let moment = null;
for (let i = 0; i < 60; i++) {
  const st = await call(`/api/w/${a.body.workspaceId}/state`, {}, a.body.deskToken);
  moment = st.body.moments.find(m => m.id === up.body.momentId);
  if (moment && moment.readingStatus !== 'pending') break;
  await new Promise(r => setTimeout(r, 1000));
}
if (health.body.liveCallsEnabled) {
  check('live reading produced a status', moment && moment.readingStatus !== 'pending', `status=${moment?.readingStatus}`);
} else {
  check('live calls off → honest "disabled" status, no invented reading', moment?.readingStatus === 'disabled' && moment.reading === null && moment.decision?.provenance === 'rule' && moment.frame?.deleted === true);
}

const del = await call(`/api/w/${a.body.workspaceId}/sessions/${up.body.sessionId}`, { method: 'DELETE' }, a.body.deskToken);
const after = await call(`/api/w/${a.body.workspaceId}/state`, {}, a.body.deskToken);
check('session deletion removes its moments', del.res.ok && after.body.sessions.length === 0 && after.body.moments.length === 0);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
process.exitCode = failed.length ? 1 : 0;
