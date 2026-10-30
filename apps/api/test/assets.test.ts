import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serveAsset } from '../src/assets.ts';

const body = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
const store = { fetch: async (req: Request | string) => new Response(new URL(typeof req === 'string' ? req : req.url).pathname.endsWith('.mp4') || new URL(typeof req === 'string' ? req : req.url).pathname.endsWith('.m4a') ? body : 'page', { status: 200, headers: { 'Content-Type': 'video/mp4' } }) } as unknown as Fetcher;
const get = (path: string, range?: string) => serveAsset(new Request(`https://x.test${path}`, { headers: range ? { Range: range } : {} }), store);

test('media answers byte ranges with 206 (Safari plays video only this way)', async () => {
  const r = await get('/demo/v.mp4', 'bytes=0-9');
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-9/100');
  assert.equal(r.headers.get('Content-Length'), '10');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const open = await get('/samples/recorded/podcast.m4a', 'bytes=95-');
  assert.equal(open.headers.get('Content-Range'), 'bytes 95-99/100');
  const suffix = await get('/demo/v.mp4', 'bytes=-5');
  assert.deepEqual([...new Uint8Array(await suffix.arrayBuffer())], [95, 96, 97, 98, 99]);
  const past = await get('/demo/v.mp4', 'bytes=0-500');
  assert.equal(past.headers.get('Content-Range'), 'bytes 0-99/100');
});

test('whole-file media says it accepts ranges; a range past the end is 416; pages pass through', async () => {
  const whole = await get('/demo/v.mp4');
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('Accept-Ranges'), 'bytes');
  assert.equal((await whole.arrayBuffer()).byteLength, 100);
  const bad = await get('/demo/v.mp4', 'bytes=200-300');
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('Content-Range'), 'bytes */100');
  const page = await get('/demo', 'bytes=0-1');
  assert.equal(page.status, 200);
  assert.equal(await page.text(), 'page');
});
