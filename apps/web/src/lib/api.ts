import type { Snapshot } from '../../../../packages/contracts/index.ts';

export interface Creds { workspaceId: string; token: string; role: 'desk' | 'phone' }

const KEY = (role: string) => `coevo.${role}`;

export function loadCreds(role: 'desk' | 'phone'): Creds | null {
  try {
    const raw = localStorage.getItem(KEY(role));
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}

export function saveCreds(c: Creds | null, role: 'desk' | 'phone'): void {
  try {
    if (c) localStorage.setItem(KEY(role), JSON.stringify(c));
    else localStorage.removeItem(KEY(role));
  } catch {
    /* storage may be unavailable; pairing then lasts for this tab only */
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(creds: Creds | null, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (creds) headers.set('Authorization', `Bearer ${creds.token}`);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const url = creds && !path.startsWith('/api/') ? `/api/w/${creds.workspaceId}${path}` : path;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Request failed (${res.status}).`);
  return data as T;
}

export const post = <T>(c: Creds | null, path: string, body?: unknown) => api<T>(c, path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export async function postBinary<T>(c: Creds, path: string, bytes: Uint8Array | Blob, type: string): Promise<T> {
  return api<T>(c, path, { method: 'POST', body: bytes as BodyInit, headers: { 'Content-Type': type } });
}

export async function createWorkspace(kind: 'user' | 'sample'): Promise<{ workspaceId: string; deskToken: string; pairSecret: string; pairExpiresAt: string }> {
  return post(null, kind === 'sample' ? '/api/sample' : '/api/workspaces');
}

export async function pairPhone(workspaceId: string, pairSecret: string): Promise<Creds> {
  const r = await post<{ workspaceId: string; phoneToken: string }>(null, `/api/w/${workspaceId}/pair`, { pairSecret });
  return { workspaceId: r.workspaceId, token: r.phoneToken, role: 'phone' };
}

export function pairLink(workspaceId: string, pairSecret: string): string {
  return `${location.origin}/caddie#pair=${workspaceId}.${pairSecret}`;
}

/** Parse a scanned QR / link into pairing parts. */
export function parsePair(text: string): { workspaceId: string; pairSecret: string } | null {
  const m = text.match(/#pair=(w_[a-z0-9]+)\.([A-Za-z0-9_-]+)/);
  return m ? { workspaceId: m[1], pairSecret: m[2] } : null;
}

export async function getState(c: Creds): Promise<Snapshot> {
  return api<Snapshot>(c, '/state');
}
