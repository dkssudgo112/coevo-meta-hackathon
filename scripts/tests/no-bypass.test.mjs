// Guards: no code path may send paid Meta requests outside the shared budget gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(f => /\.(m?js|ts|tsx|py)$/.test(f));
// The only module allowed to dispatch paid Meta requests; it reserves before every attempt.
const GATE = 'apps/api/src/meta.ts';
// Local fake server (routes only, 127.0.0.1) and the free model-list check.
const ALLOWED = new Set([GATE, 'scripts/fake-meta.mjs', 'scripts/meta-check.mjs', 'apps/api/test/meta.test.ts', 'scripts/tests/no-bypass.test.mjs']);
const PAID = /(api\.meta\.ai[^'"`]*\/(responses|images|asr))|['"`]\/(responses|images\/generations|images\/edits|asr\/transcribe)['"`]/;

test('only the budget gate dispatches paid Meta endpoints', () => {
  const offenders = tracked.filter(f => !ALLOWED.has(f) && PAID.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('no script imports the gate to call Meta directly from a local runtime', () => {
  const scripts = tracked.filter(f => f.startsWith('scripts/') && !f.startsWith('scripts/tests/'));
  const offenders = scripts.filter(f => /apps\/api\/src\/meta(\.ts)?['"]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the direct smoke check refuses to send a paid request', () => {
  const r = spawnSync(process.execPath, ['scripts/meta-check.mjs', 'smoke'], { encoding: 'utf8', env: { ...process.env, COEVO_ALLOW_LIVE_CALLS: 'true' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /disabled/);
});

test('the Muse launcher refuses every session, even with live calls on', () => {
  for (const args of [[], ['run', 'hello'], ['--model', 'x'], ['--help', 'chat']]) {
    const r = spawnSync(process.execPath, ['scripts/muse.mjs', ...args], { encoding: 'utf8', env: { ...process.env, COEVO_ALLOW_LIVE_CALLS: 'true', MODEL_API_KEY: 'should-never-be-used' } });
    assert.equal(r.status, 2, `args ${JSON.stringify(args)}`);
    assert.match(r.stderr, /disabled/);
  }
  assert.doesNotMatch(readFileSync('scripts/muse.mjs', 'utf8'), /META_API_KEY:\s*env\.MODEL_API_KEY/);
});

test('the spike runner only talks to an https deployment', () => {
  const r = spawnSync(process.execPath, ['scripts/spike.mjs', 'http://127.0.0.1:8788', 's1'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('contributor model variants cannot be configured', () => {
  const src = readFileSync(GATE, 'utf8');
  assert.match(src, /-contributor\$/);
});
