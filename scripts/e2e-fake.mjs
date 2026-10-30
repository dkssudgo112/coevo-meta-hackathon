// LOCAL TEST ONLY: full journey against the Worker in fake-model mode.
// Exercises server logic end to end; results are fixture and never count as
// evidence that real models, cameras or deployment work.
//
// Needs: node scripts/fake-meta.mjs  and the Worker started with the fake vars (see fake-meta.mjs).
// Usage: node scripts/e2e-fake.mjs [baseUrl]

import { deflateSync } from 'node:zlib';

const base = process.argv[2] ?? 'http://127.0.0.1:8788';
const fake = 'http://127.0.0.1:8799';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function png(seed) {
  const w = 96, h = 60;
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([(seed * 40 + x) % 256, (y * 3) % 256, 200], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function wav(seconds = 2) {
  const n = 16000 * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
}

let creds;
async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}), Authorization: `Bearer ${creds.token}` };
  if (typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api/w/${creds.ws}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { res, body };
}
const state = async () => (await call('/state')).body;

async function frame(seed) {
  const fd = new FormData();
  fd.append('frame', new File([png(seed)], 'f.png', { type: 'image/png' }));
  fd.append('source', 'camera');
  fd.append('deviceCropped', 'true');
  const r = await call('/frames', { method: 'POST', body: fd });
  if (r.res.status !== 202) throw new Error(`frame ${r.res.status} ${JSON.stringify(r.body)}`);
  for (let i = 0; i < 40; i++) {
    const s = await state();
    const m = s.moments.find(x => x.id === r.body.momentId);
    if (m?.decision) { await sleep(2600); return { m, s }; }
    await sleep(300);
  }
  throw new Error('moment never decided');
}

async function until(fn, label, tries = 150) {
  for (let i = 0; i < tries; i++) {
    const s = await state();
    const v = fn(s);
    if (v) return { s, v };
    await sleep(1000);
  }
  throw new Error(`timed out: ${label}`);
}

const health = await (await fetch(`${base}/api/health`)).json();
check('server is in TEST fake-model mode', health.testFakeModels === true && health.liveCallsEnabled === true && health.mediaServiceConfigured === true);
await fetch(`${fake}/reset`);

const w = await (await fetch(`${base}/api/workspaces`, { method: 'POST' })).json();
const p = await (await fetch(`${base}/api/w/${w.workspaceId}/pair`, { method: 'POST', body: JSON.stringify({ pairSecret: w.pairSecret }), headers: { 'Content-Type': 'application/json' } })).json();
creds = { ws: w.workspaceId, token: p.phoneToken };

const m0 = await frame(0);
check('first sighting: quiet with a model note, labeled fixture', m0.m.decision.action === 'stay-quiet' && m0.m.decision.note?.includes('[test]') && m0.m.decision.provenance === 'fixture');
await frame(1);
await frame(2);
const m3 = await frame(3);
check('4th vague request → intervene at the question step with a grounded quote', m3.m.decision.action === 'intervene' && m3.m.decision.step === 'question' && m3.m.decision.quote === 'more premium', m3.m.decision.message);

const ans = await call(`/moments/${m3.m.id}/respond`, { method: 'POST', body: wav(2), headers: { 'Content-Type': 'audio/wav' } });
check('voice answer transcribed', ans.res.ok && ans.body.response?.transcript?.includes('Office workers'));
const reply = await until(s => s.moments.find(m => m.frame === null && m.decision), 'reply');
check('Caddie replies on a frameless moment without writing the brief', reply.v.decision.action === 'intervene' && !reply.v.decision.exampleBrief, reply.v.decision.message);

const m4 = await frame(4);
check('specific brief → observed change labeled coached', m4.m.change?.assistance === 'coached' && m4.m.change.addedIngredients.length === 5, m4.m.change?.summary);
check('skill observation recorded for description', m4.s.skills.some(k => k.dimension === 'description' && k.assistance === 'coached'));
check('evidence frame kept for the changed moment', Boolean(m4.m.frame?.storedKey));

const sessionId = m4.m.work.sessionId;
await call(`/sessions/${sessionId}/end`, { method: 'POST' });
const planned = await until(s => s.sessions.find(x => x.id === sessionId)?.wrapStatus === 'planned', 'wrap planned', 30);
check('wrap planned with a reason per format', Object.values(planned.s.sessions.find(x => x.id === sessionId).design.formats).every(f => f.why));
const all = await until(s => { const c = s.content.filter(x => x.sessionId === sessionId); return c.length === 5 && c.every(x => x.status === 'ready' || x.status === 'failed') ? c : null; }, 'five formats', 180);
for (const c of all.v) check(`${c.format}: ${c.status}`, c.status === 'ready', c.error ?? c.whyNow);
const podcast = all.v.find(c => c.format === 'podcast');
check('podcast ≥ 60 s with per-line timings', podcast?.payload?.durationSec >= 60 && podcast.payload.lines.every(l => l.end > l.start), `${podcast?.payload?.durationSec} s`);
const short = all.v.find(c => c.format === 'short');
check('short 30–45 s with scene timings and an evidence frame', short?.payload?.durationSec >= 25 && short.payload.durationSec <= 50 && short.payload.scenes.some(s => s.evidenceFrameId), `${short?.payload?.durationSec} s`);
for (const [label, key, type] of [['podcast audio', podcast?.payload?.audioKey, 'audio/mp4'], ['short video', short?.payload?.videoKey, 'video/mp4']]) {
  const r = key ? await fetch(`${base}/api/w/${creds.ws}/media/${key}`, { headers: { Authorization: `Bearer ${creds.token}` } }) : null;
  check(`${label} downloadable`, r?.ok && r.headers.get('content-type') === type, r ? `${(await r.arrayBuffer()).byteLength} bytes` : 'no key');
}

