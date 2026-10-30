import test from 'node:test';
import assert from 'node:assert/strict';
import type { Moment } from '../../../packages/contracts/index.ts';
import { connectionTrouble, illegibleRun } from '../src/lib/moments.ts';

const m = (readingStatus: Moment['readingStatus'], over: Partial<Moment> = {}): Moment => ({
  id: Math.random().toString(36), work: { projectId: 'w', sessionId: 's', workId: 'k' }, index: 0, at: '', frame: { id: 'f', source: 'camera', deviceCropped: true } as Moment['frame'],
  readingStatus, readingError: null, reading: null, misread: false, decision: null, response: null, change: null, provenance: 'fixture', ...over,
});

test('three unreadable frames in a row are counted; a readable one resets the run', () => {
  assert.equal(illegibleRun([m('ok'), m('illegible'), m('illegible')]), 2);
  assert.equal(illegibleRun([m('illegible'), m('illegible'), m('illegible')]), 3);
  assert.equal(illegibleRun([m('illegible'), m('ok'), m('illegible')]), 1);
});

test('model and network errors neither count as unreadable nor break the run', () => {
  assert.equal(illegibleRun([m('illegible'), m('error'), m('illegible'), m('error')]), 2);
  assert.equal(illegibleRun([m('error'), m('error'), m('error')]), 0);
});

test('frameless replies and misread moments are ignored', () => {
  assert.equal(illegibleRun([m('illegible'), m('illegible'), m('ok', { frame: null }), m('illegible')]), 3);
  assert.equal(illegibleRun([m('illegible'), m('ok', { misread: true }), m('illegible')]), 2);
});

test('connection trouble covers a failed reading and a failed decision, not budget stops', () => {
  assert.equal(connectionTrouble(m('error')), true);
  assert.equal(connectionTrouble(m('ok', { decision: { action: 'stay-quiet', step: 'watch', reason: 'x', quote: null, message: null, note: null, missingIngredients: [], exampleBrief: null, guardrail: 'decision-error', provenance: 'rule', model: null, decidedAt: '' } })), true);
  assert.equal(connectionTrouble(m('budget')), false);
  assert.equal(connectionTrouble(m('illegible')), false);
});
