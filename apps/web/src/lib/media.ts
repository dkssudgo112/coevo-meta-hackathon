import { useEffect, useState } from 'react';
import type { Creds } from './api.ts';

const cache = new Map<string, string>();

/** Fetch workspace media with the bearer token and expose a blob URL. */
export function useMedia(creds: Creds | null, key: string | null | undefined): { url: string | null; state: 'idle' | 'loading' | 'ready' | 'gone'; reload: () => void } {
  const [url, setUrl] = useState<string | null>(key ? cache.get(key) ?? null : null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'gone'>(key ? (cache.has(key) ? 'ready' : 'loading') : 'idle');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!creds || !key) { setUrl(null); setState('idle'); return; }
    if (cache.has(key)) { setUrl(cache.get(key)!); setState('ready'); return; }
    let live = true;
    setState('loading');
    fetch(`/api/w/${creds.workspaceId}/media/${key}`, { headers: { Authorization: `Bearer ${creds.token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status));
        const u = URL.createObjectURL(await r.blob());
        cache.set(key, u);
        if (live) { setUrl(u); setState('ready'); }
      })
      .catch(() => { if (live) setState('gone'); });
    return () => { live = false; };
  }, [creds?.token, key, attempt]);
  return { url, state, reload: () => setAttempt(n => n + 1) };
}

export function forgetMedia(key: string): void {
  const u = cache.get(key);
  if (u) URL.revokeObjectURL(u);
  cache.delete(key);
}
