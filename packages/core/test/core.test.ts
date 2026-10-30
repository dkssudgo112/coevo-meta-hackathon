import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeDetector, meanAbsDiff } from '../src/change.ts';
import { applyGuardrails, type Proposal } from '../src/ladder.ts';
import { labelPractice, observeChange } from '../src/labels.ts';
import { firstDue, nextDue, INTERVALS_MS } from '../src/spaced.ts';
import { CAPS, charge, emptyLedger, ledgerAdjust, ledgerReserve, lifetimeCap, META_ABSOLUTE_MAX_USD, META_OPERATING_CEILING_USD, modalCap, remaining, sparkCost } from '../src/budget.ts';
import { encodeWav, parseWav, resample, wavDurationSeconds } from '../src/wav.ts';
import { containsBanned, isGroundedQuote, similarity, speechSeconds, stripBanned } from '../src/text.ts';
import { applyHint, cardObserved } from '../src/cards.ts';
import { decisionTask, readingTask, shortTask, podcastTask, manualTask, turnTask } from '../src/prompts.ts';
import type { CaddieCard, Moment, Reading } from '../../contracts/index.ts';

const thumb = (v: number, n = 64) => new Uint8Array(n).fill(v);

test('change detector sends only after a change settles', () => {
  const d = new ChangeDetector({ minIntervalMs: 0 });
  assert.equal(d.sample(thumb(10), 0).kind, 'settling');
  assert.equal(d.sample(thumb(10), 100).kind, 'settling');
  assert.equal(d.sample(thumb(10), 200).kind, 'send');
  assert.equal(d.sample(thumb(10), 300).kind, 'unchanged');
  // Streaming text: changes every sample, not settled yet.
  assert.equal(d.sample(thumb(30), 400).kind, 'settling');
  assert.equal(d.sample(thumb(40), 500).kind, 'settling');
  assert.equal(d.sample(thumb(40), 600).kind, 'settling');
  assert.equal(d.sample(thumb(40), 700).kind, 'send');
});

test('change detector flags camera movement and respects cooldown', () => {
  const d = new ChangeDetector({ minIntervalMs: 10_000 });
  d.sample(thumb(10), 0); d.sample(thumb(10), 1); d.sample(thumb(10), 2);
  assert.equal(d.sample(thumb(200), 3).kind, 'camera-moved');
  d.sample(thumb(50), 4); d.sample(thumb(50), 5);
  assert.equal(d.sample(thumb(50), 6).kind, 'cooldown');
  assert.ok(meanAbsDiff(thumb(0), thumb(255)) === 1);
});

const reading = (over: Partial<Reading> = {}): Reading => ({
  legible: true, tool: 'Meta AI', task: 'poster', userRequest: 'make it more premium', userTyping: false,
  aiResponseSummary: 'Generated a poster', aiAskedClarifyingQuestion: false, artifactVisible: true, vagueTerms: ['premium'],
  ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false }, confidence: 0.9, ...over,
});

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  action: 'intervene', step: 'question', reason: 'Repeated vague request', quote: 'more premium', message: 'Who is this dessert for?',
  note: null, missingIngredients: ['audience'], exampleBrief: null, ...over,
});

const moment = (over: Partial<Moment>): Moment => ({
  id: 'm', work: { projectId: 'w', sessionId: 's', workId: 'k' }, index: 0, at: new Date(0).toISOString(), frame: null,
  readingStatus: 'ok', readingError: null, reading: reading(), misread: false, decision: null, response: null, change: null, provenance: 'live-model', ...over,
});

test('guardrails never interrupt typing and block step skipping', () => {
  const typing = applyGuardrails(proposal(), { reading: reading({ userTyping: true }), history: [], nowMs: 0, activeCard: false });
  assert.equal(typing.action, 'stay-quiet');
  assert.equal(typing.guardrail, 'typing');
  const skip = applyGuardrails(proposal({ step: 'example', exampleBrief: 'x' }), { reading: reading(), history: [], nowMs: 0, activeCard: false });
  assert.equal(skip.step, 'question');
  assert.equal(skip.guardrail, 'ladder-step');
  assert.equal(skip.exampleBrief, null);
});

