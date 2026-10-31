import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftReading, Ingredients, PracticeScene } from '../../contracts/index.ts';
import { compareDrafts, draftGaps, draftUnsure, gapCause, judgeFeedback, seen } from '../src/practice.ts';
import { practiceObserveTask, practiceScenarioTask } from '../src/prompts.ts';

const fact = (text: string) => ({ text, stake: `Without it: ${text}` });
const scene = (hasRealPhoto = true): PracticeScene => ({
  setting: 'cafe', speaker: { name: 'Dana', role: 'co-owner' }, lines: ['One.', 'Two.'], changed: 'Students instead of commuters.',
  facts: { audience: fact('students'), price: fact('5,000 won'), mood: fact('cozy'), realPhoto: fact('a phone photo of the cup'), productDetail: fact('pumpkin latte') },
  hasRealPhoto,
});
const reading = (s: Partial<Record<keyof Ingredients, 'shown' | 'missing' | 'unclear'>>): DraftReading => ({
  items: Object.fromEntries((['audience', 'price', 'mood', 'realPhoto', 'productDetail'] as const).map(k => [k, { status: s[k] ?? 'shown', evidence: `${k} evidence` }])) as DraftReading['items'],
  note: 'n', provenance: 'fixture',
});
const brief = (b: Partial<Ingredients>): Ingredients => ({ audience: false, price: false, mood: false, realPhoto: false, productDetail: false, ...b });

test('a generated image never counts as the real photo; "can’t tell" is never a gap', () => {
  const r = reading({ audience: 'unclear', realPhoto: 'shown' });
  assert.deepEqual(draftGaps(scene(true), r), ['realPhoto']);
  assert.deepEqual(draftGaps(scene(false), r), []);
});

test('each gap says whether the brief check missed it, the draft does not show it, or only the person can add it', () => {
  assert.equal(gapCause('price', brief({ price: true })), 'draft');
  assert.equal(gapCause('price', brief({})), 'brief');
  assert.equal(gapCause('realPhoto', brief({ realPhoto: true })), 'yours');
});

test('calling a draft with gaps ready is "too early" and plays the speaker’s consequence lines', () => {
  const f = judgeFeedback(scene(), brief({ price: true }), reading({ price: 'missing' }), { verdict: 'ready', fix: null });
  assert.equal(f.tone, 'early');
  assert.match(f.headline, /missing the price and your real photo/);
  assert.deepEqual(f.stakes.map(s => s.key), ['price', 'realPhoto']);
  assert.ok(f.points.find(p => p.key === 'price')?.text.includes('does not compare the number'));
  assert.ok(f.next.some(n => /own photo/.test(n)));
});

test('naming the right fix agrees; naming a detail the draft shows points to the real gap with its visible evidence', () => {
  const s = scene(false);
  const right = judgeFeedback(s, brief({}), reading({ price: 'missing' }), { verdict: 'fix', fix: 'price' });
  assert.equal(right.tone, 'agree');
  const wrong = judgeFeedback(s, brief({}), reading({ price: 'missing' }), { verdict: 'fix', fix: 'mood' });
  assert.equal(wrong.tone, 'partly');
  assert.match(wrong.headline, /Muse Spark saw the feeling in the draft \(mood evidence\)\. In its reading, what is missing is the price/);
});

test('starting over is reasonable when the product is wrong, otherwise a targeted fix is suggested', () => {
  const s = scene(false);
  assert.equal(judgeFeedback(s, brief({}), reading({ productDetail: 'missing' }), { verdict: 'redo', fix: null }).tone, 'agree');
  assert.equal(judgeFeedback(s, brief({}), reading({ price: 'missing' }), { verdict: 'redo', fix: null }).tone, 'partly');
  assert.equal(judgeFeedback(s, brief({}), reading({}), { verdict: 'ready', fix: null }).tone, 'agree');
});

test('comparing drafts lists what the revision fixed and what is still missing', () => {
  const s = scene(true);
  assert.deepEqual(compareDrafts(s, reading({ price: 'missing', mood: 'missing' }), reading({ mood: 'missing' })), { now: ['price'], still: ['mood', 'realPhoto'], unsure: [] });
});

test('scene and image-reading outputs are validated strictly', () => {
  const ok = {
    scenario: 'A poster.', setting: 'cafe', speaker: { name: 'Dana', role: 'co-owner' }, lines: ['a', 'b'], changed: 'c',
    facts: Object.fromEntries(['audience', 'price', 'mood', 'realPhoto', 'productDetail'].map(k => [k, { text: k, stake: 's' }])), hasRealPhoto: false, hint: 'h',
  };
  assert.equal(practiceScenarioTask.read(ok).scene.facts.price.text, 'price');
  assert.throws(() => practiceScenarioTask.read({ ...ok, setting: 'beach' }));
  assert.throws(() => practiceScenarioTask.read({ ...ok, lines: ['only one'] }));
  assert.throws(() => practiceScenarioTask.read({ ...ok, facts: { ...ok.facts, price: undefined } }));
  const obs = { items: Object.fromEntries(['audience', 'price', 'mood', 'realPhoto', 'productDetail'].map(k => [k, { status: 'unclear', evidence: 'e' }])), note: 'n' };
  assert.equal(practiceObserveTask.read(obs).items.mood.status, 'unclear');
  assert.throws(() => practiceObserveTask.read({ ...obs, items: { ...obs.items, mood: { status: 'maybe', evidence: 'e' } } }));
});

test('regression: "can’t tell" never becomes "carries it" or "ready" agreement', () => {
  const s = scene(false);
  const r = reading({ price: 'unclear' });
  const ready = judgeFeedback(s, brief({ price: true }), r, { verdict: 'ready', fix: null });
  assert.notEqual(ready.tone, 'agree');
  assert.match(ready.headline, /could not tell the price/);
  assert.doesNotMatch(ready.headline, /carries everything|could go up as it is/);
  assert.deepEqual(ready.unsure, ['price']);
  const fix = judgeFeedback(s, brief({ price: true }), r, { verdict: 'fix', fix: 'price' });
  assert.match(fix.headline, /could not tell whether the draft shows the price/);
  assert.doesNotMatch(fix.headline, /already carries|does carry|saw the price/);
  const redo = judgeFeedback(s, brief({}), r, { verdict: 'redo', fix: null });
  assert.match(redo.headline, /could not tell the price/);
});

test('regression: missing → can’t tell is not counted as improved', () => {
  const s = scene(false);
  const c = compareDrafts(s, reading({ price: 'missing' }), reading({ price: 'unclear' }));
  assert.deepEqual(c.now, []);
  assert.deepEqual(c.unsure, ['price']);
  assert.deepEqual(c.still, []);
});

test('regression: the real photo is decided by rule, never by comparing with a photo', () => {
  assert.equal(seen(scene(true), reading({ realPhoto: 'shown' }), 'realPhoto'), 'missing');
  assert.equal(seen(scene(false), reading({ realPhoto: 'shown' }), 'realPhoto'), 'unclear');
  assert.deepEqual(draftUnsure(scene(false), reading({})), []);
});

test('regression: a brief check boolean is never treated as the right value or as the AI’s fault', () => {
  const f = judgeFeedback(scene(false), brief({ price: true, mood: true }), reading({ price: 'missing', mood: 'missing' }), { verdict: 'ready', fix: null });
  for (const pt of f.points) {
    assert.match(pt.text, /does not compare/);
    assert.doesNotMatch(pt.text, /gave the price|the AI dropped|AI did not show/);
  }
  assert.match(f.headline, /Muse Spark’s reading/);
});
