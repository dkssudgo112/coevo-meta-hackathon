// Bounded live spikes against the real Meta Model API (S1, S2, S3, S6, S7).
// Run ONLY after credits are confirmed and COEVO_ALLOW_LIVE_CALLS="true":
//   node scripts/spike.ts s1 <dir-with-frames> <expect.json>   # reading accuracy + latency (S1, S3)
//   node scripts/spike.ts s2 <dir-with-setup-photos>           # SAM screen boxes (S2)
//   node scripts/spike.ts s6 <dir-with-wavs> <expect.json>     # transcription (S6)
//   node scripts/spike.ts s7                                    # portrait images (S7)
// Writes sanitized metrics (no generated text, no frames) to private/checks/. Inputs stay private.
// expect.json: [{ "file": "a.jpg", "tool": "Meta AI", "text": "expected latest request or transcript" }]

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error — plain .mjs helper without types
import { readConfig, root } from './config.mjs';
import { decisionTask, readingTask } from '../packages/core/src/prompts.ts';
import { similarity } from '../packages/core/src/text.ts';
import { generateImage, runTask, segmentBoxes, transcribe, type MetaEnv, type Spender } from '../apps/api/src/meta.ts';

const CAPS: Record<string, number> = { s1: 0.4, s2: 0.2, s6: 0.05, s7: 0.2 };
const [, , which, dir, expectPath] = process.argv;
if (!which || !(which in CAPS)) throw new Error('Usage: node scripts/spike.ts s1|s2|s6|s7 [dir] [expect.json]');
const env = readConfig() as MetaEnv;
if (env.COEVO_ALLOW_LIVE_CALLS !== 'true') { console.error('Live calls are off. Confirm credits first.'); process.exit(2); }
if (env.COEVO_TEST_FAKE_META === 'true') { console.error('Refusing to run a spike in fake-model mode.'); process.exit(2); }

let spent = 0;
const reserved = new Map<string, number>();
const spender: Spender = {
  async reserve(usd, label) {
    if (spent + usd > CAPS[which]) throw new Error(`Spike cap $${CAPS[which]} reached`);
    spent += usd; const t = `${label}${reserved.size}`; reserved.set(t, usd); return t;
  },
  async settle(t, actual) { spent += actual - (reserved.get(t) ?? 0); reserved.delete(t); },
};

const files = (d: string, ext: RegExp) => readdirSync(d).filter(f => ext.test(f)).sort();
const dataUrl = (p: string) => `data:${p.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${readFileSync(p).toString('base64')}`;
const expect = (): { file: string; tool?: string; text: string }[] => (expectPath ? JSON.parse(readFileSync(expectPath, 'utf8')) : []);
const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? null; };

const out: Record<string, unknown> = { spike: which, at: new Date().toISOString(), model: env.META_TEXT_MODEL ?? 'muse-spark-1.3' };

if (which === 's1') {
  const ex = expect();
  const rows = [];
  for (const f of files(dir, /\.(jpe?g|png)$/i)) {
    const t0 = Date.now();
    const r = await runTask(env, spender, readingTask, { text: 'Read this screen photo.', images: [dataUrl(path.join(dir, f))] });
    const tRead = Date.now() - t0;
    const d = await runTask(env, spender, decisionTask, { text: JSON.stringify({ firstSighting: false, reading: r.value, recentRequests: [], repeatedVagueTerm: null, interventions: [], activeCards: [], memory: [], secondsSinceLastIntervention: null }) });
    const e = ex.find(x => x.file === f);
    rows.push({
      file: f, legible: r.value.legible, readMs: tRead, totalMs: Date.now() - t0,
      toolMatch: e?.tool ? (r.value.tool ?? '').toLowerCase().includes(e.tool.toLowerCase()) : null,
      requestSimilarity: e ? Number(similarity(r.value.userRequest ?? '', e.text).toFixed(2)) : null,
      decision: d.value.action,
    });
  }
  const sims = rows.map(r => r.requestSimilarity).filter((x): x is number => x !== null);
  out.rows = rows;
  out.summary = { frames: rows.length, legible: rows.filter(r => r.legible).length, requestAccuracyAt0_8: sims.length ? sims.filter(s => s >= 0.8).length / sims.length : null, toolAccuracy: rows.filter(r => r.toolMatch !== null).length ? rows.filter(r => r.toolMatch).length / rows.filter(r => r.toolMatch !== null).length : null, p50TotalMs: pct(rows.map(r => r.totalMs), 0.5), p90TotalMs: pct(rows.map(r => r.totalMs), 0.9) };
}

if (which === 's2') {
  const rows = [];
  for (const f of files(dir, /\.(jpe?g|png)$/i)) {
    const r = await segmentBoxes(env, spender, dataUrl(path.join(dir, f)), 'computer monitor screen');
    const b = r.boxes.sort((a, c) => (c.x2 - c.x1) * (c.y2 - c.y1) - (a.x2 - a.x1) * (a.y2 - a.y1))[0];
    rows.push({ file: f, found: r.boxes.length, latencyMs: r.latencyMs, areaFraction: b ? Number((((b.x2 - b.x1) * (b.y2 - b.y1)) / (b.w * b.h)).toFixed(3)) : 0, box: b ? { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, w: b.w, h: b.h, c: b.c } : null });
  }
  out.rows = rows;
  out.summary = { photos: rows.length, withBox: rows.filter(r => r.found > 0).length, p50LatencyMs: pct(rows.map(r => r.latencyMs), 0.5), note: 'Verify each box visually against the private photo before counting it as correct.' };
}

if (which === 's6') {
  const ex = expect();
  const rows = [];
  for (const f of files(dir, /\.wav$/i)) {
    const bytes = new Uint8Array(readFileSync(path.join(dir, f)));
    const seconds = new DataView(bytes.buffer, bytes.byteOffset).getUint32(40, true) / (new DataView(bytes.buffer, bytes.byteOffset).getUint32(24, true) * 2);
    const t0 = Date.now();
    const r = await transcribe(env, spender, bytes, seconds);
    const e = ex.find(x => x.file === f);
    rows.push({ file: f, seconds: Number(seconds.toFixed(1)), latencyMs: Date.now() - t0, similarity: e ? Number(similarity(r.transcript, e.text).toFixed(2)) : null, words: r.transcript.split(/\s+/).filter(Boolean).length });
  }
  out.rows = rows;
}

if (which === 's7') {
  const rows = [];
  const dest = path.join(root, 'private/checks/s7');
  mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const [i, prompt] of ['A calm morning café poster background with a matcha cheesecake, warm light, no text.', 'A quiet street at sunrise outside a small café, vertical composition, no text.'].entries()) {
    const t0 = Date.now();
    const r = await generateImage(env, spender, prompt, '1024x1536');
    const v = new DataView(r.bytes.buffer, r.bytes.byteOffset);
    const w = v.getUint32(16), h = v.getUint32(20);
    writeFileSync(path.join(dest, `s7-${i}.png`), r.bytes, { mode: 0o600 });
    rows.push({ index: i, width: w, height: h, ratio: Number((w / h).toFixed(3)), latencyMs: Date.now() - t0 });
  }
  out.rows = rows;
}

out.spentUsd = Number(spent.toFixed(4));
const checks = path.join(root, 'private/checks');
mkdirSync(checks, { recursive: true, mode: 0o700 });
writeFileSync(path.join(checks, `spike-${which}.json`), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ spike: which, summary: out.summary ?? out.rows, spentUsd: out.spentUsd }, null, 2));