test('guardrails apply cooldown, later multiplier, praise filter and quote grounding', () => {
  const at = new Date(1_000_000).toISOString();
  const prior = moment({ decision: { action: 'intervene', step: 'question', reason: '', quote: null, message: 'q', note: null, missingIngredients: [], exampleBrief: null, guardrail: null, provenance: 'live-model', model: 'x', decidedAt: at }, response: { kind: 'later', transcript: null, at } });
  const cooled = applyGuardrails(proposal({ step: 'ingredients' }), { reading: reading(), history: [prior], nowMs: 1_000_000 + 60_000, activeCard: false });
  assert.equal(cooled.guardrail, 'later-cooldown');
  const ok = applyGuardrails(proposal({ step: 'ingredients', message: 'Great job! Who is it for and what does it cost?', quote: 'not in request' }), { reading: reading(), history: [prior], nowMs: 1_000_000 + 100_000, activeCard: false });
  assert.equal(ok.action, 'intervene');
  assert.equal(ok.step, 'ingredients');
  assert.equal(ok.message, 'Who is it for and what does it cost?');
  assert.equal(ok.quote, null);
});

test('guardrails stay quiet when the AI asked first under an active card, keeping the model note', () => {
  const r = applyGuardrails(proposal({ note: 'Your AI asked first, so I will stay quiet.' }), { reading: reading({ aiAskedClarifyingQuestion: true }), history: [], nowMs: 0, activeCard: true });
  assert.equal(r.action, 'stay-quiet');
  assert.equal(r.guardrail, 'ai-asked-first');
  assert.equal(r.note, 'Your AI asked first, so I will stay quiet.');
});

test('a matched card explains itself even when the model chose a generic first-sighting note', () => {
  const r = applyGuardrails(proposal({ action: 'stay-quiet', step: 'watch', message: null, note: 'See Meta AI drink poster task, will speak only when helpful' }), { reading: reading({ aiAskedClarifyingQuestion: true }), history: [], nowMs: 0, activeCard: true });
  assert.equal(r.guardrail, 'ai-asked-first');
  assert.equal(r.note, 'Your AI asked first, as your card says, so I am staying quiet.');
  const quietNoCard = applyGuardrails(proposal({ action: 'stay-quiet', step: 'watch', message: null, note: 'See Meta AI drink poster task' }), { reading: reading({ aiAskedClarifyingQuestion: true }), history: [], nowMs: 0, activeCard: false });
  assert.equal(quietNoCard.guardrail, null, 'no applied, matching card: no card claim');
});

test('labels: coached after an intervention, independent without, ai-produced when copying the example', () => {
  const before = moment({ id: 'a' });
  const after = reading({ userRequest: 'For office workers, 6,500 won', ingredients: { audience: true, price: true, mood: false, realPhoto: false, productDetail: false } });
  assert.equal(observeChange(after, [before])?.assistance, 'independent');
  const coachedHistory = [before, moment({ id: 'b', decision: { action: 'intervene', step: 'question', reason: '', quote: null, message: 'Who?', note: null, missingIngredients: [], exampleBrief: null, guardrail: null, provenance: 'live-model', model: null, decidedAt: '' } })];
  assert.equal(observeChange(after, coachedHistory)?.assistance, 'coached');
  const example = 'A poster for office workers nearby, matcha cheesecake, 6,500 won, warm morning light';
  const exHistory = [before, moment({ id: 'c', decision: { action: 'intervene', step: 'example', reason: '', quote: null, message: 'Example', note: null, missingIngredients: [], exampleBrief: example, guardrail: null, provenance: 'live-model', model: null, decidedAt: '' } })];
  assert.equal(observeChange(reading({ userRequest: example, ingredients: { audience: true, price: true, mood: true, realPhoto: false, productDetail: true } }), exHistory)?.assistance, 'ai-produced');
  assert.equal(observeChange(reading(), [before]), null);
  const asked = observeChange(reading({ aiAskedClarifyingQuestion: true }), [before]);
  assert.equal(asked?.aiAskedFirst, true);
  assert.equal(asked?.assistance, 'coached', 'the AI asking first comes from the Caddie card, not the person');
});

