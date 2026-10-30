// Score a private benchmark export (S1 reading accuracy, S3 latency) against per-frame ground truth.
//
//   node scripts/benchmark-report.mjs <export.json> <truth.json>
//
// truth.json (private, written by a person looking at each exported frame image):
//   { "tool": "Meta AI",
//     "frames": [ { "index": 1, "request": "exact latest request visible in THIS frame", "critical": ["premium"] },
//                 { "index": 2, "request": null, "why": "typing / not readable" } ] }
// Every exported frame needs an entry (matched by the export's 1-based index). "request": null means nothing
// should be read as a sent request (the person is typing or the text is not readable).
//
// Rules (approved plan S1/S3):
// - A frame is correct when its reading has word accuracy >= 0.9 against ITS OWN truth
//   (1 - word error rate) and contains every critical token; a null truth is correct only when
//   the reading reports no request (not legible, typing, or null).
// - S1 passes with >= 20 frames, >= 90 % correct frames AND the tool right on every frame.
// - S3 end to end is the phone's own "screen change first seen → card shown" time (benchmark
//   frames report it); server-only time is shown for context and never counts as the pass.
// Writes sanitized metrics (no texts, no images) to private/checks/s1-benchmark.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './config.mjs';

const [, , exportPath, truthPath] = process.argv;
if (!exportPath || !truthPath) { console.error('Usage: node scripts/benchmark-report.mjs <export.json> <truth.json>'); process.exit(2); }
const exp = JSON.parse(readFileSync(exportPath, 'utf8'));
const truth = JSON.parse(readFileSync(truthPath, 'utf8'));

const words = t => (t ?? '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const chars = t => [...(t ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()];
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const accuracy = (hyp, ref) => (ref.length ? Math.max(0, 1 - editDistance(hyp, ref) / ref.length) : hyp.length ? 0 : 1);
const pct = (xs, q) => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

const missing = [];
const rows = exp.frames.map(f => {
  const t = truth.frames.find(x => x.index === f.index);
  if (!t) { missing.push(f.index); return { index: f.index, scored: false }; }
  const read = f.legible && !f.userTyping ? f.userRequest : null;
  const toolOk = (f.tool ?? '').toLowerCase().includes(String(truth.tool).toLowerCase());
  let correct, wordAcc = null, charAcc = null, criticalOk = null;
  if (t.request === null) correct = read === null;
  else {
    wordAcc = Number(accuracy(words(read), words(t.request)).toFixed(3));
    charAcc = Number(accuracy(chars(read), chars(t.request)).toFixed(3));
    const got = new Set(words(read));
    criticalOk = (t.critical ?? []).every(w => words(w).every(x => got.has(x)));
    correct = read !== null && wordAcc >= 0.9 && criticalOk;
  }
  return { index: f.index, scored: true, expectsRequest: t.request !== null, correct, wordAcc, charAcc, criticalOk, toolOk, serverMs: f.timing?.totalMs ?? null, changeToCardMs: f.timing?.client?.changeToCardMs ?? null, uploadToCardMs: f.timing?.client?.uploadToCardMs ?? null, deviceCropped: f.deviceCropped, size: f.width && f.height ? `${f.width}x${f.height}` : null };
});
if (missing.length) { console.error(`truth.json has no entry for frame index ${missing.join(', ')}; every frame must be judged.`); process.exit(2); }

const n = rows.length;
const correct = rows.filter(r => r.correct).length;
const toolAll = rows.every(r => r.toolOk);
const e2e = rows.map(r => r.changeToCardMs);
const out = {
  kind: 's1-s3-benchmark', at: new Date().toISOString(), label: exp.label, frames: n,
  S1: {
    correctFrames: correct, accuracy: n ? Number((correct / n).toFixed(3)) : 0,
    meanWordAccuracy: Number((rows.filter(r => r.wordAcc !== null).reduce((a, r) => a + r.wordAcc, 0) / Math.max(1, rows.filter(r => r.wordAcc !== null).length)).toFixed(3)),
    meanCharAccuracy: Number((rows.filter(r => r.charAcc !== null).reduce((a, r) => a + r.charAcc, 0) / Math.max(1, rows.filter(r => r.charAcc !== null).length)).toFixed(3)),
    criticalTokensAllFound: rows.filter(r => r.criticalOk !== null).every(r => r.criticalOk),
    toolAccuracy: n ? Number((rows.filter(r => r.toolOk).length / n).toFixed(3)) : 0,
    pass: n >= 20 && correct / n >= 0.9 && toolAll,
  },
  S3: {
    p50ChangeToCardMs: pct(e2e, 0.5), p90ChangeToCardMs: pct(e2e, 0.9), framesWithClientTiming: e2e.filter(x => x !== null).length,
    p50UploadToCardMs: pct(rows.map(r => r.uploadToCardMs), 0.5), p50ServerMs: pct(rows.map(r => r.serverMs), 0.5),
    note: 'End to end = the phone first sees the screen change (includes the settle wait) → the card is shown on the phone. Server time = upload accepted → decision stored, context only.',
    pass: n >= 20 && e2e.every(x => x !== null) && (pct(e2e, 0.5) ?? Infinity) <= 6000,
  },
  rows,
};
const dest = path.join(root, 'private/checks');
mkdirSync(dest, { recursive: true, mode: 0o700 });
writeFileSync(path.join(dest, 's1-benchmark.json'), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ frames: n, S1: out.S1, S3: { ...out.S3, note: undefined } }, null, 2));
