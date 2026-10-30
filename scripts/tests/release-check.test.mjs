import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('../release-check.mjs', import.meta.url));
function scenario(fn) {
  const cwd = mkdtempSync(join(tmpdir(), 'coevo-release-test-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  const check = (...args) => spawnSync(process.execPath, [checker, ...args], { cwd, encoding: 'utf8' });
  try { git('init', '-q'); fn({ cwd, git, check }); }
  finally { rmSync(cwd, { recursive: true, force: true }); }
}

test('allows an empty public environment template in the index', () => scenario(({cwd, git, check}) => {
  writeFileSync(join(cwd, '.env.example'), 'MODEL_API_KEY=""\n');
  git('add', '.env.example');
  assert.equal(check('--staged').status, 0);
}));

test('detects a staged secret even after the working copy is cleaned', () => scenario(({cwd, git, check}) => {
  const fake = ['LLM', 'TESTONLY'.repeat(5)].join('_');
  writeFileSync(join(cwd, 'config.txt'), fake);
  git('add', 'config.txt');
  writeFileSync(join(cwd, 'config.txt'), 'clean working copy');
  const result = check('--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /possible credential/);
  assert.equal((result.stdout + result.stderr).includes(fake), false);
}));

test('rejects local Claude notes even if staged despite ignore rules', () => scenario(({cwd, git, check}) => {
  writeFileSync(join(cwd, 'claude.md'), 'Local-only instructions');
  git('add', 'claude.md');
  assert.equal(check('--staged').status, 1);
}));

test('rejects account records and binary artifacts in the index', () => scenario(({cwd, git, check}) => {
  mkdirSync(join(cwd, 'private'));
  writeFileSync(join(cwd, 'private', 'account.txt'), 'Local account record');
  writeFileSync(join(cwd, 'capture.bin'), Buffer.from([1, 0, 2]));
  git('add', 'private/account.txt', 'capture.bin');
  const result = check('--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private path/);
  assert.match(result.stderr, /binary content/);
}));

test('fails closed on an empty index', () => scenario(({check}) => {
  assert.equal(check('--staged').status, 1);
}));