test('labels: a question asked before a later readable frame still counts as coaching', () => {
  const vague = (id: string, extra: Partial<Moment> = {}) => moment({ id, reading: reading({ userRequest: 'More premium', ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false } }), ...extra });
  const ask = { action: 'intervene', step: 'question', reason: '', quote: 'more premium', message: 'Who is it for?', note: null, missingIngredients: [], exampleBrief: null, guardrail: null, provenance: 'live-model', model: null, decidedAt: '' } as Moment['decision'];
  const brief = reading({ userRequest: 'For office workers near the station, 6,500 won, calm morning', ingredients: { audience: true, price: true, mood: true, realPhoto: false, productDetail: true } });
  // vague → vague + Caddie question → vague (quiet) → specific brief: coached, not independent.
  assert.equal(observeChange(brief, [vague('a'), vague('b', { decision: ask }), vague('c')])?.assistance, 'coached');
  // After the person improved once, an older question no longer covers a new improvement.
  const improved = moment({ id: 'd', reading: reading({ userRequest: 'For office workers', ingredients: { audience: true, price: false, mood: false, realPhoto: false, productDetail: false } }), change: { addedIngredients: ['audience'], assistance: 'coached', aiAskedFirst: false, summary: '' } });
  const more = reading({ userRequest: 'For office workers, 6,500 won', ingredients: { audience: true, price: true, mood: false, realPhoto: false, productDetail: false } });
  assert.equal(observeChange(more, [vague('a'), vague('b', { decision: ask }), improved, vague('e', { reading: improved.reading })])?.assistance, 'independent');
});

test('practice labels exclude auto-opened and hinted attempts from independent', () => {
  assert.equal(labelPractice({ autoOpened: false, hintViewed: false, transcript: 'for families, 4,000 won' }), 'independent');
  assert.equal(labelPractice({ autoOpened: true, hintViewed: false, transcript: 'x y' }), 'coached');
  assert.equal(labelPractice({ autoOpened: false, hintViewed: true, transcript: 'x y' }), 'coached');
  assert.equal(labelPractice({ autoOpened: false, hintViewed: false, transcript: '' }), 'unobserved');
});

test('spaced repetition: 10 minutes, then 1, 3, 7, 14 days; unsure resets', () => {
  assert.equal(Date.parse(firstDue(0).dueAt), INTERVALS_MS[0]);
  let s = { interval: 0 };
  for (const expected of [1, 2, 3, 4, 4]) { s = nextDue(s.interval, 'applied', 0); assert.equal(s.interval, expected); }
  assert.equal(nextDue(3, 'unsure', 0).interval, 0);
});

test('budget charges per day and caps', () => {
  const now = Date.parse('2026-11-01T10:00:00Z');
  let st = { day: '2026-10-31', spentUsd: 3.9 };
  assert.equal(remaining(st, CAPS.workspacePerDayUsd, now), CAPS.workspacePerDayUsd);
  st = charge(st, 0.5, now);
  assert.equal(CAPS.globalLifetimeUsd, 2.5);
  assert.equal(META_ABSOLUTE_MAX_USD - META_OPERATING_CEILING_USD, 0.5, '$0.50 margin under the approved $3');
  assert.equal(lifetimeCap(undefined), 2.5);
  assert.equal(lifetimeCap('abc'), 2.5);
  assert.equal(lifetimeCap('1.5'), 1.5, 'configuration may lower the ceiling');
  assert.equal(lifetimeCap('10'), 2.5, 'configuration can never raise it');
  assert.equal(modalCap('5'), 0.9);
  assert.equal(st.spentUsd, 0.5);
  assert.ok(Math.abs(sparkCost({ input_tokens: 1_000_000, output_tokens: 0 }) - 1.25) < 1e-9);
});

test('wav encoding produces 16-bit mono with correct duration', () => {
  const s = new Float32Array(48000).fill(0.25);
  const r = resample(s, 48000, 16000);
  assert.equal(r.length, 16000);
  const wav = encodeWav(r, 16000);
  assert.equal(wav.length, 44 + 32000);
  assert.equal(wavDurationSeconds(wav), 1);
  assert.deepEqual(parseWav(wav), { sampleRate: 16000, channels: 1, bitsPerSample: 16, seconds: 1 }, 'the browser encoder passes server validation');
  assert.equal(parseWav(encodeWav(r, 44100)), null, 'unsupported rate refused');
});