const card = all.s.cards.find(c => c.sessionId === sessionId);
check('Caddie card proposed from the playbook rule', card?.status === 'proposed');
const ed = await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'edit', text: `${card.text} Keep it short.` }) });
check('card edited by the user', ed.body?.provenance === 'user');
await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) });
const inbox = (await state()).inbox.find(i => i.refId === card.id);
check('approved card lands in the Desk inbox with an apply hint', Boolean(inbox?.applyHint));
const bad = await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'reject' }) });
check('invalid transition refused (reject after approve)', bad.res.status === 409);
await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'applied' }) });

await call('/sessions', { method: 'POST', body: '{}' });
const s2 = await frame(5);
const after = await state();
check('next session: AI asked first → Caddie stays quiet', s2.m.decision.action === 'stay-quiet' && s2.m.decision.note?.includes('asked first'));
check('card becomes observed-working by observation', after.cards.find(c => c.id === card.id)?.status === 'observed-working');

const practice = await call('/practice', { method: 'POST', body: JSON.stringify({ autoOpened: false }) });
check('practice scenario written', practice.body?.status === 'open' && practice.body.scenario.length > 0);
await call(`/practice/${practice.body.id}/attempt`, { method: 'POST', body: wav(3), headers: { 'Content-Type': 'audio/wav' } });
const done = await until(s => s.practice.find(x => x.id === practice.body.id && (x.status === 'done' || x.status === 'failed')), 'practice');
check('practice: image, ingredients, independent label', done.v.status === 'done' && done.v.imageStatus === 'ready' && done.v.assistance === 'independent', done.v.error ?? done.v.checkNote);
const hinted = await call('/practice', { method: 'POST', body: JSON.stringify({ autoOpened: false }) });
await call(`/practice/${hinted.body.id}/hint`, { method: 'POST' });
await call(`/practice/${hinted.body.id}/attempt`, { method: 'POST', body: wav(3), headers: { 'Content-Type': 'audio/wav' } });
const hd = await until(s => s.practice.find(x => x.id === hinted.body.id && x.status === 'done'), 'hinted practice');
check('practice after viewing the hint is labeled coached', hd.v.assistance === 'coached');

const ask = await call(`/content/${podcast.id}/ask?at=12`, { method: 'POST', body: JSON.stringify({ question: 'Why not just say premium?' }) });
check('podcast Ask returns an answer and records it', ask.res.ok && (await state()).content.find(c => c.id === podcast.id).payload.asks.length === 1);
const fc = all.v.find(c => c.format === 'flashcards');
await call(`/content/${fc.id}/review`, { method: 'POST', body: JSON.stringify({ cardId: fc.payload.cards[0].id, result: 'applied' }) });
check('flashcard review moves to the 1-day interval', (await state()).content.find(c => c.id === fc.id).payload.cards[0].interval === 1);

const m1 = (await state()).moments.find(m => m.index === 1 && m.work.sessionId === sessionId);
await call(`/moments/${m1.id}/respond`, { method: 'POST', body: JSON.stringify({ kind: 'misread' }) });
check('misread marked', (await state()).moments.find(m => m.id === m1.id).misread === true);

const del = await call(`/frames/${m4.m.frame.id}`, { method: 'DELETE' });
check('frame deletion keeps the label and removes the source', del.res.ok && !del.body.frame.storedKey && del.body.change?.assistance === 'coached');

const retry = await call(`/content/${podcast.id}/retry`, { method: 'POST' });
check('retry refused for a ready item', retry.res.status === 409);
await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'revoke' }) });
const rv = (await state()).cards.find(c => c.id === card.id);
check('card revoked with full history', rv.status === 'revoked' && rv.history.map(h => h.status).join('>') === 'proposed>proposed>approved>applied>observed-working>revoked');

const fin = await state();
check('spend recorded under the workspace cap', fin.workspace.budget.spentUsd > 0 && fin.workspace.budget.spentUsd <= fin.workspace.budget.capUsd, `$${fin.workspace.budget.spentUsd}`);
check('all generated content labeled fixture (never live-model) in test mode', fin.content.every(c => c.provenance === 'fixture') && fin.moments.every(m => m.decision?.provenance !== 'live-model'));

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed (TEST fake models; not evidence of real model behavior)`);
process.exitCode = failed ? 1 : 0;
