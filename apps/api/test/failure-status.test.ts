import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureStatus } from '../src/pipeline.ts';
import { BudgetExceeded } from '../src/meta.ts';

test('a media-only limit does not say the Caddie or Meta budget is exhausted', () => {
  const media = failureStatus(new BudgetExceeded('modal'));
  assert.equal(media.status, 'budget');
  assert.match(media.message, /Audio and video/);
  assert.match(media.message, /text formats can still work/);
  assert.doesNotMatch(media.message, /stay quiet|model budget/);
  assert.match(failureStatus(new BudgetExceeded('global')).message, /model budget/);
});