test('text checks: banned phrases, grounded quotes with ellipsis, similarity, speech length', () => {
  assert.equal(containsBanned('Awesome, who is it for?'), 'awesome');
  assert.equal(stripBanned('Great job. Who is it for?'), 'Who is it for?');
  assert.ok(isGroundedQuote('“more premium”', 'Make it **more premium** please'));
  assert.ok(isGroundedQuote('make it … please', 'Make it more premium please'));
  assert.ok(!isGroundedQuote('please … make it', 'Make it more premium please'));
  assert.ok(similarity('warm morning light poster', 'poster with warm morning light') > 0.7);
  assert.ok(Math.abs(speechSeconds(Array(155).fill('w').join(' ')) - 60) < 1e-9);
});

test('apply hints: Meta AI uses a first-message rule (Memory did not persist in our check)', () => {
  const h = applyHint('Meta AI', 'Before making a poster, ask me who it is for and the price.');
  assert.equal(h.text, 'For this chat: before making a poster, ask me who it is for and the price.');
  assert.match(h.how, /first message/);
  assert.match(h.how, /pin/i);
  assert.match(applyHint('ChatGPT', 'Ask first.').how, /Custom instructions/);
});

test('model readers accept valid output and reject malformed output', () => {
  const r = readingTask.read({ legible: true, tool: 'Meta AI', task: 'poster', userRequest: 'more premium', userTyping: false, aiResponseSummary: null, aiAskedClarifyingQuestion: false, aiAskedFor: [], artifactVisible: true, vagueTerms: ['Premium'], ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false }, confidence: 2 });
  assert.equal(r.confidence, 1);
  assert.deepEqual(r.vagueTerms, ['premium']);
  assert.throws(() => readingTask.read({ legible: 'yes' }));
  const d = decisionTask.read({ action: 'stay-quiet', step: 'watch', reason: 'On track', quote: null, message: 'ignored', note: 'On track', missingIngredients: [], exampleBrief: null });
  assert.equal(d.message, null);
  assert.throws(() => shortTask.read({ title: 't', scenes: [] }));
  assert.throws(() => podcastTask.read({ title: 't', guest: 'g', lines: [{ speaker: 'host', text: 'x' }] }));
  assert.throws(() => manualTask.read({ title: 't', whenToUse: '', whenNotToUse: '', steps: [{ text: 'a', check: 'b', owner: 'ai' }], pitfalls: [], forYourAI: ['x'], youDecide: ['y'], cardRule: 'z' }));
});

test('schemas are strict objects (no extra properties) for structured output', () => {
  for (const t of [readingTask, decisionTask, shortTask, podcastTask, manualTask]) {
    assert.equal(t.schema.type, 'object');
    assert.equal(t.schema.additionalProperties, false);
  }
});

test('lifetime ledger: never resets, never exceeds the cap under many concurrent-style reservations', () => {
  let l = emptyLedger('2026-10-30T23:59:00Z');
  let ok = 0;
  for (let i = 0; i < 200; i++) { const r = ledgerReserve(l, 0.02, 2.5); if (r.ok) { ok++; l = r.ledger; } }
  assert.equal(ok, 125);
  assert.ok(l.spentUsd <= 2.5 + 1e-9);
  assert.equal(ledgerReserve(l, 0.0001, 2.5).ok, false, 'full ledger refuses even tiny reservations');
  // No date field exists, so "the next day" is the same ledger.
  assert.equal(Object.keys(l).includes('day'), false);
  const nextDay = { ...l, since: l.since };
  assert.equal(ledgerReserve(nextDay, 0.02, 2.5).ok, false);
  // Settling below the reservation frees room; never below zero.
  l = ledgerAdjust(l, -0.5);
  assert.ok(Math.abs(l.spentUsd - 2.0) < 1e-9);
  assert.equal(ledgerAdjust(emptyLedger('x'), -5).spentUsd, 0);
  assert.equal(ledgerReserve(emptyLedger('x'), Number.NaN, 2.5).ok, false);
  assert.equal(ledgerReserve(emptyLedger('x'), -1, 2.5).ok, false);
});

