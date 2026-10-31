import { followMove } from './api.ts';
import { useEffect, useRef, useState } from 'react';
import type { EntityName, ServerEvent, Snapshot } from '../../../../packages/contracts/index.ts';
import type { Creds } from './api.ts';

export type ConnState = 'connecting' | 'live' | 'retrying' | 'unauthorized';

const LIST: Record<EntityName, keyof Omit<Snapshot, 'workspace'>> = {
  session: 'sessions', moment: 'moments', card: 'cards', content: 'content', practice: 'practice', inbox: 'inbox', skill: 'skills',
};

export function apply(s: Snapshot | null, e: ServerEvent): Snapshot | null {
  if (e.type === 'snapshot') return e.snapshot;
  if (!s) return s;
  if (e.type === 'workspace') return { ...s, workspace: e.workspace };
  if (e.type === 'upsert') {
    const key = LIST[e.entity];
    const list = s[key] as { id: string }[];
    const i = list.findIndex(x => x.id === (e.data as { id: string }).id);
    const next = i >= 0 ? list.map((x, j) => (j === i ? e.data : x)) : [...list, e.data];
    return { ...s, [key]: next };
  }
  if (e.type === 'remove') {
    const key = LIST[e.entity];
    return { ...s, [key]: (s[key] as { id: string }[]).filter(x => x.id !== e.id) };
  }
  return s;
}

/** Heartbeat interval; the server's runtime answers "ping" with "pong" without waking the workspace. */
export const PING_MS = 30_000;
/** No pong for this long: the connection is treated as dead and reopened. */
export const SILENT_MS = 75_000;
/** The HTTP check before connecting gives up after this long. */
export const CHECK_TIMEOUT_MS = 10_000;
/** A socket that has not delivered its snapshot by now (stuck connecting, or no answer to the token) is reopened. */
export const READY_MS = 15_000;
const BACKOFF_MAX_MS = 15_000;
const OPEN = 1;

/** The live address. It carries no token: the socket sends it in its first message. */
export function liveUrl(workspaceId: string, loc: { protocol: string; host: string } = location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/api/w/${workspaceId}/live`;
}

export type Check = { kind: 'ok'; snapshot: Snapshot } | { kind: 'unauthorized' } | { kind: 'moved' } | { kind: 'retry' };

/**
 * One HTTP read before each (re)connect, with the token in a header: it shows the current state at
 * once, stops on a device that is no longer paired, and follows a workspace that moved region.
 */
export async function checkState(creds: Creds, f: typeof fetch = fetch, signal?: AbortSignal): Promise<Check> {
  try {
    const res = await f(`/api/w/${creds.workspaceId}/state`, { headers: { Authorization: `Bearer ${creds.token}` }, signal });
    if (res.status === 401 || res.status === 404) return { kind: 'unauthorized' };
    const data = await res.json().catch(() => null);
    if (res.status === 409 && followMove(creds, res.status, data)) return { kind: 'moved' };
    return res.ok && data ? { kind: 'ok', snapshot: data as Snapshot } : { kind: 'retry' };
  } catch {
    return { kind: 'retry' };
  }
}

/** The parts of a browser WebSocket the live connection uses (a stand-in in tests). */
export interface LiveSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface LiveOptions {
  fetch?: typeof fetch;
  socket?: (url: string) => LiveSocket;
  url?: (workspaceId: string) => string;
}

export interface LiveHandlers {
  state: (s: Snapshot) => void;
  event: (e: ServerEvent) => void;
  conn: (c: ConnState) => void;
}

/**
 * Keeps one live connection for these credentials until the returned stop() is called:
 * HTTP check (bounded, cancellable) → socket → token as the first message → snapshot → updates.
 * Every stuck state ends in a reconnect with back-off: a check with no answer, a socket that never
 * opens or never sends its snapshot, and a connection that stops answering heartbeats.
 */
export function startLive(creds: Creds, on: LiveHandlers, opts: LiveOptions = {}): () => void {
  const f = opts.fetch ?? fetch;
  const open = opts.socket ?? (url => new WebSocket(url) as unknown as LiveSocket);
  const address = opts.url ?? (id => liveUrl(id));
  let stopped = false;
  let attempt = 0;
  let sock: LiveSocket | null = null;
  let ctrl: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let ready: ReturnType<typeof setTimeout> | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;
  const clear = () => {
    if (retry) clearTimeout(retry);
    if (ready) clearTimeout(ready);
    if (beat) clearInterval(beat);
    retry = ready = beat = null;
  };
  const later = () => {
    if (stopped) return;
    attempt++;
    on.conn('retrying');
    retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, BACKOFF_MAX_MS));
  };
  /** Give up on this socket (if it is still the current one) and try again. */
  const drop = (ws: LiveSocket) => {
    if (sock !== ws) return;
    sock = null;
    clear();
    try { ws.close(); } catch { /* already closed */ }
    later();
  };
  const connect = async () => {
    retry = null;
    if (stopped) return;
    on.conn(attempt ? 'retrying' : 'connecting');
    const c = (ctrl = new AbortController());
    const limit = setTimeout(() => c.abort(), CHECK_TIMEOUT_MS);
    const check = await checkState(creds, f, c.signal);
    clearTimeout(limit);
    if (ctrl === c) ctrl = null;
    if (stopped) return;
    if (check.kind === 'unauthorized') { on.conn('unauthorized'); return; }
    if (check.kind === 'moved') return; // the page reloads at the new address
    if (check.kind === 'retry') { later(); return; }
    on.state(check.snapshot);
    const ws = open(address(creds.workspaceId));
    sock = ws;
    let heard = Date.now();
    let synced = false;
    ready = setTimeout(() => { if (!synced) drop(ws); }, READY_MS);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: creds.token }));
    ws.onmessage = msg => {
      if (stopped || sock !== ws || typeof msg.data !== 'string') return;
      heard = Date.now();
      if (msg.data === 'pong') return;
      let ev: ServerEvent;
      try { ev = JSON.parse(msg.data) as ServerEvent; } catch { return; }
      if (ev.type === 'snapshot') {
        synced = true;
        if (ready) clearTimeout(ready);
        ready = null;
        attempt = 0;
        on.conn('live');
      }
      on.event(ev);
    };
    beat = setInterval(() => {
      if (sock !== ws || ws.readyState !== OPEN) return;
      if (Date.now() - heard > SILENT_MS) { drop(ws); return; }
      ws.send('ping');
    }, PING_MS);
    ws.onerror = () => {};
    ws.onclose = () => {
      if (sock !== ws) return;
      sock = null;
      clear();
      later();
    };
  };
  connect();
  return () => {
    stopped = true;
    ctrl?.abort();
    clear();
    const ws = sock;
    sock = null;
    try { ws?.close(1000, 'page closed'); } catch { /* already closed */ }
  };
}

/**
 * Live workspace state over a WebSocket the server can hibernate, so an open page costs nothing while
 * nothing happens. The token never goes in the URL; it is the socket's first message.
 */
export function useWorkspace(creds: Creds | null, onNotice?: (e: Extract<ServerEvent, { type: 'notice' }>) => void) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    if (!creds) return;
    // Stopped on unmount and whenever the credentials change: pending checks are aborted, timers
    // cleared and the socket closed, so an old connection never writes into the new state.
    return startLive(creds, {
      state: s => setState(s),
      event: e => { if (e.type === 'notice') noticeRef.current?.(e); else setState(s => apply(s, e)); },
      conn: setConn,
    });
  }, [creds?.workspaceId, creds?.token]);

  return { state, conn };
}
