import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PRACTICE_RECORDING as run } from '../src/desk/practiceRecording.ts';
import { compareDrafts, judgeFeedback, seen } from '../../../packages/core/src/practice.ts';

test('published practice recording has no workspace transport data or private references', () => {
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        assert.ok(!/^(?:id|token|workspaceId|sessionId|practiceId|imageKey|pairSecret|authorization)$/i.test(key), key);
        visit(child);
      }
    } else if (typeof value === 'string') {
      assert.doesNotMatch(value, /\/Users\/|Bearer |\bwu?_[a-z0-9]{8,}|#pair=|https?:\/\//i);
    }
  };
  visit(run);
  assert.equal(run.inputOrigin, 'scripted');
  assert.equal(run.outputOrigin, 'live-model');
  for (const draft of [run.first, run.revision]) {
    assert.match(draft.image, /^\/samples\/practice\/[a-z]+\.jpg$/);
    assert.ok(existsSync(`apps/web/public${draft.image}`));
    assert.equal(draft.reading.provenance, 'live-model');
  }
});

test('the public walkthrough keeps the recorded evidence and never credits a missing photo', () => {
  assert.equal(run.first.ingredients.price, false);
  assert.equal(run.first.reading.items.price.status, 'missing');
  assert.equal(run.revision.ingredients.price, true);
  assert.equal(run.revision.reading.items.price.status, 'shown');
  assert.equal(run.revision.assistance, 'coached');
  assert.equal(seen(run.scene, run.revision.reading, 'realPhoto'), 'missing');
  assert.deepEqual(compareDrafts(run.scene, run.first.reading, run.revision.reading).now, ['audience', 'price']);
  const before = JSON.stringify(run);
  for (const verdict of ['ready', 'fix', 'redo'] as const) judgeFeedback(run.scene, run.first.ingredients, run.first.reading, { verdict, fix: 'price' });
  assert.equal(JSON.stringify(run), before, 'exploring choices must not overwrite the saved run');
  assert.notDeepEqual(readFileSync(`apps/web/public${run.first.image}`), readFileSync(`apps/web/public${run.revision.image}`));
});
