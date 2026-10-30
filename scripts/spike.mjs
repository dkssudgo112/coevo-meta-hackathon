// Bounded live spikes that go THROUGH the deployed app, so every paid call is
// reserved and charged by the deployment's single lifetime budget authority.
// This script never calls Meta directly and never reads a model key.
//
//   node scripts/spike.mjs <baseUrl> s1 <frames-dir> <expect.json>   # S1 reading accuracy + S3 latency
//   node scripts/spike.mjs <baseUrl> s2 <s2-prepared.json>           # S2 monitor detection via /calibrate (see docs/S2-PROTOCOL.md)
//   node scripts/spike.mjs <baseUrl> practice <wav-dir> [n]          # S6 transcription + S7 portrait image + G2–G4
//
// Writes sanitized metrics (no generated text, no images) to private/checks/. Inputs stay private.
// expect.json: [{ "file": "a.jpg", "tool": "Meta AI", "text": "exact latest request visible" }]

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './config.mjs';

const [, , base, which, dir, extra] = process.argv;
if (!base?.startsWith('https://') || !['s1', 's2', 'practice'].includes(which)) {
  console.error('Usage: node scripts/spike.mjs https://<deployment> s1|s2|practice <dir> [expect.json|n]');
  process.exit(2);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const health = await (await fetch(`${base}/api/health`)).json();
if (!health.liveCallsEnabled || health.testFakeModels) { console.error('The deployment does not have live calls enabled (or is in test mode).'); process.exit(2); }
const before = health.budget;

const w = await (await fetch(`${base}/api/workspaces`, { method: 'POST' })).json();
const pair = await (await fetch(`${base}/api/w/${w.workspaceId}/pair`, { method: 'POST', body: JSON.stringify({ pairSecret: w.pairSecret }), headers: { 'Content-Type': 'application/json' } })).json();
const auth = { Authorization: `Bearer ${pair.phoneToken}` };
const call = async (p, init = {}) => {
  const res = await fetch(`${base}/api/w/${w.workspaceId}${p}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  return { res, body: await res.json().catch(() => null) };
};
const state = async () => (await call('/state')).body;
const files = (d, re) => readdirSync(d).filter(f => re.test(f)).sort();
const mime = f => (f.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const tokens = t => new Set((t ?? '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 1));
const sim = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

const out = { spike: which, base, at: new Date().toISOString() };

if (which === 's1') {
  const expect = JSON.parse(readFileSync(extra, 'utf8'));
  const rows = [];
  for (const f of files(dir, /\.(jpe?g|png)$/i)) {
    const fd = new FormData();
    fd.append('frame', new File([readFileSync(path.join(dir, f))], f, { type: mime(f) }));
    fd.append('source', 'photo');
    fd.append('deviceCropped', 'false');
    const t0 = Date.now();
    const up = await call('/frames', { method: 'POST', body: fd });
    if (up.res.status !== 202) { rows.push({ file: f, error: up.res.status }); await sleep(3000); continue; }
    let m;
    for (let i = 0; i < 90; i++) { m = (await state()).moments.find(x => x.id === up.body.momentId); if (m?.decision) break; await sleep(500); }
    const e = expect.find(x => x.file === f);
    rows.push({
      file: f, status: m?.readingStatus, legible: m?.reading?.legible ?? null, totalMs: Date.now() - t0,
      toolMatch: e?.tool ? (m?.reading?.tool ?? '').toLowerCase().includes(e.tool.toLowerCase()) : null,
      requestSimilarity: e ? Number(sim(m?.reading?.userRequest, e.text).toFixed(2)) : null, decision: m?.decision?.action ?? null,
      serverTiming: m?.timing ?? null,
    });
    await sleep(2600);
  }
  const sims = rows.map(r => r.requestSimilarity).filter(x => typeof x === 'number');
  const tools = rows.filter(r => r.toolMatch !== null && r.toolMatch !== undefined);
  out.rows = rows;
  const st = rows.map(r => r.serverTiming).filter(Boolean);
  out.serverTiming = st.length ? { mode: st[0].mode, p50CountMs: pct(st.map(t => t.countMs), 0.5), p50GenerateMs: pct(st.map(t => t.generateMs), 0.5), p50ServerTotalMs: pct(st.map(t => t.totalMs), 0.5), calls: st[0].calls } : null;
  out.summary = { frames: rows.length, legible: rows.filter(r => r.legible).length, requestAccuracyAt0_8: sims.length ? sims.filter(s => s >= 0.8).length / sims.length : null, toolAccuracy: tools.length ? tools.filter(r => r.toolMatch).length / tools.length : null, p50TotalMs: pct(rows.map(r => r.totalMs), 0.5), p90TotalMs: pct(rows.map(r => r.totalMs), 0.9) };
}

if (which === 's2') {
  // Input comes from scripts/s2/prepare.html: 20 distinct phone photos, each with a person-drawn
  // screen box made BEFORE this run. Scored here against that truth; images are never written out.
  const prep = JSON.parse(readFileSync(dir, 'utf8'));
  if (prep.kind !== 'coevo-s2-prepared') throw new Error('Not an s2-prepared.json file.');
  const photos = prep.photos ?? [];
  const hashes = new Set(photos.map(p => p.sha256Original));
  if (photos.length !== 20 || hashes.size !== 20 || photos.some(p => !p.truth || !p.image?.startsWith('data:image/jpeg'))) throw new Error('S2 needs 20 distinct photos, each with a truth box (prepare them first).');
  const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); const i = ix * iy; return i / (a.w * a.h + b.w * b.h - i); };
  const covered = (box, truth) => { const ix = Math.max(0, Math.min(box.x + box.w, truth.x + truth.w) - Math.max(box.x, truth.x)), iy = Math.max(0, Math.min(box.y + box.h, truth.y + truth.h) - Math.max(box.y, truth.y)); return (ix * iy) / (truth.w * truth.h); };
  const rows = [];
  for (const p of photos) {
    const bytes = Buffer.from(p.image.slice(p.image.indexOf(',') + 1), 'base64');
    const t0 = Date.now();
    const r = await call('/calibrate', { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg' } });
    const roundTripMs = Date.now() - t0;
    const box = r.body?.crop ?? null;
    const cov = box ? covered(box, p.truth) : 0;
    const areaRatio = box ? (box.w * box.h) / (p.truth.w * p.truth.h) : null;
    // Correct = the whole screen is inside the suggested box and the box takes in little else.
    const correct = !!box && cov >= 0.95 && areaRatio <= 1.5;
    rows.push({ index: p.index, note: p.note, found: r.body?.found ?? 0, confidence: r.body?.confidence ?? null, iou: box ? Number(iou(box, p.truth).toFixed(3)) : 0, coverage: Number(cov.toFixed(3)), areaRatio: areaRatio === null ? null : Number(areaRatio.toFixed(2)), correct, samMs: r.body?.latencyMs ?? null, roundTripMs, error: r.body?.error ?? null });
    await sleep(1000);
  }
  const sam = rows.map(r => r.samMs).filter(x => typeof x === 'number');
  out.rows = rows;
  out.summary = {
    photos: rows.length, correct: rows.filter(r => r.correct).length, withBox: rows.filter(r => r.found).length,
    p50SamMs: pct(sam, 0.5), p90SamMs: pct(sam, 0.9), p50RoundTripMs: pct(rows.map(r => r.roundTripMs), 0.5),
    pass: rows.filter(r => r.correct).length >= 18 && (pct(sam, 0.5) ?? Infinity) <= 2000,
    criterion: '>= 18/20 correct (box covers >= 95% of the person-drawn screen box, area <= 1.5x) and SAM p50 <= 2 s; round trip measured from this computer, not over the phone network',
  };
}

if (which === 'practice') {
  const n = Number(extra ?? 3);
  let expectAudio = [];
  try { expectAudio = JSON.parse(readFileSync(path.join(dir, 'expect.json'), 'utf8')); } catch { /* optional */ }
  const rows = [];
  for (const f of files(dir, /\.wav$/i).slice(0, n)) {
    const p = (await call('/practice', { method: 'POST', body: JSON.stringify({ autoOpened: false }), headers: { 'Content-Type': 'application/json' } })).body;
    if (p?.status !== 'open') { rows.push({ file: f, error: p?.error ?? 'scenario failed' }); continue; }
    const t0 = Date.now();
    await call(`/practice/${p.id}/attempt`, { method: 'POST', body: readFileSync(path.join(dir, f)), headers: { 'Content-Type': 'audio/wav' } });
    let x;
    for (let i = 0; i < 120; i++) { x = (await state()).practice.find(y => y.id === p.id); if (x?.status === 'done' || x?.status === 'failed') break; await sleep(1000); }
    let ratio = null;
    if (x?.imageKey) {
      const img = new Uint8Array(await (await fetch(`${base}/api/w/${w.workspaceId}/media/${x.imageKey}`, { headers: auth })).arrayBuffer());
      const v = new DataView(img.buffer);
      if (img[0] === 0x89) ratio = Number((v.getUint32(16) / v.getUint32(20)).toFixed(3));
      else if (img[0] === 0xff && img[1] === 0xd8) {
        // JPEG: walk the markers to the start-of-frame segment for width/height.
        for (let o = 2; o + 9 < img.length;) {
          const marker = img[o + 1], len = v.getUint16(o + 2);
          if (marker >= 0xc0 && marker <= 0xc3) { ratio = Number((v.getUint16(o + 7) / v.getUint16(o + 5)).toFixed(3)); break; }
          o += 2 + len;
        }
      }
    }
    const e = expectAudio.find(y => y.file === f);
    rows.push({ file: f, status: x?.status, ms: Date.now() - t0, transcriptWords: x?.transcript ? x.transcript.split(/\s+/).length : 0, transcriptSimilarity: e && x?.transcript ? Number(sim(x.transcript, e.text).toFixed(2)) : null, imageStatus: x?.imageStatus, imageRatio: ratio, assistance: x?.assistance, error: x?.error ?? null });
  }
  out.rows = rows;
}

const s = await state();
out.workspaceSpentUsd = s.workspace.budget.spentUsd;
const after = (await (await fetch(`${base}/api/health`)).json()).budget;
out.lifetime = { before: before.spentUsd, after: after.spentUsd, cap: after.capUsd };
for (const ses of s.sessions) await call(`/sessions/${ses.id}`, { method: 'DELETE' });
const checks = path.join(root, 'private/checks');
mkdirSync(checks, { recursive: true, mode: 0o700 });
writeFileSync(path.join(checks, `spike-${which}${process.env.SPIKE_TAG ? `-${process.env.SPIKE_TAG}` : ''}.json`), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ spike: which, summary: out.summary ?? out.rows, serverTiming: out.serverTiming ?? undefined, workspaceSpentUsd: out.workspaceSpentUsd, lifetime: out.lifetime }, null, 2));
