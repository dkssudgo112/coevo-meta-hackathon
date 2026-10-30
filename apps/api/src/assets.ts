/**
 * Static media answer byte-range requests: Safari plays video only from 206 responses, and the asset
 * store returns the whole file. Other assets pass through unchanged.
 */
export async function serveAsset(req: Request, assets: Pick<Fetcher, 'fetch'>): Promise<Response> {
  const res = await assets.fetch(req);
  if (!/\.(mp4|m4a)$/.test(new URL(req.url).pathname) || res.status !== 200) return res;
  const m = req.method === 'GET' ? req.headers.get('Range')?.match(/^bytes=(\d*)-(\d*)$/) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    const out = new Response(res.body, res);
    out.headers.set('Accept-Ranges', 'bytes');
    return out;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const size = bytes.length;
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  const headers = new Headers(res.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}
