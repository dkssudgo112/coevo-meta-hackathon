// LOCAL TEST ONLY: exercises the real Budget Durable Object (not a mock) through
// the admin route of a local Worker started with a test admin token and an
// attempted cap of $10 (which must be clamped to the $2.50 operating ceiling).
//   Phase 1:  node scripts/budget-test.mjs http://127.0.0.1:8790 fill
//   (restart the Worker)
//   Phase 2:  node scripts/budget-test.mjs http://127.0.0.1:8790 after-restart
// The local ledger is a test instance; the deployed Worker holds the real one.

const [, , base = 'http://127.0.0.1:8790', phase = 'fill'] = process.argv;
const token = process.env.BUDGET_TEST_TOKEN ?? 'local-budget-test-token-0123456789';
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`); };
const ledger = async () => (await fetch(`${base}/api/admin/ledger`, { headers: H })).json();
const reserve = (usd, ledgerName = 'meta') => fetch(`${base}/api/admin/reserve`, { method: 'POST', headers: H, body: JSON.stringify({ usd, ledger: ledgerName, label: 'budget-test' }) });

const health = await (await fetch(`${base}/api/health`)).json();
check('local worker is not in fake mode (real Budget object under test)', health.testFakeModels === false);

if (phase === 'fill') {
  const start = await ledger();
  check('configured $10 is clamped to the $2.50 operating ceiling', start.meta.capUsd === 2.5, `cap ${start.meta.capUsd}`);
  check('Modal ledger is separate with its own ceiling ≤ $0.90', start.modal.capUsd <= 0.9, `cap ${start.modal.capUsd}`);
  const room = 2.5 - start.meta.spentUsd;
  const n = 160;
  const results = await Promise.all(Array.from({ length: n }, () => reserve(0.02)));
  const okCount = results.filter(r => r.ok).length;
  const expected = Math.floor((room + 1e-9) / 0.02);
  const after = await ledger();
  check(`${n} concurrent $0.02 reservations: exactly ${expected} accepted`, okCount === expected, `accepted ${okCount}`);
  check('ledger never exceeds the ceiling', after.meta.spentUsd <= 2.5 + 1e-9, `$${after.meta.spentUsd}`);
  check('refused reservations answer 402', results.filter(r => !r.ok).every(r => r.status === 402));
  check('Meta reservations did not touch the Modal ledger', after.modal.spentUsd === start.modal.spentUsd);
  const bad = await fetch(`${base}/api/admin/reserve`, { method: 'POST', headers: H, body: JSON.stringify({ usd: 0.01 }) });
  check('a reservation must name its ledger', bad.status === 400);
  const noauth = await fetch(`${base}/api/admin/ledger`);
  check('admin routes require the token', noauth.status === 401);
}

if (phase === 'after-restart') {
  const l = await ledger();
  check('after restart the ledger is still full (persisted, not reset)', l.meta.spentUsd >= 2.5 - 0.02 + 1e-9 && l.meta.spentUsd <= 2.5 + 1e-9, `$${l.meta.spentUsd}`);
  const r = await reserve(0.02);
  check('after restart new reservations are still refused', r.status === 402);
  check('external reservations are logged for audit', l.meta.external.length > 0, `${l.meta.external.length} entries`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall budget checks passed (local test ledger)');
process.exitCode = failed ? 1 : 0;
