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

/** Live workspace state over SSE (fetch-streamed so the token stays in a header). */
export function useWorkspace(creds: Creds | null, onNotice?: (e: Extract<ServerEvent, { type: 'notice' }>) => void) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    if (!creds) return;
    let stopped = false;
    let ctrl: AbortController | null = null;
    let attempt = 0;
    const run = async () => {
      while (!stopped) {
        ctrl = new AbortController();
        try {
          setConn(attempt ? 'retrying' : 'connecting');
          const res = await fetch(`/api/w/${creds.workspaceId}/events`, { headers: { Authorization: `Bearer ${creds.token}` }, signal: ctrl.signal });
          if (res.status === 401 || res.status === 404) { setConn('unauthorized'); return; }
          if (res.status === 409 && followMove(creds, res.status, await res.json().catch(() => null))) return;
          if (!res.ok || !res.body) throw new Error('stream');
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          attempt = 0;
          setConn('live');
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const line = block.split('\n').find(l => l.startsWith('data: '));
              if (!line) continue;
              const ev = JSON.parse(line.slice(6)) as ServerEvent;
              if (ev.type === 'notice') noticeRef.current?.(ev);
              else setState(s => apply(s, ev));
            }
          }
        } catch {
          if (stopped) return;
        }
        attempt++;
        setConn('retrying');
        await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 10_000)));
      }
    };
    run();
    return () => { stopped = true; ctrl?.abort(); };
  }, [creds?.workspaceId, creds?.token]);

  return { state, conn };
}
