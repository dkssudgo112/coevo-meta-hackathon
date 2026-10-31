import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_TIMEOUT_MS, checkState, liveUrl, PING_MS, READY_MS, SILENT_MS, startLive, type LiveSocket } from '../src/lib/store.ts';

const creds = { workspaceId: 'wu_abcdefgh12345678', token: 'secret-token-value', role: 'desk' as const };

test('the live address never carries the token', () => {
  const url = liveUrl(creds.workspaceId, { protocol: 'https:', host: 'coevo.example.dev' });
  assert.equal(url, 'wss://coevo.example.dev/api/w/wu_abcdefgh12345678/live');
  assert.ok(!url.includes(creds.token) && !url.includes('?'));
  assert.equal(liveUrl(creds.workspaceId, { protocol: 'http:', host: '127.0.0.1:8788' }), 'ws://127.0.0.1:8788/api/w/wu_abcdefgh12345678/live');
});

test('heartbeats leave room for one late pong before a reconnect', () => {
  assert.ok(SILENT_MS > 2 * PING_MS && SILENT_MS < 3 * PING_MS);
});

function fakeFetch(status: number, body: unknown, seen: { url?: string; auth?: string | null } = {}): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.url = String(url);
    seen.auth = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

test('the check before connecting sends the token only in a header and returns the snapshot', async () => {
  const seen: { url?: string; auth?: string | null } = {};
  const snap = { workspace: { id: creds.workspaceId }, sessions: [], moments: [], cards: [], content: [], practice: [], inbox: [], skills: [] };
  const r = await checkState(creds, fakeFetch(200, snap, seen));
  assert.equal(r.kind, 'ok');
  assert.equal(seen.url, `/api/w/${creds.workspaceId}/state`);
  assert.equal(seen.auth, `Bearer ${creds.token}`);
});

test('a device that is no longer paired stops; server trouble retries', async () => {
  assert.equal((await checkState(creds, fakeFetch(401, { error: { code: 'unauthorized' } }))).kind, 'unauthorized');
  assert.equal((await checkState(creds, fakeFetch(404, { error: { code: 'not_found' } }))).kind, 'unauthorized');
  assert.equal((await checkState(creds, fakeFetch(503, { error: { code: 'moving' } }))).kind, 'retry');
  assert.equal((await checkState(creds, fakeFetch(500, null))).kind, 'retry');
  const offline = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
  assert.equal((await checkState(creds, offline)).kind, 'retry');
});

test('a moved workspace is followed (in a browser the page then reloads at the new id)', async () => {
  const r = await checkState(creds, fakeFetch(409, { error: { code: 'workspace_moved', movedTo: 'wu_newplace12345678' } }));
  assert.equal(r.kind, 'moved');
  // A "moved" answer that points nowhere new is not followed.
  const same = await checkState(creds, fakeFetch(409, { error: { code: 'workspace_moved', movedTo: creds.workspaceId } }));
  assert.equal(same.kind, 'retry');
});

// ---------------------------------------------------------------- the live connection (fake timers)

class FakeSocket implements LiveSocket {
  readyState = 0;
  sent: string[] = [];
  closed: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  readonly url: string;
  constructor(url: string) { this.url = url; }
  send(d: string) { this.sent.push(d); }
  close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.closed = code; queueMicrotask(() => this.onclose?.({ code })); }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(d: string) { this.onmessage?.({ data: d }); }
}

const SNAP = { workspace: { id: creds.workspaceId }, sessions: [], moments: [], cards: [], content: [], practice: [], inbox: [], skills: [] };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

function harness(fetchImpl?: typeof fetch) {
  const sockets: FakeSocket[] = [];
  const conns: string[] = [];
  const events: unknown[] = [];
  let checks = 0;
  const f = fetchImpl ?? ((async () => { checks++; return new Response(JSON.stringify(SNAP), { status: 200 }); }) as unknown as typeof fetch);
  const stop = startLive(creds, { state: () => {}, event: e => events.push(e), conn: c => conns.push(c) }, {
    fetch: f, url: id => `wss://host/api/w/${id}/live`, socket: url => { const s = new FakeSocket(url); sockets.push(s); return s; },
  });
  return { sockets, conns, events, stop, checks: () => checks };
}

