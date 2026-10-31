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

/** Opens the live WebSocket (token in the first message, never the URL) and records what arrives. */
function openLive(wsId, token, ms = 5000) {
  const url = `${base.replace(/^http/, 'ws')}/api/w/${wsId}/live`;
  const ws = new WebSocket(url);
  const got = { events: [], texts: [], closeCode: null, opened: false };
  got.done = new Promise(resolve => {
    const timer = setTimeout(() => resolve(got), ms);
    ws.onopen = () => { got.opened = true; if (token !== undefined) ws.send(JSON.stringify({ type: 'auth', token })); };
    ws.onmessage = m => { got.texts.push(m.data); try { got.events.push(JSON.parse(m.data)); } catch { /* pong */ } };
    ws.onclose = e => { got.closeCode = e.code; clearTimeout(timer); resolve(got); };
    ws.onerror = () => {};
  });
  got.ws = ws;
  got.until = async (pred, waitMs = 5000) => { const t = Date.now() + waitMs; while (Date.now() < t) { if (pred(got)) return true; await new Promise(r => setTimeout(r, 50)); } return pred(got); };
  return got;
}

const health = await call('/api/health');
check('health responds', health.res.ok && health.body.implementation === 'caddie', `mode=${health.body.mode}, live=${health.body.liveCallsEnabled}, media=${health.body.mediaServiceConfigured}`);
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(base)) check('deployed server is NOT in test fake-model mode', health.body.testFakeModels === false);
check('security headers', Boolean(health.res.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")) && health.res.headers.get('permissions-policy')?.includes('camera=(self)'));

const adm = await call('/api/admin/ledger');
check('admin ledger is closed to the public', adm.res.status === 404 || adm.res.status === 401, `status ${adm.res.status}`);
check('health reports a lifetime budget', health.body.budget?.scope === 'lifetime' && health.body.budget.capUsd > 0, `$${health.body.budget?.spentUsd} of $${health.body.budget?.capUsd}`);

const page = await fetch(`${base}/caddie`);
check('SPA route served with CSP', page.ok && (await page.text()).includes('<div id="root">') && Boolean(page.headers.get('content-security-policy')));

const a = await call('/api/workspaces', { method: 'POST' });
check('create workspace', a.res.ok && /^wu?_/.test(a.body.workspaceId) && a.body.deskToken && a.body.pairSecret);
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

check('CSP lets the page reach its own WebSocket', (health.res.headers.get('content-security-policy') ?? '').includes(`connect-src 'self' ${base.replace(/^http/, 'ws').replace(/\/$/, '')}`));
const legacy = await call(`/api/w/${a.body.workspaceId}/events`, {}, a.body.deskToken);
check('the old never-ending event stream is retired (404 stops old pages retrying)', legacy.res.status === 404 && legacy.body?.error?.code === 'events_retired' && !(legacy.res.headers.get('content-type') ?? '').includes('event-stream'));
const plain = await call(`/api/w/${a.body.workspaceId}/live`, {}, a.body.deskToken);
check('the live address only accepts WebSocket upgrades', plain.res.status === 426);
const stranger = openLive(a.body.workspaceId, 'not-a-token');
await stranger.done;
check('a live socket with a wrong token is closed and gets nothing', stranger.opened && stranger.closeCode === 4401 && stranger.texts.length === 0, `close ${stranger.closeCode}`);
const big = openLive(a.body.workspaceId, undefined);
await big.until(g => g.opened);
big.ws.send(JSON.stringify({ type: 'auth', token: 'x'.repeat(4096) }));
await big.done;
check('an oversized first message is refused before it is parsed', big.closeCode === 4401 && big.texts.length === 0, `close ${big.closeCode}`);
const crossLive = openLive(b.body.workspaceId, pair.body.phoneToken);
await crossLive.done;
check('a token from workspace A cannot open workspace B live', crossLive.closeCode === 4401 && crossLive.texts.length === 0, `close ${crossLive.closeCode}`);
const deskLive = openLive(a.body.workspaceId, a.body.deskToken, 15000);
const snapOk = await deskLive.until(g => g.events.some(e => e.type === 'snapshot'));
const snap = deskLive.events.find(e => e.type === 'snapshot');
check('the live socket sends a snapshot after the token', snapOk && snap.snapshot.workspace.paired === true && snap.snapshot.workspace.id === a.body.workspaceId);
const note = await call(`/api/w/${a.body.workspaceId}/inbox`, { method: 'POST', body: JSON.stringify({ kind: 'note', text: 'integration live check' }), headers: { 'Content-Type': 'application/json' } }, pair.body.phoneToken);
const pushed = await deskLive.until(g => g.events.some(e => e.type === 'upsert' && e.entity === 'inbox' && e.data.id === note.body?.id));
check('a change made from the phone reaches the Desk socket', note.res.ok && pushed);
deskLive.ws.send('ping');
check('heartbeat: "ping" is answered "pong"', await deskLive.until(g => g.texts.includes('pong')));
deskLive.ws.close(1000);

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
