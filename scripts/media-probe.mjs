// One bounded probe of the deployed Modal media service (S5): one podcast, one short.
// Needs MODAL_MEDIA_URL, MODAL_MEDIA_TOKEN and COEVO_ADMIN_TOKEN in the environment or .dev.vars.
// Before anything runs, it reserves its allocation in the deployment's single lifetime
// budget (POST /api/admin/reserve); if the reservation is refused, nothing is sent.
// Prints duration, size and timings only; saves the files under private/checks/media/.
// Usage: node scripts/media-probe.mjs https://<deployment>

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { readConfig, root } from './config.mjs';

const env = readConfig();
const deployment = process.argv[2];
if (!deployment?.startsWith('https://')) { console.error('Usage: node scripts/media-probe.mjs https://<deployment>'); process.exit(2); }
if (!env.MODAL_MEDIA_URL?.startsWith('https://') || !env.MODAL_MEDIA_TOKEN) { console.error('Set MODAL_MEDIA_URL (https) and MODAL_MEDIA_TOKEN first.'); process.exit(2); }
if (!env.COEVO_ADMIN_TOKEN) { console.error('Set COEVO_ADMIN_TOKEN so the probe can reserve its allocation first.'); process.exit(2); }
const PROBE_USD = 0.05;
const reserve = await fetch(`${deployment}/api/admin/reserve`, { method: 'POST', headers: { Authorization: `Bearer ${env.COEVO_ADMIN_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ usd: PROBE_USD, ledger: 'modal', label: 'modal media probe (1 podcast + 1 short)' }) });
if (!reserve.ok) { console.error(`Lifetime budget refused the $${PROBE_USD} reservation (${reserve.status}). Nothing was sent.`); process.exit(2); }
console.log(`Reserved $${PROBE_USD} in the Modal lifetime ledger.`);

function png(rgb) {
  const w = 512, h = 768;
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const auth = { Authorization: `Bearer ${env.MODAL_MEDIA_TOKEN}` };
async function run(job) {
  const t0 = Date.now();
  const r = await fetch(`${env.MODAL_MEDIA_URL}/jobs`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(job) });
  if (!r.ok) throw new Error(`start ${r.status}`);
  const { job_id } = await r.json();
  for (let i = 0; i < 120; i++) {
    await new Promise(res => setTimeout(res, 5000));
    const p = await fetch(`${env.MODAL_MEDIA_URL}/jobs/${job_id}`, { headers: auth });
    if (p.status === 202) continue;
    const d = await p.json();
    if (d.status !== 'done') throw new Error(d.error ?? `status ${p.status}`);
    return { ...d, seconds: Math.round((Date.now() - t0) / 1000) };
  }
  throw new Error('timeout');
}

const dest = path.join(root, 'private/checks/media');
mkdirSync(dest, { recursive: true, mode: 0o700 });
const lines = [
  ['caddie', 'You asked for more premium four times, and the poster barely moved.'],
  ['guest', 'But premium is what I want. Why should I explain more?'],
  ['caddie', 'Because the model cannot see your customers. Who walks past your café at eight?'],
  ['guest', 'Office workers, mostly. They grab something before the train.'],
  ['caddie', 'Then say that, with the price. Six thousand five hundred won tells it a lot.'],
  ['guest', 'Fair. And a real photo of the cheesecake?'],
  ['caddie', 'Yes. Your photo beats any generated cake.'],
  ['guest', 'Okay. I will try it on the next one.'],
].map(([speaker, text]) => ({ speaker, text }));
const podcast = await run({ kind: 'podcast', lines, voices: { caddie: 'af_heart', guest: 'am_michael' } });
writeFileSync(path.join(dest, 'probe-podcast.m4a'), Buffer.from(podcast.data_b64, 'base64'), { mode: 0o600 });
console.log({ podcast: { durationSec: podcast.duration, bytes: Buffer.from(podcast.data_b64, 'base64').length, lines: podcast.timings.length, wallSeconds: podcast.seconds } });

const scenes = [
  { role: 'hook', narration: 'Four requests for more premium, and the poster barely changed. Why?', imageB64: png([40, 70, 55]), diagram: null, label: null },
  { role: 'cause', narration: 'Vague words leave the model guessing. Who it is for and the price give it a target.', imageB64: null, diagram: { nodes: ['More premium', 'Model guesses', 'Same poster'] }, label: null },
  { role: 'rule', narration: 'Before a poster, give the audience, the price, one feeling, and a real photo.', imageB64: png([70, 60, 40]), diagram: null, label: null },
  { role: 'question', narration: 'When a customer asks for something cuter, what will you ask first?', imageB64: png([40, 50, 70]), diagram: null, label: null },
];
const short = await run({ kind: 'short', title: 'Four ingredients', voice: 'af_heart', scenes });
writeFileSync(path.join(dest, 'probe-short.mp4'), Buffer.from(short.data_b64, 'base64'), { mode: 0o600 });
console.log({ short: { durationSec: short.duration, bytes: Buffer.from(short.data_b64, 'base64').length, scenes: short.timings.length, wallSeconds: short.seconds } });
