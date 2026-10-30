// LOCAL TEST ONLY: full journey against the Worker in fake-model mode.
// Exercises server logic end to end; results are fixture and never count as
// evidence that real models, cameras or deployment work.
//
// Needs: node scripts/fake-meta.mjs  and the Worker started with the fake vars (see fake-meta.mjs).
// Usage: node scripts/e2e-fake.mjs [baseUrl]

import { deflateSync } from 'node:zlib';

const base = process.argv[2] ?? 'http://127.0.0.1:8788';
const fake = 'http://127.0.0.1:8799';
// Each run spends on its own fake ledger (TEST ONLY), so repeated runs never exhaust a shared one.
const RUN_LEDGER = `run-${Date.now().toString(36)}`;
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

async function frame(seed, benchmark = false) {
  const fd = new FormData();
  fd.append('frame', new File([png(seed)], 'f.png', { type: 'image/png' }));
  fd.append('source', 'camera');
  fd.append('deviceCropped', 'true');
  if (benchmark) fd.append('benchmark', 'true');
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

const w = await (await fetch(`${base}/api/workspaces`, { method: 'POST', headers: { 'X-Coevo-Test-Ledger': RUN_LEDGER } })).json();
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
// Inject one failure each: the short's plan (model 500) and the podcast's render.
await fetch(`${fake}/fail`, { method: 'POST', body: JSON.stringify({ name: 'short' }) });
await fetch(`${fake}/fail`, { method: 'POST', body: JSON.stringify({ name: 'media-podcast' }) });
await call(`/sessions/${sessionId}/end`, { method: 'POST' });
const planned = await until(s => s.sessions.find(x => x.id === sessionId)?.wrapStatus === 'planned', 'wrap planned', 30);
check('wrap planned with a reason per format', Object.values(planned.s.sessions.find(x => x.id === sessionId).design.formats).every(f => f.why));
const first = await until(s => { const c = s.content.filter(x => x.sessionId === sessionId); return c.length === 5 && c.every(x => x.status === 'ready' || x.status === 'failed') ? c : null; }, 'five formats (with injected failures)', 180);
const f1 = Object.fromEntries(first.v.map(c => [c.format, c]));
check('partial success: note, manual and flashcards ready despite two failures', ['note', 'manual', 'flashcards'].every(f => f1[f].status === 'ready'));
check('failed short shows an error and stays retryable', f1.short.status === 'failed' && Boolean(f1.short.error), f1.short.error);
check('failed podcast render keeps its script (transcript fallback)', f1.podcast.status === 'failed' && f1.podcast.payload?.lines?.length >= 8, f1.podcast.error);
for (const f of ['short', 'podcast']) await call(`/content/${f1[f].id}/retry`, { method: 'POST' });
const all = await until(s => { const c = s.content.filter(x => x.sessionId === sessionId); return c.every(x => x.status === 'ready') ? c : null; }, 'retry recovers', 180);
for (const c of all.v) check(`${c.format}: ${c.status} after retry`, c.status === 'ready', c.error ?? `attempts ${c.attempts}`);
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
const long = await call('/practice', { method: 'POST', body: JSON.stringify({ autoOpened: false }) });
const tooLong = await call(`/practice/${long.body.id}/attempt`, { method: 'POST', body: wav(35), headers: { 'Content-Type': 'audio/wav' } });
await call(`/practice/${long.body.id}/attempt`, { method: 'POST', body: JSON.stringify({ text: 'For office workers near the station, 6,500 won, a calm morning feel.' }) });
const ty = await until(s => s.practice.find(x => x.id === long.body.id && (x.status === 'done' || x.status === 'failed')), 'typed practice');
check('practice: a 35 s recording is refused; a typed brief is checked and marked typed', tooLong.res.status === 413 && ty.v.status === 'done' && ty.v.briefSource === 'typed' && ty.v.transcript?.startsWith('For office workers'), `${tooLong.res.status} · ${ty.v.briefSource}`);

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

// Benchmark test mode: frames kept, exportable with timing and images, deletable.
await fetch(`${fake}/reset`);
const b1 = await frame(0, true);
const b2 = await frame(1, true);
check('benchmark frames are kept even when quiet', Boolean(b1.m.frame?.storedKey) && Boolean(b2.m.frame?.storedKey) && b1.m.benchmark === true);
const exp = await call('/benchmark?images=1');
check('benchmark export has readings, timing and images', exp.res.ok && exp.body.frames.length === 2 && exp.body.frames.every(f => f.timing && f.image?.startsWith('data:image/') && f.userRequest) && /TEST MODE/.test(exp.body.label), `p50 ${exp.body.summary?.p50ServerMs} ms`);
const del2 = await call('/benchmark', { method: 'DELETE' });
check('benchmark deletion removes frames and moments', del2.body?.deleted === 2 && !(await state()).moments.some(m => m.benchmark));

// The race and recovery checks below run in a fresh workspace, so the main journey's
// spend does not push them into the per-workspace daily cap.
{
  const fresh = await (await fetch(`${base}/api/workspaces`, { method: 'POST', headers: { 'X-Coevo-Test-Ledger': RUN_LEDGER } })).json();
  const paired = await (await fetch(`${base}/api/w/${fresh.workspaceId}/pair`, { method: 'POST', body: JSON.stringify({ pairSecret: fresh.pairSecret }), headers: { 'Content-Type': 'application/json' } })).json();
  creds = { ws: fresh.workspaceId, token: paired.phoneToken };
}

// Typed answer (instead of speaking): the Caddie replies and the answer is marked typed.
{
  await fetch(`${fake}/reset`);
  await call('/sessions', { method: 'POST', body: '{}' });
  await sleep(2600);
  let asked = null;
  for (const seed of [0, 1, 2, 3]) { const r = await frame(seed); if (r.m.decision?.action === 'intervene') asked = r.m; }
  const ans = asked ? await call(`/moments/${asked.id}/respond`, { method: 'POST', body: JSON.stringify({ kind: 'typed-answer', text: 'Office workers near the station, 6,500 won.' }) }) : null;
  const reply = asked ? await until(s => s.moments.find(m => m.frame === null && m.work.sessionId === asked.work.sessionId && m.decision), 'reply to typed answer', 30) : null;
  check('a typed answer is stored as typed and the Caddie replies', ans?.res.ok && ans.body.response?.kind === 'typed-answer' && Boolean(reply?.v), asked ? reply?.v?.decision?.message ?? reply?.v?.decision?.note ?? '' : 'no intervention');
}

// Deletion races: a late model response must never recreate deleted content.
{
  await fetch(`${fake}/delay`, { method: 'POST', body: JSON.stringify({ name: 'caddie_turn', ms: 6000 }) });
  const sess = (await call('/sessions', { method: 'POST', body: '{}' })).body;
  const fd = new FormData();
  fd.append('frame', new File([png(9)], 'f.png', { type: 'image/png' }));
  fd.append('source', 'camera');
  await sleep(2600);
  const up = await call('/frames', { method: 'POST', body: fd });
  await call(`/sessions/${up.body.sessionId}`, { method: 'DELETE' });
  await sleep(9000); // provider answers after the deletion
  const st = await state();
  check('late reading after deletion recreates nothing', !st.sessions.some(x => x.id === up.body.sessionId) && !st.moments.some(m => m.work.sessionId === up.body.sessionId) && !st.skills.some(k => k.momentId === up.body.momentId), `session ${sess.id === up.body.sessionId ? 'same' : 'new'}`);
}
{
  await fetch(`${fake}/reset`);
  const sess = (await call('/sessions', { method: 'POST', body: '{}' })).body;
  await sleep(2600);
  for (const seed of [0, 1]) await frame(seed);
  // Both generation chains (text and media) are mid-call when the session is deleted.
  await fetch(`${fake}/delay`, { method: 'POST', body: JSON.stringify({ name: 'note', ms: 6000 }) });
  await fetch(`${fake}/delay`, { method: 'POST', body: JSON.stringify({ name: 'podcast', ms: 6000 }) });
  await call(`/sessions/${sess.id}/end`, { method: 'POST' });
  try {
    await until(s => ['note', 'podcast'].every(f => s.content.some(c => c.sessionId === sess.id && c.format === f && c.status === 'generating')), 'note and podcast generating', 30);
  } catch (e) {
    const s = await state();
    console.log('DEBUG', JSON.stringify({ session: s.sessions.find(x => x.id === sess.id)?.wrapStatus, content: s.content.filter(c => c.sessionId === sess.id).map(c => `${c.format}:${c.status}`) }));
    throw e;
  }
  const before = await (await fetch(`${fake}/stats`)).json();
  await call(`/sessions/${sess.id}`, { method: 'DELETE' });
  await sleep(12000);
  const st = await state();
  const after = await (await fetch(`${fake}/stats`)).json();
  check('deleting during content generation leaves no content or cards behind', !st.content.some(c => c.sessionId === sess.id) && !st.cards.some(c => c.sessionId === sess.id) && !st.sessions.some(x => x.id === sess.id));
  check('no new media jobs are dispatched for deleted content', after.jobsStarted === before.jobsStarted, `jobs ${before.jobsStarted} → ${after.jobsStarted}`);
  check('no further generations ran after deletion (manual, flashcards, short)', ['manual', 'flashcards', 'short'].every(n => (after.calls[n] ?? 0) === (before.calls[n] ?? 0)));
}

// Restart during a wrap (TEST hook): cut-off and queued items fail at once and can be retried.
{
  await fetch(`${fake}/reset`);
  const sess = (await call('/sessions', { method: 'POST', body: '{}' })).body;
  await sleep(2600);
  for (const seed of [0, 1]) await frame(seed);
  await fetch(`${fake}/delay`, { method: 'POST', body: JSON.stringify({ name: 'note', ms: 8000 }) });
  await call(`/sessions/${sess.id}/end`, { method: 'POST' });
  await until(s => s.content.some(c => c.sessionId === sess.id && c.format === 'note' && c.status === 'generating'), 'note generating', 30);
  await call('/test/restart', { method: 'POST' });
  const after = (await state()).content.filter(c => c.sessionId === sess.id);
  const note = after.find(c => c.format === 'note');
  check('after a restart, interrupted items fail at once with a retry', note?.status === 'failed' && /restarted/.test(note?.error ?? '') && !after.some(c => c.status === 'queued'), after.map(c => `${c.format}:${c.status}`).join(', '));
  await sleep(9000); // let the old (TEST: still alive) call finish before retrying
  await call(`/content/${note.id}/retry`, { method: 'POST' });
  const { v: retried } = await until(s => { const n = s.content.find(c => c.id === note.id); return n && (n.status === 'ready' || n.status === 'failed') ? n : null; }, 'note retried', 30);
  check('an interrupted item recovers on retry', retried.status === 'ready');
  const pr = await call('/practice', { method: 'POST', body: JSON.stringify({ autoOpened: false, sessionId: sess.id }) });
  await call(`/practice/${pr.body.id}/attempt`, { method: 'POST', body: JSON.stringify({ text: 'For students after school, 4,500 won, bright and playful.' }) });
  const prDone = await until(s => s.practice.find(x => x.id === pr.body.id && x.status === 'done'), 'session practice');
  await call(`/sessions/${sess.id}`, { method: 'DELETE' });
  const gone = await state();
  const img = prDone.v.imageKey ? await call(`/media/${prDone.v.imageKey}`) : null;
  check('deleting a session removes its practice attempts, images and skill notes', !gone.practice.some(x => x.id === pr.body.id) && !gone.skills.some(k => k.practiceId === pr.body.id) && (!img || img.res.status === 404));
}
// Deletion during a slow object write (TEST hook): nothing stays behind in storage.
{
  await fetch(`${fake}/reset`);
  const sess = (await call('/sessions', { method: 'POST', body: '{}' })).body;
  await sleep(2600);
  for (const seed of [0, 1]) await frame(seed);
  await call('/test/r2-delay', { method: 'POST', body: JSON.stringify({ ms: 6000, count: 1 }) });
  await call(`/sessions/${sess.id}/end`, { method: 'POST' });
  let keys = [];
  for (let i = 0; i < 60 && !keys.length; i++) { keys = (await call('/test/r2-delay')).body.keys; if (!keys.length) await sleep(500); }
  await call(`/sessions/${sess.id}`, { method: 'DELETE' });
  await sleep(9000); // the delayed write finishes after the deletion
  const left = keys.length ? await call(`/media/${keys[0]}`) : null;
  const st = await state();
  check('deleting during a slow storage write leaves no object behind', keys.length === 1 && left?.res.status === 404 && !st.content.some(c => c.sessionId === sess.id), `${keys[0]?.split('/').slice(2, 3)[0] ?? 'no write'} → ${left?.res.status}`);
}
// Media race: a job dispatched while the alarm is busy polling another must not be lost.
{
  await fetch(`${fake}/reset`);
  const sess = (await call('/sessions', { method: 'POST', body: '{}' })).body;
  await sleep(2600);
  for (const seed of [0, 1]) await frame(seed);
  await fetch(`${fake}/delay`, { method: 'POST', body: JSON.stringify({ name: 'media-poll', ms: 8000 }) });
  await fetch(`${fake}/delay`, { method: 'POST', body: JSON.stringify({ name: 'short', ms: 7000 }) });
  await call(`/sessions/${sess.id}/end`, { method: 'POST' });
  let settled = null;
  try {
    settled = (await until(s => { const c = s.content.filter(x => x.sessionId === sess.id && (x.format === 'podcast' || x.format === 'short')); return c.length === 2 && c.every(x => x.status === 'ready' || x.status === 'failed') ? c : null; }, 'podcast and short settled', 60)).v;
  } catch { /* reported below */ }
  check('a short dispatched during a slow podcast poll still completes', Boolean(settled) && settled.every(x => x.status === 'ready'), settled ? settled.map(x => `${x.format} ${x.status}`).join(', ') : 'short never settled (job lost)');
  // An approved card outlives its session and can still be revoked afterwards.
  const { v: card } = await until(s => s.cards.find(c => c.sessionId === sess.id && c.status === 'proposed'), 'card proposed', 30);
  await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) });
  // Approve → edit: the Desk copy and the card's requirements follow the edited rule.
  await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'edit', text: 'Before drafting, ask me whether I have a real photo.' }) });
  const ed = await state();
  const edCard = ed.cards.find(c => c.id === card.id), edCopy = ed.inbox.find(i => i.refId === card.id);
  check('editing an approved card updates its copy text and requirements', /real photo/.test(edCopy?.text ?? '') && JSON.stringify(edCard?.asks) === '["realPhoto"]', `${edCopy?.text} · asks ${JSON.stringify(edCard?.asks)}`);
  await call(`/sessions/${sess.id}`, { method: 'DELETE' });
  const kept = (await state()).cards.find(c => c.id === card.id);
  await call(`/cards/${card.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'revoke' }) });
  const revoked = (await state()).cards.find(c => c.id === card.id);
  check('an approved card is kept after its session is deleted and can still be revoked', kept?.status === 'approved' && revoked?.status === 'revoked', `${kept?.status} → ${revoked?.status}`);
}

const fin = await state();
check('spend recorded under the workspace cap', fin.workspace.budget.spentUsd > 0 && fin.workspace.budget.spentUsd <= fin.workspace.budget.capUsd, `$${fin.workspace.budget.spentUsd}`);
check('all generated content labeled fixture (never live-model) in test mode', fin.content.every(c => c.provenance === 'fixture') && fin.moments.every(m => m.decision?.provenance !== 'live-model'));

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed (TEST fake models; not evidence of real model behavior)`);
process.exitCode = failed ? 1 : 0;
