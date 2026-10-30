// LOCAL TEST ONLY: exercises the real Budget Durable Object (not a mock) through
// the admin route of a local Worker started with a test admin token. No model is called.
//   Run 1: start the Worker with COEVO_LIFETIME_CAP_USD=1000 (must be clamped to the $100 total),
//          EXPECT_CAP=100 node scripts/budget-test.mjs http://127.0.0.1:8790 fill
//          (restart the Worker on the same state)
//          EXPECT_CAP=100 node scripts/budget-test.mjs http://127.0.0.1:8790 after-restart
//   Run 2: fresh state, start the Worker with COEVO_LIFETIME_CAP_USD=2.5 (a lower limit is respected),
//          EXPECT_CAP=2.5 node scripts/budget-test.mjs http://127.0.0.1:8790 fill
// The local ledger is a test instance; the deployed Worker holds the real one.

const [, , base = 'http://127.0.0.1:8790', phase = 'fill'] = process.argv;
const CAP = Number(process.env.EXPECT_CAP ?? 100);
// External reservations are at most $1 each, so a large ceiling is filled in $1 steps.
const STEP = CAP >= 10 ? 1 : 0.02;
const token = process.env.BUDGET_TEST_TOKEN ?? 'local-budget-test-token-0123456789';
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`); };
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const PENDING = '.wrangler/budget-test-pending-ticket.json';
const ledger = async () => (await fetch(`${base}/api/admin/ledger`, { headers: H })).json();
const settle = (ticket, usd, ledgerName = 'meta') => fetch(`${base}/api/admin/settle`, { method: 'POST', headers: H, body: JSON.stringify({ ticket, usd, ledger: ledgerName }) }).then(r => r.json());
const reserve = (usd, ledgerName = 'meta') => fetch(`${base}/api/admin/reserve`, { method: 'POST', headers: H, body: JSON.stringify({ usd, ledger: ledgerName, label: 'budget-test' }) });

const health = await (await fetch(`${base}/api/health`)).json();
check('local worker is not in fake mode (real Budget object under test)', health.testFakeModels === false);

if (phase === 'fill') {
  const t0 = await ledger();
  check('fresh test ledger', t0.meta.spentUsd === 0, `$${t0.meta.spentUsd} (delete .wrangler/budget-test-state for a fresh run)`);
  // Durable tickets: settle exactly once.
  const a = await (await reserve(0.1)).json();
  const s1 = await settle(a.ticket, 0.04);
  const s2 = await settle(a.ticket, 0);
  check('settle applies once; a duplicate settle is ignored', s1.applied === true && s2.applied === false && Math.abs(s2.spentUsd - 0.04) < 1e-9, `$${s2.spentUsd}`);
  const unknown = await settle('00000000-0000-0000-0000-000000000000', 0);
  check('unknown ticket cannot refund anything', unknown.applied === false && Math.abs(unknown.spentUsd - 0.04) < 1e-9);
  const b = await (await reserve(0.1)).json();
  const dup = await Promise.all(Array.from({ length: 20 }, () => settle(b.ticket, 0)));
  const afterDup = await ledger();
  check('20 concurrent duplicate settles → exactly one applied', dup.filter(d => d.applied).length === 1 && Math.abs(afterDup.meta.spentUsd - 0.04) < 1e-9, `$${afterDup.meta.spentUsd}`);
  const c = await (await reserve(0.05)).json();
  const start = await ledger();
  writeFileSync(PENDING, JSON.stringify({ ticket: c.ticket, since: start.meta.since, reservations: start.meta.reservations }));
  check(CAP === 100 ? 'configured $1000 is clamped to the $100 approved total' : `a lower configured limit ($${CAP}) is respected`, start.meta.capUsd === CAP, `cap ${start.meta.capUsd}`);
  check('Modal ledger is separate with its own ceiling ≤ $0.90', start.modal.capUsd <= 0.9, `cap ${start.modal.capUsd}`);
  const room = CAP - start.meta.spentUsd;
  const n = Math.ceil(room / STEP) + 40;
  const results = await Promise.all(Array.from({ length: n }, () => reserve(STEP)));
  const okCount = results.filter(r => r.ok).length;
  const expected = Math.floor((room + 1e-9) / STEP);
  const after = await ledger();
  check(`${n} concurrent $${STEP} reservations: exactly ${expected} accepted`, okCount === expected, `accepted ${okCount}`);
  check('ledger never exceeds the ceiling', after.meta.spentUsd <= CAP + 1e-9, `$${after.meta.spentUsd} of $${CAP}`);
  check('refused reservations answer 402', results.filter(r => !r.ok).every(r => r.status === 402));
  check('Meta reservations did not touch the Modal ledger', after.modal.spentUsd === start.modal.spentUsd);
  const bad = await fetch(`${base}/api/admin/reserve`, { method: 'POST', headers: H, body: JSON.stringify({ usd: 0.01 }) });
  check('a reservation must name its ledger', bad.status === 400);
  const noauth = await fetch(`${base}/api/admin/ledger`);
  check('admin routes require the token', noauth.status === 401);
}

if (phase === 'after-restart') {
  if (existsSync(PENDING)) {
    const { ticket, since } = JSON.parse(readFileSync(PENDING, 'utf8'));
    const pre = (await ledger()).meta;
    const before = pre.spentUsd;
    check('after restart the ledger keeps its since and reservation count', pre.since === since && pre.reservations > 0, `since ${pre.since}, ${pre.reservations} reservations`);
    const r1 = await settle(ticket, 0.01);
    const r2 = await settle(ticket, 0);
    check('a ticket reserved before the restart settles exactly once after it', r1.applied === true && r2.applied === false && Math.abs(r2.spentUsd - (before - 0.04)) < 1e-9, `$${before} → $${r2.spentUsd}`);
  }
  const l = await ledger();
  check('after restart the ledger is still near the ceiling (persisted, not reset)', l.meta.spentUsd >= CAP - 2 * STEP && l.meta.spentUsd <= CAP + 1e-9 && l.meta.capUsd === CAP, `$${l.meta.spentUsd} of $${l.meta.capUsd}`);
  const fill = await Promise.all(Array.from({ length: 10 }, () => reserve(STEP)));
  const after = await ledger();
  check('after restart the ceiling still holds', after.meta.spentUsd <= CAP + 1e-9 && fill.some(r => r.status === 402), `$${after.meta.spentUsd}`);
  check('external reservations are logged for audit', l.meta.external.length > 0, `${l.meta.external.length} entries`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall budget checks passed (local test ledger)');
process.exitCode = failed ? 1 : 0;