test('live: the token goes only in the first message; the snapshot makes the connection live', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const h = harness();
  await flush();
  assert.equal(h.sockets.length, 1);
  assert.ok(!h.sockets[0].url.includes(creds.token));
  h.sockets[0].open();
  assert.deepEqual(JSON.parse(h.sockets[0].sent[0]), { type: 'auth', token: creds.token });
  h.sockets[0].receive(JSON.stringify({ type: 'snapshot', snapshot: SNAP }));
  assert.equal(h.conns.at(-1), 'live');
  mock.timers.tick(READY_MS + 1);
  assert.equal(h.sockets[0].closed, null, 'a synced socket is not touched by the ready watchdog');
  h.stop();
});

test('live: a socket stuck connecting is dropped after READY_MS and reopened', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const h = harness();
  await flush();
  mock.timers.tick(READY_MS + 1);
  assert.notEqual(h.sockets[0].closed, null);
  assert.equal(h.conns.at(-1), 'retrying');
  mock.timers.tick(2000);
  await flush();
  assert.equal(h.sockets.length, 2, 'a new check and socket after the back-off');
  h.stop();
});

test('live: an open socket whose token gets no snapshot is dropped and reopened', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const h = harness();
  await flush();
  h.sockets[0].open();
  mock.timers.tick(READY_MS + 1);
  assert.notEqual(h.sockets[0].closed, null);
  mock.timers.tick(2000);
  await flush();
  assert.equal(h.sockets.length, 2);
  h.stop();
});

test('live: a connection that stops answering heartbeats is reopened', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const h = harness();
  await flush();
  const s = h.sockets[0];
  s.open();
  s.receive(JSON.stringify({ type: 'snapshot', snapshot: SNAP }));
  mock.timers.tick(PING_MS);
  assert.equal(s.sent.at(-1), 'ping');
  s.receive('pong');
  mock.timers.tick(PING_MS);
  assert.equal(s.closed, null, 'answered heartbeats keep it open');
  for (let i = 0; i < 3; i++) mock.timers.tick(PING_MS); // no pong any more
  assert.notEqual(s.closed, null);
  assert.equal(h.conns.at(-1), 'retrying');
  h.stop();
});

test('live: an HTTP check with no answer is aborted after CHECK_TIMEOUT_MS and retried', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const signals: AbortSignal[] = [];
  const hanging = ((_u: string, init?: RequestInit) => new Promise((_r, reject) => {
    signals.push(init!.signal!);
    init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  })) as unknown as typeof fetch;
  const h = harness(hanging);
  await flush();
  assert.equal(signals.length, 1);
  mock.timers.tick(CHECK_TIMEOUT_MS + 1);
  await flush();
  assert.ok(signals[0].aborted);
  assert.equal(h.conns.at(-1), 'retrying');
  assert.equal(h.sockets.length, 0, 'no socket without a successful check');
  mock.timers.tick(2000);
  await flush();
  assert.equal(signals.length, 2, 'checked again after the back-off');
  h.stop();
  assert.ok(signals[1].aborted, 'stop() aborts the pending check');
});

test('live: stop() closes the socket, ends retries and ignores late messages', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const h = harness();
  await flush();
  const s = h.sockets[0];
  s.open();
  s.receive(JSON.stringify({ type: 'snapshot', snapshot: SNAP }));
  const seen = h.events.length;
  h.stop();
  assert.equal(s.closed, 1000);
  s.receive(JSON.stringify({ type: 'workspace', workspace: { id: 'late' } }));
  assert.equal(h.events.length, seen, 'no event after stop');
  mock.timers.tick(60_000);
  await flush();
  assert.equal(h.sockets.length, 1, 'no reconnect after stop');
});

test('live: a server close (deploy, move) leads to a fresh check, then a new socket', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const h = harness();
  await flush();
  h.sockets[0].open();
  h.sockets[0].receive(JSON.stringify({ type: 'snapshot', snapshot: SNAP }));
  const before = h.checks();
  h.sockets[0].close(4409);
  await flush();
  mock.timers.tick(2000);
  await flush();
  assert.equal(h.checks(), before + 1);
  assert.equal(h.sockets.length, 2);
  h.stop();
});
