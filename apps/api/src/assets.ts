/**
 * Static media answer byte-range requests: Safari plays video only from 206 responses, and the asset
 * store returns the whole file. Slice the stream, not a file-sized array: several
 * judges can seek the demo at once without buffering a copy per request.
 */
function byteRange(body: ReadableStream<Uint8Array>, start: number, end: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) { controller.close(); return; }
          const from = Math.max(0, start - offset);
          const until = Math.min(value.length, end + 1 - offset);
          offset += value.length;
          if (until > from) controller.enqueue(value.subarray(from, until));
          if (offset > end) {
            controller.close();
            await reader.cancel();
            return;
          }
          if (until > from) return;
        }
      } catch (e) {
        controller.error(e);
        await reader.cancel().catch(() => undefined);
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

export async function serveAsset(req: Request, assets: Pick<Fetcher, 'fetch'>): Promise<Response> {
  const res = await assets.fetch(req);
  if (!/\.(mp4|m4a)$/.test(new URL(req.url).pathname) || res.status !== 200) return res;
  const m = req.method === 'GET' ? req.headers.get('Range')?.match(/^bytes=(\d*)-(\d*)$/) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    const out = new Response(res.body, res);
    out.headers.set('Accept-Ranges', 'bytes');
    return out;
  }
  const size = Number(res.headers.get('Content-Length'));
  // An unknown or encoded representation cannot be sliced truthfully. HTTP allows
  // ignoring Range and serving the complete response; never buffer to guess its size.
  if (!res.body || !res.headers.has('Content-Length') || !Number.isSafeInteger(size) || size < 0 || res.headers.has('Content-Encoding')) return res;
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) {
    await res.body.cancel();
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  }
  const headers = new Headers(res.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(byteRange(res.body, start, end), { status: 206, headers });
}
