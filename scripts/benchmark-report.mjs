// Score a private benchmark export (S1 reading accuracy, S3 server latency).
// Usage: node scripts/benchmark-report.mjs <export.json> <script.json>
// script.json: { "tool": "Meta AI", "requests": ["exact request 1", "exact request 2", ...] }
// Writes sanitized metrics (no frames, no texts) to private/checks/s1-benchmark.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './config.mjs';

const [, , exportPath, scriptPath] = process.argv;
if (!exportPath || !scriptPath) { console.error('Usage: node scripts/benchmark-report.mjs <export.json> <script.json>'); process.exit(2); }
const exp = JSON.parse(readFileSync(exportPath, 'utf8'));
const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
const tokens = t => new Set((t ?? '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 1));
const sim = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

const rows = exp.frames.map(f => {
  const best = Math.max(0, ...script.requests.map(r => sim(f.userRequest, r)));
  return { index: f.index, status: f.readingStatus, legible: f.legible, typing: f.userTyping, bestSimilarity: Number(best.toFixed(2)), correct: best >= 0.8, toolMatch: script.tool ? (f.tool ?? '').toLowerCase().includes(script.tool.toLowerCase()) : null, serverMs: f.timing?.totalMs ?? null, mode: f.timing?.mode ?? null, size: f.width && f.height ? `${f.width}x${f.height}` : null, deviceCropped: f.deviceCropped };
});
const legible = rows.filter(r => r.legible);
const out = {
  kind: 's1-s3-benchmark', at: new Date().toISOString(), label: exp.label,
  frames: rows.length,
  S1: { requestAccuracyAt0_8: legible.length ? legible.filter(r => r.correct).length / rows.length : 0, legibleShare: legible.length / Math.max(1, rows.length), toolAccuracy: legible.length ? legible.filter(r => r.toolMatch).length / legible.length : null, pass: rows.length >= 20 && legible.filter(r => r.correct).length / rows.length >= 0.9 },
  S3: { p50ServerMs: pct(rows.map(r => r.serverMs).filter(x => x !== null), 0.5), p90ServerMs: pct(rows.map(r => r.serverMs).filter(x => x !== null), 0.9), note: 'Server time from upload accepted to decision stored; excludes phone capture and upload time.', passServerOnly: (pct(rows.map(r => r.serverMs).filter(x => x !== null), 0.5) ?? Infinity) <= 6000 },
  rows,
};
const dest = path.join(root, 'private/checks');
mkdirSync(dest, { recursive: true, mode: 0o700 });
writeFileSync(path.join(dest, 's1-benchmark.json'), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ frames: out.frames, S1: out.S1, S3: { p50ServerMs: out.S3.p50ServerMs, p90ServerMs: out.S3.p90ServerMs } }, null, 2));
