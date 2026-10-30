import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeDetector, meanAbsDiff } from '../src/change.ts';
import { allowedStep, applyGuardrails, type Proposal } from '../src/ladder.ts';
import { dimensionFor, labelPractice, observeChange, practiceInputFixture, skillFixture } from '../src/labels.ts';
import { firstDue, nextDue, INTERVALS_MS } from '../src/spaced.ts';
import { CAPS, charge, emptyLedger, ledgerAdjust, ledgerReserve, lifetimeCap, META_ABSOLUTE_MAX_USD, META_OPERATING_CEILING_USD, modalCap, remaining, sparkCost } from '../src/budget.ts';
import { encodeWav, parseWav, resample, wavDurationSeconds } from '../src/wav.ts';
import { containsBanned, isGroundedQuote, similarity, speechSeconds, stripBanned } from '../src/text.ts';
import { applyHint, asksFromText, cardObserved } from '../src/cards.ts';
import { choosePointers, estimatedPoster, insidePoster, partPhrases } from '../src/pointers.ts';
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
  assert.equal(skip.action, 'stay-quiet');
  assert.equal(skip.guardrail, 'ladder-step');
  assert.equal(skip.exampleBrief, null);
});

test('a first example is refused whole, never relabelled as a question that still holds the brief', () => {
  const r = applyGuardrails(proposal({ step: 'example', message: 'Copy this brief: A matcha poster for commuters, 6500 won, calm green, with a concept illustration.', exampleBrief: null }), { reading: reading(), history: [], nowMs: 0, activeCard: false });
  assert.equal(r.action, 'stay-quiet');
  assert.equal(r.step, 'watch');
  assert.equal(r.message, null);
  assert.equal(r.guardrail, 'ladder-step');
  assert.match(r.reason, /held back a full example; it has to try one question first/);
  const ingredientsFirst = applyGuardrails(proposal({ step: 'ingredients' }), { reading: reading(), history: [], nowMs: 0, activeCard: false });
  assert.equal(ingredientsFirst.guardrail, 'ladder-step');
});

test('a requested example with no sample brief is refused, not turned into an ingredients list', () => {
  const at = new Date(0).toISOString();
  const asked = moment({ decision: { action: 'intervene', step: 'question', reason: '', quote: null, message: 'Who is it for?', note: null, missingIngredients: [], exampleBrief: null, guardrail: null, provenance: 'live-model', model: 'x', decidedAt: at }, response: { kind: 'asked-example', transcript: null, at } });
  assert.equal(allowedStep([asked]), 'example');
  const empty = applyGuardrails(proposal({ step: 'example', message: 'Here is an example.', exampleBrief: null }), { reading: reading(), history: [asked], nowMs: 10, activeCard: false });
  assert.equal(empty.action, 'stay-quiet');
  assert.equal(empty.guardrail, 'missing-example');
  assert.equal(empty.message, null);
  const ok = applyGuardrails(proposal({ step: 'example', message: 'An example, change it to your words.', exampleBrief: 'A poster for commuters…' }), { reading: reading(), history: [asked], nowMs: 10, activeCard: false });
  assert.equal(ok.action, 'intervene');
  assert.equal(ok.step, 'example');
  assert.equal(ok.exampleBrief, 'A poster for commuters…');
});

test('allowed step climbs one rung per intervention', () => {
  const d = (step: 'question' | 'ingredients') => moment({ decision: { action: 'intervene', step, reason: '', quote: null, message: 'm', note: null, missingIngredients: [], exampleBrief: null, guardrail: null, provenance: 'live-model', model: 'x', decidedAt: new Date(0).toISOString() } });
  assert.equal(allowedStep([]), 'question');
  assert.equal(allowedStep([d('question')]), 'ingredients');
  assert.equal(allowedStep([d('question'), d('ingredients')]), 'example');
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
  assert.equal(cardObserved(card({ status: 'observed-working' }), asked()).ok, true);
  // Codex's reproduced false positives:
  const five = card({ asks: ['audience', 'productDetail', 'price', 'mood', 'realPhoto'] });
  assert.equal(cardObserved(five, asked({ aiAskedFor: ['audience', 'price'] })).ok, false, 'partial: only 2 of the 5 named details');
  assert.equal(cardObserved(five, asked({ aiAskedFor: ['audience', 'productDetail', 'price', 'mood', 'realPhoto'] })).ok, true, 'all five asked');
  assert.equal(cardObserved(card({ asks: undefined, text: 'Verify each quoted claim against the source.' }), asked({ aiAskedFor: ['audience', 'price'] })).ok, false, 'legacy card with unknown requirements');
  assert.equal(cardObserved(card({ scope: 'This kind of task' }), asked({ task: null })).ok, false, 'unknown task on both sides');
  assert.equal(cardObserved(card(), asked({ task: null })).ok, false, 'unknown task on the screen');
});