test('combined turn reuses the strict reading and decision readers', () => {
  const r = { legible: true, tool: 'Meta AI', task: 'poster', userRequest: 'more premium', userTyping: false, aiResponseSummary: null, aiAskedClarifyingQuestion: false, aiAskedFor: [], artifactVisible: true, vagueTerms: ['premium'], ingredients: { audience: false, price: false, mood: false, realPhoto: false, productDetail: false }, confidence: 0.9 };
  const d = { action: 'intervene', step: 'question', reason: 'r', quote: 'more premium', message: 'Who is it for?', note: null, missingIngredients: ['audience'], exampleBrief: null };
  const out = turnTask.read({ reading: r, decision: d });
  assert.equal(out.reading.userRequest, 'more premium');
  assert.equal(out.proposal.step, 'question');
  assert.throws(() => turnTask.read({ reading: r }));
  assert.equal(turnTask.schema.additionalProperties, false);
});

test('a card counts as working only when applied, for the same tool and task, and the AI asked for its details', () => {
  const card = (over: Partial<CaddieCard> = {}): CaddieCard => ({ id: 'c', sessionId: 's1', text: 'Before you make a poster, ask me who it is for, the price and one feeling.', scope: 'Tasks like: premium dessert poster for Morning Table', targetTool: 'Meta AI', asks: ['audience', 'price', 'mood'], status: 'applied', history: [], sourceMomentIds: [], provenance: 'live-model', ...over });
  const asked = (over: Partial<Reading> = {}) => reading({ tool: 'Meta AI', task: 'poster for a new drink', aiAskedClarifyingQuestion: true, aiAskedFor: ['audience', 'price', 'mood', 'productDetail'], ...over });
  const yes = cardObserved(card(), asked());
  assert.equal(yes.ok, true);
  assert.deepEqual(yes.asked, ['audience', 'price', 'mood']);
  assert.equal(cardObserved(card({ status: 'approved' }), asked()).ok, false, 'approved but never applied');
  assert.equal(cardObserved(card({ status: 'proposed' }), asked()).ok, false);
  assert.equal(cardObserved(card({ status: 'revoked' }), asked()).ok, false);
  assert.equal(cardObserved(card(), asked({ tool: 'ChatGPT' })).ok, false, 'another AI tool');
  assert.equal(cardObserved(card(), asked({ task: 'cover letter for a barista job' })).ok, false, 'another kind of task');
  assert.equal(cardObserved(card(), asked({ aiAskedFor: ['realPhoto'] })).ok, false, 'unrelated questions');
  assert.equal(cardObserved(card(), asked({ aiAskedClarifyingQuestion: false, aiAskedFor: [] })).ok, false, 'the AI did not ask');
  assert.equal(cardObserved(card({ targetTool: 'your AI' }), asked()).ok, false, 'unknown target tool');
  assert.equal(cardObserved(card({ asks: undefined }), asked({ aiAskedFor: ['audience', 'price'] })).ok, true, 'older card without asks: two asked details');
  assert.equal(cardObserved(card({ status: 'observed-working' }), asked()).ok, true);
});

test('podcast reader keeps a usable paid script despite cosmetic overruns, but not a wrong speaker', () => {
  const line = (i: number) => ({ speaker: i % 2 ? 'guest' : 'caddie', text: `Line ${i} with a few spoken words that run a little long. `.repeat(8).trim() });
  const v = podcastTask.read({ title: 'T'.repeat(10) + ' ' + 'word '.repeat(30), guest: 'Mina, owner of a small café near Seongsu station who bakes daily', lines: Array.from({ length: 22 }, (_, i) => line(i)) });
  assert.ok(v.title.length <= 80 && v.title.endsWith('…'));
  assert.ok(v.guest.length <= 40 && v.guest.endsWith('…'));
  assert.equal(v.lines.length, 22);
  assert.throws(() => podcastTask.read({ title: 't', guest: 'g', lines: Array.from({ length: 8 }, (_, i) => ({ ...line(i), speaker: i === 3 ? 'narrator' : line(i).speaker })) }));
  assert.throws(() => podcastTask.read({ title: 't', guest: 'g', lines: [line(0), line(1)] }), 'too few lines for a conversation');
});