test('requirements are recognized from an edited rule, or left unknown', () => {
  assert.deepEqual(asksFromText('Before you make a poster, ask me who it is for, what it is, the price, one feeling, and whether a real photo exists.'), ['audience', 'price', 'mood', 'realPhoto', 'productDetail']);
  assert.deepEqual(asksFromText('Before drafting, ask me whether I have a real photo.'), ['realPhoto']);
  assert.deepEqual(asksFromText('Verify each quoted claim against the source.'), []);
  assert.deepEqual(asksFromText('Make posters warmer.'), []);
  // Codex's cases: a negated rule is never read as "ask"; "product photo" is a photo question.
  assert.deepEqual(asksFromText('Before you make a poster, do not ask me for the price.'), []);
  assert.deepEqual(asksFromText("Don't ask who it's for; just make it."), []);
  assert.deepEqual(asksFromText('Before drafting, ask whether a real product photo exists.'), ['realPhoto']);
  assert.deepEqual(asksFromText('Ask me which product it is and the price.'), ['price', 'productDetail']);
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

test('discernment and diligence come only from what the request explicitly says, once per request', () => {
  const before = moment({ id: 'a', reading: reading({ userRequest: 'Make a poster for our new dessert' }) });
  const fix = reading({ userRequest: 'Remove the opening hours, we do not have any', correctsAI: 'opening hours' });
  const c1 = observeChange(fix, [before]);
  assert.equal(c1?.correctedDetail, 'opening hours');
  assert.deepEqual(dimensionFor(c1!), ['discernment']);
  assert.equal(c1?.assistance, 'independent');
  // The same request seen again in the next frame is not a second observation.
  assert.equal(observeChange(fix, [before, moment({ id: 'b', reading: fix })]), null);
  const careful = reading({ userRequest: 'Use only the facts I gave you, do not add anything', asksNoInvention: true });
  assert.deepEqual(dimensionFor(observeChange(careful, [before])!), ['diligence']);
  // A plain style wish is neither.
  assert.equal(observeChange(reading({ userRequest: 'More premium please' }), [before]), null);
  // After a Caddie intervention in the window, a correction is coached, never independent.
  const asked = moment({ id: 'q', decision: { action: 'intervene', step: 'question', reason: '', quote: null, message: 'Who?', note: null, missingIngredients: [], exampleBrief: null, guardrail: null, provenance: 'live-model', model: null, decidedAt: '' } });
  assert.equal(observeChange(fix, [before, asked])?.assistance, 'coached');
});

test('SAM pointers land on the poster, never on the same words in the chat above it', () => {
  // Pixel regions from a real 820×900 Meta AI screenshot: poster x29–337/y344–729, price on it x118–250/y458–493.
  const W = { w: 820, h: 900, c: 0.9 };
  const poster = { x1: 29, y1: 344, x2: 337, y2: 729, ...W };
  const priceInChat = { x1: 300, y1: 60, x2: 420, y2: 90, ...W, c: 0.95 };
  const priceOnPoster = { x1: 118, y1: 458, x2: 250, y2: 493, ...W, c: 0.6 };
  const ps = choosePointers(['price', 'photo'], ['price'], poster, { price: [priceInChat, priceOnPoster] });
  const price = ps.find(p => p.part === 'price')!;
  assert.equal(price.found, true);
  assert.ok(Math.abs(price.box.x - 118 / 820) < 1e-9 && Math.abs(price.box.y - 458 / 900) < 1e-9, 'the poster price, not the more confident chat match');
  const photo = ps.find(p => p.part === 'photo')!;
  assert.equal(photo.found, false);
  assert.equal(photo.text, 'Your product photo isn’t on it.');
  assert.ok(Math.abs(photo.box.w - 309 / 820) < 1e-9, 'a missing part boxes the whole poster');
  // Only chat matches: claim nothing for that part. No poster: no pointers at all.
  assert.deepEqual(choosePointers(['price'], ['price'], poster, { price: [priceInChat] }), []);
  assert.deepEqual(choosePointers(['price'], [], null, {}), []);
  assert.equal(insidePoster(poster, poster), false, 'the poster itself is not a part');
});

test('the first request seen names its details; it is not called an improvement', () => {
  const first = observeChange(reading({ userRequest: 'A matcha cheesecake poster, 6,500 won', ingredients: { audience: false, price: true, mood: false, realPhoto: false, productDetail: true } }), []);
  assert.equal(first?.firstSeen, true);
  assert.doesNotMatch(first!.summary, /\badded\b/);
  assert.match(first!.summary, /named the price, what exactly it is in the first request seen/);
  const later = observeChange(reading({ userRequest: 'For office workers, 6,500 won', ingredients: { audience: true, price: true, mood: false, realPhoto: false, productDetail: false } }), [moment({ id: 'a' })]);
  assert.equal(later?.firstSeen, undefined);
  assert.match(later!.summary, /^added who it is for, the price/);
});

test('practice input origin is separate from model origin', () => {
  assert.equal(practiceInputFixture({ fixture: true }, false), true, 'fixture session');
  assert.equal(practiceInputFixture({ fixture: false }, true), false, 'the session decides when there is one');
  assert.equal(practiceInputFixture(null, true), true, 'standalone in a sample workspace');
  assert.equal(practiceInputFixture(null, false), false, 'an ordinary person');
  assert.equal(skillFixture(true, 'live-model'), true, 'real model on scripted input is still not real-user evidence');
  assert.equal(skillFixture(false, 'live-model'), false, 'real person, real model');
  assert.equal(skillFixture(false, 'fixture'), true, 'test model');
  assert.equal(skillFixture(null, 'live-model'), true, 'unknown origin is never counted as a real person');
  assert.equal(skillFixture(undefined, 'live-model'), true);
});

test('live SAM numbers: the poster price is chosen over the same price in the chat, inside the estimated poster', () => {
  // Real Meta AI screenshot (820×900). SAM answered "price" with the poster price and the chat price.
  const W = { w: 820, h: 900 };
  const poster = estimatedPoster({ x: 0.03, y: 0.37, w: 0.39, h: 0.45 }, 820, 900)!; // a Muse Spark-style estimate
  const ps = choosePointers(['price', 'photo'], ['price', 'photo'], poster, {
    price: [{ x1: 120, y1: 459, x2: 244, y2: 492, ...W, c: 0.72 }, { x1: 292, y1: 92, x2: 337, y2: 107, ...W, c: 0.56 }],
    photo: [{ x1: 116, y1: 513, x2: 256, y2: 620, ...W, c: 0.9 }],
  }, 'muse-spark');
  const price = ps.find(p => p.part === 'price')!;
  assert.equal(price.source, 'sam-3.1');
  assert.ok(Math.abs(price.box.x - 120 / 820) < 1e-9 && Math.abs(price.box.y - 459 / 900) < 1e-9);
  assert.equal(ps.find(p => p.part === 'photo')?.found, true);
  assert.deepEqual(partPhrases('photo', 'Cheesecake'), ['cheesecake', 'food']);
  assert.deepEqual(partPhrases('photo', 'a cake; drop table'), ['food'], 'only plain words go to SAM');
  assert.equal(estimatedPoster(null, 820, 900), null);
  const missing = choosePointers(['price'], [], poster, {}, 'muse-spark')[0];
  assert.equal(missing.source, 'muse-spark');
});
