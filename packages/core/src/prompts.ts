// Model tasks: instructions, output schema and a strict reader for each.
// All generated product text is English. Every reader rejects malformed output
// instead of filling in invented content.

import type {
  ContentFormat, DraftReading, Flashcard, Ingredients, LadderStep, LearningDesign, ManualPayload, NotePayload, PodcastLine,
  PracticeFact, PracticeScene, Reading, SeenStatus, ShortScene, ShortSceneRole,
} from '../../contracts/index.ts';
import { ARTIFACT_KINDS, ARTIFACT_PARTS, CONTENT_FORMATS, INGREDIENT_KEYS, LADDER, PRACTICE_SETTINGS } from '../../contracts/index.ts';
import type { JsonSchema } from './schema.ts';
import { R, S, ShapeError } from './schema.ts';
import type { Proposal } from './ladder.ts';

export type Effort = 'minimal' | 'low' | 'medium' | 'high';

export interface ModelTask<T> {
  name: string;
  instructions: string;
  schema: JsonSchema;
  maxOutputTokens: number;
  effort: Effort;
  read: (json: unknown) => T;
}

/** Shorten a display string at a word boundary. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).trimEnd()}…`;
}

const STYLE = `Write plain, specific English. No praise, greetings, cheerleading, filler or closing summaries. Never say "great", "awesome", "perfect", "well done". Address the person as "you". Quote the person's own words exactly when you quote, at most 15 words at a time (use … to skip words). Prefer what they typed to the AI over voice transcripts: transcripts can contain recognition errors and repeated words, so never quote those parts. Never mention clock times; refer to a moment by what happened in it. Keep events in the order they happened, and never say the person disliked, rejected or did not want a result unless they said so.`;

const ingredientsSchema = S.obj({
  audience: S.bool('Says who it is for: a specific customer group, reader, hiring team or audience.'),
  price: S.bool('Gives a concrete number: a price, offer, quantity, measurable result or deadline.'),
  mood: S.bool('Names a concrete feeling, tone, scene or reference. Vague words like "premium", "nicer" or "more professional" do NOT count.'),
  realPhoto: S.bool('Supplies the person\'s own real material: a real photo, a real experience or story, or real data — not something the AI could invent.'),
  productDetail: S.bool('Names the specific thing and what makes it distinct (a product\'s flavor or size, a role and company, a project).'),
}, 'Ingredients present in the latest user request only. These apply to any task: posters, cover letters, emails, reports.');

function readIngredients(v: unknown, path: string): Ingredients {
  const o = R.obj(v, path);
  return {
    audience: R.bool(o.audience, `${path}.audience`),
    price: R.bool(o.price, `${path}.price`),
    mood: R.bool(o.mood, `${path}.mood`),
    realPhoto: R.bool(o.realPhoto, `${path}.realPhoto`),
    productDetail: R.bool(o.productDetail, `${path}.productDetail`),
  };
}

// ---------------------------------------------------------------- reading

/** [x, y, w, h] fractions → a box, or null when absent, malformed or degenerate. */
function readBox(v: unknown): Reading['artifactBox'] {
  if (!Array.isArray(v) || v.length !== 4 || v.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) return null;
  const [x, y, w, h] = v as number[];
  if (w < 0.02 || h < 0.02 || x + w > 1.001 || y + h > 1.001) return null;
  return { x, y, w, h };
}

export const readingTask: ModelTask<Reading> = {
  name: 'screen_reading',
  effort: 'low',
  maxOutputTokens: 900,
  instructions: `You read one photo of a computer screen. It was taken by a phone camera next to the monitor and cropped to the screen on the phone. The screen usually shows a person working with an AI assistant (a chat, an image generator, a writing tool).
Report only what is visible. Never guess text you cannot read. If the conversation text is not readable, set legible=false and leave text fields null.
- tool: the AI product name if visible or recognizable from the interface (e.g. "Meta AI", "ChatGPT", "Gemini", "Claude", "Copilot", "Grok"), else null.
- userRequest: the person's most recent message to the AI, copied exactly as shown (keep their wording and typos).
- userTyping: true only if there is unsent text in the input box.
- aiAskedClarifyingQuestion: true only if the AI's most recent turn asks the person questions before producing the result.
- aiAskedFor: when it asked, which details its questions ask for (audience = who it is for; price = a price or number; mood = a feeling or tone; realPhoto = whether the person has a real photo or own material; productDetail = what exactly it is). Empty when it did not ask.
- aiResponseSummary: one sentence on what the AI did; name any concrete detail it added that the latest request did not give (e.g. opening hours, a slogan).
- vagueTerms: style words in the latest request that carry no concrete instruction, lowercased (e.g. "premium", "luxurious", "better", "modern", "cute").
- ingredients: judge only the latest user request.
- correctsAI: if the latest request tells the AI to fix, remove or replace a specific thing in its earlier result (for example "remove the opening hours, we don't have any", "the price is 6,500 won, not 6,000"), name that thing in a few words; else null. A new style wish ("more premium") is not a correction.
- asksNoInvention: true only if the latest request explicitly tells the AI not to invent or add details, to use only the facts given, or to mark anything it assumed.
- artifactKind: "design" when the AI's visible result is a poster, flyer, menu, banner, social post or other designed image; "document" for text such as a letter, email or report; "other" for anything else; "none" when no result is visible.
- artifactBox: only when artifactKind is "design": where that designed result sits on this photo as [x, y, width, height], each a fraction 0–1 of the whole photo; an empty list otherwise.
- artifactSubject: only when artifactKind is "design": the main thing it shows as a short concrete noun ("cheesecake", "coffee cup"); null otherwise.
- artifactShows: only when artifactKind is "design": which of these it clearly shows — "title" (a headline or product name), "photo" (a picture of the product), "price" (a readable price). Empty when there is no such artifact or none is visible. Never guess small text you cannot read.`,
  schema: S.obj({
    legible: S.bool('Whether the conversation text is readable.'),
    tool: S.nstr('AI tool name or null.', 40),
    task: S.nstr('What the person is making, in a few words, e.g. "poster for a new dessert".', 80),
    userRequest: S.nstr('Latest user message, verbatim.', 600),
    userTyping: S.bool('Unsent text in the input box.'),
    aiResponseSummary: S.nstr('What the AI did in its latest turn, at most one sentence.', 200),
    aiAskedClarifyingQuestion: S.bool('The AI asked questions before producing.'),
    aiAskedFor: S.arr(S.enumOf(INGREDIENT_KEYS, 'detail'), 'Details the AI asked for before producing; empty if it did not ask.', 0, 5),
    artifactVisible: S.bool('An image, poster, draft or document produced by the AI is visible.'),
    correctsAI: S.nstr('What the latest request tells the AI to fix or remove from its earlier result, or null.', 80),
    asksNoInvention: S.bool('The latest request tells the AI not to invent details or to mark assumptions.'),
    artifactKind: S.enumOf(ARTIFACT_KINDS, 'Kind of visible AI result: design (poster, flyer…), document, other, or none.'),
    artifactBox: S.arr(S.num('fraction 0-1', 0, 1), 'Designed result position [x, y, width, height] as fractions of the photo; empty if none.', 0, 4),
    artifactSubject: S.nstr('Main thing the designed result shows, a short concrete noun; null if none.', 40),
    artifactShows: S.arr(S.enumOf(ARTIFACT_PARTS, 'part'), 'Parts a visible poster-like artifact clearly shows; empty if none.', 0, 3),
    vagueTerms: S.arr(S.str('vague word', 30), 'Vague style words in the latest request.', 0, 6),
    ingredients: ingredientsSchema,
    confidence: S.num('0..1 confidence in this reading.', 0, 1),
  }),
  read(json) {
    const o = R.obj(json, 'reading');
    const legible = R.bool(o.legible, 'legible');
    return {
      legible,
      tool: R.nstr(o.tool, 'tool', 40),
      task: R.nstr(o.task, 'task', 80),
      userRequest: legible ? R.nstr(o.userRequest, 'userRequest', 600) : null,
      userTyping: R.bool(o.userTyping, 'userTyping'),
      aiResponseSummary: R.nstr(o.aiResponseSummary, 'aiResponseSummary', 200),
      aiAskedClarifyingQuestion: R.bool(o.aiAskedClarifyingQuestion, 'aiAskedClarifyingQuestion'),
      aiAskedFor: R.arr(o.aiAskedFor, 'aiAskedFor', (x, p) => R.oneOf(x, INGREDIENT_KEYS, p), 0, 5),
      artifactVisible: R.bool(o.artifactVisible, 'artifactVisible'),
      correctsAI: legible && o.correctsAI !== undefined ? R.nstr(o.correctsAI, 'correctsAI', 80) : null,
      asksNoInvention: legible && o.asksNoInvention !== undefined ? R.bool(o.asksNoInvention, 'asksNoInvention') : false,
      artifactKind: o.artifactKind === undefined ? undefined : R.oneOf(o.artifactKind, ARTIFACT_KINDS, 'artifactKind'),
      artifactBox: readBox(o.artifactBox),
      artifactSubject: o.artifactSubject === undefined ? null : R.nstr(o.artifactSubject, 'artifactSubject', 40),
      artifactShows: o.artifactShows === undefined ? [] : R.arr(o.artifactShows, 'artifactShows', (x, p) => R.oneOf(x, ARTIFACT_PARTS, p), 0, 3),
      vagueTerms: R.arr(o.vagueTerms, 'vagueTerms', (x, p) => R.str(x, p, 30).toLowerCase(), 0, 6),
      ingredients: readIngredients(o.ingredients, 'ingredients'),
      confidence: R.num(o.confidence, 'confidence', 0, 1),
    };
  },
};

// ---------------------------------------------------------------- decision

export interface DecisionInput {
  firstSighting: boolean;
  reading: Reading;
  recentRequests: { at: string; text: string; vagueTerms: string[]; ingredients: (keyof Ingredients)[] }[];
  repeatedVagueTerm: { term: string; count: number } | null;
  interventions: { at: string; step: LadderStep; message: string; response: string | null }[];
  activeCards: string[];
  memory: string[];
  secondsSinceLastIntervention: number | null;
  /** The highest ladder step allowed for this decision (never skip ahead). */
  highestStepAllowed: LadderStep;
}

export const decisionTask: ModelTask<Proposal> = {
  name: 'caddie_decision',
  effort: 'low',
  maxOutputTokens: 700,
  instructions: `You are the Caddie: a coach on the phone next to someone's screen. You coach HOW the person directs their AI tool, not the AI's output. The person does the work; you step in only when it matters. Staying quiet is the default and is a decision too: always give the reason.
Intervene only when one of these is true:
1. The person keeps asking with vague words (the same vague term 3+ times, or 3+ requests without adding a new ingredient) and the results are not converging.
2. The person seems ready to finish something generic that anyone could have produced, while their own specific material is missing.
3. The person directly answered or asked you something that needs a reply.
Ladder (use the lowest step that can work, one step at a time):
- question: ONE short question that makes the person supply a missing ingredient. Quote their exact words if it helps. Do not write the brief for them.
- ingredients: a short list of what is missing (who it's for, a concrete number, one concrete feeling or tone, the person's own real material, specific details). For a poster that might be the price and a real photo; for a cover letter, one thing only this person did.
- example: only if the person asked for an example or stayed stuck after ingredients. Give a short sample brief in their context and call it an example.
Never use a step above highestStepAllowed in the input; a message written for a higher step is thrown away. Only the example step may contain a sample brief.
Never repeat a question the AI already asked. One improvement at a time. Message at most 2 sentences and 160 characters. ${STYLE}
Special cases:
- firstSighting=true: stay quiet; in "note" say in at most 90 characters which tool and task you can see and that you will only speak when it helps.
- If an applied Caddie card in activeCards covers this tool and task and the AI asked the clarifying questions first: stay quiet; in "note" say that their AI asked first, as their card says, so you are staying quiet. This takes priority over firstSighting.
- "note" is one short flow line (at most 60 characters, 90 for firstSighting) describing what you saw or why you stayed quiet.
- "reason" is one plain sentence in everyday words (no jargon such as "converging" or "ingredient"); many readers speak English as a second language.`,
  schema: S.obj({
    action: S.enumOf(['stay-quiet', 'intervene'], 'Intervene or stay quiet.'),
    step: S.enumOf(LADDER, 'Ladder step. Use "watch" when quiet.'),
    reason: S.str('Why you intervened or stayed quiet, one sentence.', 200),
    quote: S.nstr('Exact words from the latest user request you are quoting, or null.', 120),
    message: S.nstr('Card text for the phone when intervening, else null.', 200),
    note: S.nstr('One short flow line.', 100),
    missingIngredients: S.arr(S.enumOf(INGREDIENT_KEYS, 'ingredient'), 'Missing ingredients you are pointing at.', 0, 5),
    exampleBrief: S.nstr('Only at the example step: a short sample brief.', 400),
  }),
  read(json) {
    const o = R.obj(json, 'decision');
    const action = R.oneOf(o.action, ['stay-quiet', 'intervene'] as const, 'action');
    return {
      action,
      step: R.oneOf(o.step, LADDER, 'step'),
      reason: R.str(o.reason, 'reason', 200),
      quote: R.nstr(o.quote, 'quote', 120),
      message: action === 'intervene' ? R.nstr(o.message, 'message', 200) : null,
      note: R.nstr(o.note, 'note', 100),
      missingIngredients: R.arr(o.missingIngredients, 'missingIngredients', (x, p) => R.oneOf(x, INGREDIENT_KEYS, p), 0, 5),
      exampleBrief: R.nstr(o.exampleBrief, 'exampleBrief', 400),
    };
  },
};

// ---------------------------------------------------------------- learning design

export const designTask: ModelTask<LearningDesign> = {
  name: 'learning_design',
  effort: 'medium',
  maxOutputTokens: 1400,
  instructions: `You plan follow-up learning for one finished work session, from the evidence given (moments read from the screen, the Caddie's interventions, the person's answers, observed changes with assistance labels). Make content only from what actually happened. Never credit the AI's work to the person. Never invent events.
Decide for each of the five formats whether it earns its place now, with a one-line reason tied to a moment of use:
- note: right after the session; worth it when a coached or independent change happened.
- manual: next-time procedure split into "for your AI" and "you decide"; worth it when this kind of task will recur or the same correction repeated.
- flashcards: idle moments on the phone; worth it when a concept was coached rather than done independently.
- podcast: prep or commute time; worth it when there is a real objection or trade-off to argue.
- short: reviewing or sharing; worth it when there is a visible before/after.
If nothing meaningful changed, set make=false for all and say why. When the AI's output shows details the person never supplied (for example opening hours or a slogan), add each to remainingConditions as a fact to check. ${STYLE}`,
  schema: S.obj({
    habit: S.str('The habit that changed or needs to change, one sentence.', 200),
    turningPoint: S.obj({ quote: S.str('The person\'s exact words at the turning point.', 200), momentId: S.nstr('Moment id of that quote.', 40) }),
    remainingConditions: S.arr(S.str('condition', 160), 'Conditions still open.', 0, 4),
    counterpoint: S.str('The strongest honest objection to the change, one sentence.', 200),
    ingredientsUsed: S.arr(S.enumOf(INGREDIENT_KEYS, 'ingredient'), 'Ingredients the person ended up supplying.', 0, 5),
    formats: S.obj(Object.fromEntries(CONTENT_FORMATS.map(f => [f, S.obj({ make: S.bool('Make it now.'), why: S.str('Why now (or why not), one line.', 140) })]))),
  }),
  read(json) {
    const o = R.obj(json, 'design');
    const tp = R.obj(o.turningPoint, 'turningPoint');
    const fm = R.obj(o.formats, 'formats');
    const formats = {} as LearningDesign['formats'];
    for (const f of CONTENT_FORMATS) {
      const x = R.obj(fm[f], `formats.${f}`);
      formats[f] = { make: R.bool(x.make, `formats.${f}.make`), why: R.str(x.why, `formats.${f}.why`, 140) };
    }
    return {
      habit: R.str(o.habit, 'habit', 200),
      turningPoint: { quote: R.str(tp.quote, 'turningPoint.quote', 200), momentId: R.nstr(tp.momentId, 'turningPoint.momentId', 40) },
      remainingConditions: R.arr(o.remainingConditions, 'remainingConditions', (x, p) => R.str(x, p, 160), 0, 4),
      counterpoint: R.str(o.counterpoint, 'counterpoint', 200),
      ingredientsUsed: R.arr(o.ingredientsUsed, 'ingredientsUsed', (x, p) => R.oneOf(x, INGREDIENT_KEYS, p), 0, 5),
      formats,
    };
  },
};

// ---------------------------------------------------------------- note

export const noteTask: ModelTask<NotePayload> = {
  name: 'note',
  effort: 'low',
  maxOutputTokens: 900,
  instructions: `Write the session note: what changed the result. Lead with the person's turning-point words (quote exactly). Separate what the person decided from what the AI produced; when the change is labeled coached, say plainly that it came after the Caddie's question; when ai-produced, say the AI wrote it. List open conditions. Do not restate what the AI already explained. Body at most 800 characters. ${STYLE}`,
  schema: S.obj({
    title: S.str('Short title.', 80),
    body: S.str('At most 800 characters.', 800),
    quotes: S.arr(S.obj({ text: S.str('Exact quote of the person.', 200), momentId: S.nstr('Moment id.', 40) }), 'Quotes used.', 1, 4),
    remaining: S.arr(S.str('Open condition.', 160), 'Still open.', 0, 4),
  }),
  read(json) {
    const o = R.obj(json, 'note');
    return {
      title: R.str(o.title, 'title', 80),
      body: R.str(o.body, 'body', 800),
      quotes: R.arr(o.quotes, 'quotes', (x, p) => { const q = R.obj(x, p); return { text: R.str(q.text, `${p}.text`, 200), momentId: R.nstr(q.momentId, `${p}.momentId`, 40) }; }, 1, 4),
      remaining: R.arr(o.remaining, 'remaining', (x, p) => R.str(x, p, 160), 0, 4),
    };
  },
};

// ---------------------------------------------------------------- manual

export const manualTask: ModelTask<ManualPayload> = {
  name: 'manual',
  effort: 'low',
  maxOutputTokens: 1200,
  instructions: `Write "My playbook": the procedure for the next time the person does this kind of task with an AI. 2–7 steps; each step pairs an action with what it checks; owner "ai" when the AI should do or ask it, "you" when the person must decide. Up to 4 pitfalls taken from this session. "forYourAI" lists instructions the AI should follow; "youDecide" lists choices only the person can make. "cardRule" is ONE rule the person will paste into their AI, written in the person's voice to the AI (first person: "Before you make …, ask me …"), at most 200 characters. It must hold for this whole kind of task, not just this session: no session-specific options, products or style choices; name what to ask for (e.g. who it is for, what exactly, the price or number, one feeling, whether a real photo exists). It should prevent the loop seen in this session. Never invent numbers, prices or deadlines that were not in the evidence. ${STYLE}`,
  schema: S.obj({
    title: S.str('Short title.', 80),
    whenToUse: S.str('When to use this playbook.', 160),
    whenNotToUse: S.str('When not to.', 160),
    steps: S.arr(S.obj({ text: S.str('Action.', 160), check: S.str('What it checks.', 160), owner: S.enumOf(['ai', 'you'], 'Who does it.') }), 'Steps.', 2, 7),
    pitfalls: S.arr(S.str('Pitfall.', 160), 'Pitfalls.', 0, 4),
    forYourAI: S.arr(S.str('Instruction for the AI.', 200), 'For your AI.', 1, 5),
    youDecide: S.arr(S.str('Decision for the person.', 160), 'You decide.', 1, 5),
    cardRule: S.str('One rule in the person\'s voice to their AI ("Before you make …, ask me …"), general to this kind of task.', 200),
    cardAsks: S.arr(S.enumOf(INGREDIENT_KEYS, 'detail'), 'Details the card rule tells the AI to ask for.', 1, 5),
  }),
  read(json) {
    const o = R.obj(json, 'manual');
    return {
      title: R.str(o.title, 'title', 80),
      whenToUse: R.str(o.whenToUse, 'whenToUse', 160),
      whenNotToUse: R.str(o.whenNotToUse, 'whenNotToUse', 160),
      steps: R.arr(o.steps, 'steps', (x, p) => { const s = R.obj(x, p); return { text: R.str(s.text, `${p}.text`, 160), check: R.str(s.check, `${p}.check`, 160), owner: R.oneOf(s.owner, ['ai', 'you'] as const, `${p}.owner`) }; }, 2, 7),
      pitfalls: R.arr(o.pitfalls, 'pitfalls', (x, p) => R.str(x, p, 160), 0, 4),
      forYourAI: R.arr(o.forYourAI, 'forYourAI', (x, p) => R.str(x, p, 200), 1, 5),
      youDecide: R.arr(o.youDecide, 'youDecide', (x, p) => R.str(x, p, 160), 1, 5),
      cardRule: R.str(o.cardRule, 'cardRule', 200),
      cardAsks: R.arr(o.cardAsks, 'cardAsks', (x, p) => R.oneOf(x, INGREDIENT_KEYS, p), 1, 5),
    };
  },
};

// ---------------------------------------------------------------- flashcards

export const flashcardsTask: ModelTask<Omit<Flashcard, 'id' | 'dueAt' | 'interval' | 'reviews'>[]> = {
  name: 'flashcards',
  effort: 'low',
  maxOutputTokens: 1000,
  instructions: `Write 1–4 flashcards that make the person APPLY the lesson to a changed situation (not recall a definition). Front: "scenario" holds every condition needed, then "prompt" asks what they would tell or ask the AI. Back: "answer" explains why, and when a different choice would hold. The back adds no new conditions. Keep each field under 220 characters. ${STYLE}`,
  schema: S.obj({
    cards: S.arr(S.obj({ scenario: S.str('Changed situation with all conditions.', 220), prompt: S.str('Question.', 160), answer: S.str('Why + when another choice holds.', 260) }), 'Cards.', 1, 4),
  }),
  read(json) {
    const o = R.obj(json, 'flashcards');
    return R.arr(o.cards, 'cards', (x, p) => { const c = R.obj(x, p); return { scenario: R.str(c.scenario, `${p}.scenario`, 220), prompt: R.str(c.prompt, `${p}.prompt`, 160), answer: R.str(c.answer, `${p}.answer`, 260) }; }, 1, 4);
  },
};

// ---------------------------------------------------------------- podcast

export const podcastTask: ModelTask<{ title: string; guest: string; lines: Omit<PodcastLine, 'start' | 'end'>[] }> = {
  name: 'podcast',
  effort: 'medium',
  // Medium reasoning shares this budget: a 5,700-token cap was observed to cut a 2–3 minute script short.
  maxOutputTokens: 5000,
  instructions: `Write a two-person podcast script (8–18 lines, 300–480 words in total, about 2–3 minutes spoken; never under 60 seconds). Speakers: "caddie" (the coach) and "guest", a skeptical friend in a similar situation (another small-business owner for a menu poster, another job seeker for a cover letter) who raises real objections (time, cost, "why not just say premium?"). The caddie may narrow or withdraw advice when an objection holds; the ending must reflect conditions that changed. Use this session's real moments and the person's own words (quote exactly). The caddie speaks in the first person about its own questions ("when I asked …"). Spoken style, short sentences, no stage directions, no sound effects. ${STYLE}`,
  schema: S.obj({
    title: S.str('Episode title.', 80),
    guest: S.str('Guest display name with their situation, e.g. "Jun, bakery owner".', 40),
    lines: S.arr(S.obj({ speaker: S.enumOf(['caddie', 'guest'], 'Speaker.'), text: S.str('Spoken line, at most 3 sentences.', 500) }), 'Lines.', 8, 18),
  }),
  // Display fields are clipped and a few extra or longer lines are accepted, so a usable
  // paid script is never thrown away for a cosmetic overrun; speaker and structure stay strict.
  read(json) {
    const o = R.obj(json, 'podcast');
    return {
      title: clip(R.str(o.title, 'title', 400), 80),
      guest: clip(R.str(o.guest, 'guest', 200), 40),
      lines: R.arr(o.lines, 'lines', (x, p) => { const l = R.obj(x, p); return { speaker: R.oneOf(l.speaker, ['caddie', 'guest'] as const, `${p}.speaker`), text: R.str(l.text, `${p}.text`, 900) }; }, 6, 26),
    };
  },
};

export const podcastAskTask: ModelTask<{ answer: string }> = {
  name: 'podcast_ask',
  effort: 'low',
  maxOutputTokens: 400,
  instructions: `The person paused the podcast to ask a question. Answer in at most 3 sentences, grounded only in this session's evidence and the episode so far. If the evidence does not cover it, say so plainly. ${STYLE}`,
  schema: S.obj({ answer: S.str('Answer.', 500) }),
  read(json) { const o = R.obj(json, 'ask'); return { answer: R.str(o.answer, 'answer', 500) }; },
};

// ---------------------------------------------------------------- short

const SHORT_ROLES: readonly ShortSceneRole[] = ['hook', 'evidence', 'cause', 'rule', 'question'];

export const shortTask: ModelTask<{ title: string; scenes: Omit<ShortScene, 'imageKey' | 'evidenceFrameId' | 'start' | 'end'>[] }> = {
  name: 'short',
  effort: 'medium',
  maxOutputTokens: 1600,
  instructions: `Plan a 30–45 second vertical (9:16) short that shows ONE mechanism from this session. 4–6 scenes in this arc: hook (a question or surprise) → evidence (the person's own screen; set evidence to "before" or "after", imagePrompt null; when the result visibly changed, use two evidence scenes: "before", then "after") → cause (a 2–4 node diagram of why vague words fail and ingredients work) → rule (the rule with its condition) → question (a closing transfer question). Each scene: 1–2 complete spoken sentences of narration (total 75–115 words). Captions show the narration in full, so write it to be read too. imagePrompt (only for hook/rule/question scenes) describes a calm, photographic or illustrated background with NO text in the image. ${STYLE}`,
  schema: S.obj({
    title: S.str('Title.', 60),
    scenes: S.arr(S.obj({
      role: S.enumOf(SHORT_ROLES, 'Scene role.'),
      narration: S.str('1–2 sentences.', 260),
      imagePrompt: S.nstr('Background image prompt without text, or null.', 400),
      evidence: S.nenumOf(['before', 'after'], 'Evidence frame to show, or null.'),
      diagram: { type: ['object', 'null'], description: 'Only for cause scenes.', properties: { nodes: S.arr(S.str('node', 40), 'Nodes.', 2, 4) }, required: ['nodes'], additionalProperties: false },
    }), 'Scenes.', 4, 6),
  }),
  read(json) {
    const o = R.obj(json, 'short');
    return {
      title: R.str(o.title, 'title', 60),
      scenes: R.arr(o.scenes, 'scenes', (x, p) => {
        const s = R.obj(x, p);
        const role = R.oneOf(s.role, SHORT_ROLES, `${p}.role`);
        const diagram = s.diagram === null || s.diagram === undefined ? null : { nodes: R.arr(R.obj(s.diagram, `${p}.diagram`).nodes, `${p}.diagram.nodes`, (n, q) => R.str(n, q, 40), 2, 4) };
        const evidence = s.evidence === null || s.evidence === undefined ? null : R.oneOf(s.evidence, ['before', 'after'] as const, `${p}.evidence`);
        return { role, narration: R.str(s.narration, `${p}.narration`, 260), imagePrompt: R.nstr(s.imagePrompt, `${p}.imagePrompt`, 400), evidence, diagram };
      }, 4, 6),
    };
  },
};

// ---------------------------------------------------------------- practice

const factSchema = (what: string) => S.obj({
  text: S.str(`On the notes: ${what}. A plain fact the person can use, at most 90 characters. Never a full brief.`, 100),
  stake: S.str(`What goes wrong if the poster leaves this out, said by the speaker in first person, at most 110 characters.`, 120),
});
function readFact(v: unknown, path: string): PracticeFact {
  const o = R.obj(v, path);
  return { text: R.str(o.text, `${path}.text`, 100), stake: R.str(o.stake, `${path}.stake`, 120) };
}

/** A short practice scene: a fictional person brings a changed request; the notes hold one fact per ingredient. */
export const practiceScenarioTask: ModelTask<{ scenario: string; hint: string; scene: PracticeScene }> = {
  name: 'practice_scenario',
  effort: 'low',
  maxOutputTokens: 1100,
  instructions: `Write one short practice scene for the Practice Range, in the person's own domain but with one changed condition (a new item, season, audience or channel). A fictional colleague who shares the work (a co-owner, business partner, manager or teammate — never the person themself, never a customer, never a real or famous person) brings a request for something an image model can draw: a poster, flyer, menu board or social-media image — never a caption, email or other text, because the person's brief is drawn as an image.
- "scenario": the request in one sentence, at most 140 characters.
- "setting": cafe for a café or coffee bar, shop for a bakery or other small shop, desk for anything else.
- "speaker": a short first name and their role relative to the person (at most 40 characters). The lines and every "stake" speak as that colleague, about the shared business ("our customers", "we").
- "lines": 2 or 3 short spoken lines (each at most 150 characters) in which the speaker asks for it and mentions the changed condition. Natural speech; do not list every fact.
- "changed": what is different from the usual request, at most 110 characters.
- "facts": the notes the person has after the conversation, one per ingredient: who it is for, a concrete number (price or offer), a concrete feeling, the person's own real material (say plainly whether a real photo exists, e.g. "You have a phone photo of the cup on the counter"), and the specific product detail. Facts must be consistent with the lines and invent nothing the lines contradict. Each fact has a "stake": in the speaker's voice, what goes wrong if the poster leaves it out.
- "hasRealPhoto": true only if the facts say a real photo exists.
- "hint" (at most 140 characters): what a strong brief would include, without writing the brief.
${STYLE}`,
  schema: S.obj({
    scenario: S.str('Practice request.', 160),
    setting: S.enumOf(PRACTICE_SETTINGS, 'Backdrop.'),
    speaker: S.obj({ name: S.str('First name.', 24), role: S.str('Role relative to the person.', 44) }),
    lines: S.arr(S.str('One spoken line.', 160), 'Dialogue lines.', 2, 3),
    changed: S.str('What changed.', 120),
    facts: S.obj({
      audience: factSchema('who it is for'),
      price: factSchema('a concrete number: the price or offer'),
      mood: factSchema('a concrete feeling or scene'),
      realPhoto: factSchema('whether the person has their own real photo, and of what'),
      productDetail: factSchema('the specific product and what makes it distinct'),
    }),
    hasRealPhoto: S.bool('A real photo exists.'),
    hint: S.str('Hint.', 160),
  }),
  read(json) {
    const o = R.obj(json, 'scenario');
    const sp = R.obj(o.speaker, 'speaker');
    const f = R.obj(o.facts, 'facts');
    const facts = Object.fromEntries(INGREDIENT_KEYS.map(k => [k, readFact(f[k], `facts.${k}`)])) as PracticeScene['facts'];
    const scene: PracticeScene = {
      setting: R.oneOf(o.setting, PRACTICE_SETTINGS, 'setting'),
      speaker: { name: R.str(sp.name, 'speaker.name', 24), role: R.str(sp.role, 'speaker.role', 44) },
      lines: R.arr(o.lines, 'lines', (x, p) => R.str(x, p, 160), 2, 3).filter(Boolean),
      changed: R.str(o.changed, 'changed', 120),
      facts,
      hasRealPhoto: R.bool(o.hasRealPhoto, 'hasRealPhoto'),
    };
    if (scene.lines.length < 2) throw new ShapeError('lines', 'expected at least 2 non-empty lines');
    return { scenario: R.str(o.scenario, 'scenario', 160), hint: R.str(o.hint, 'hint', 160), scene };
  },
};

const SEEN = ['shown', 'missing', 'unclear'] as const satisfies readonly SeenStatus[];
const seenSchema = (what: string) => S.obj({
  status: S.enumOf(SEEN, `${what}: shown = clearly visible in the image; missing = absent or contradicted; unclear = cannot be told from the image alone.`),
  evidence: S.str('What you actually see that decides it, at most 90 characters. Describe only what is visible.', 100),
});

/** Reads a generated draft against the scene's facts. It never receives the person's brief. */
export const practiceObserveTask: ModelTask<Omit<DraftReading, 'provenance'>> = {
  name: 'practice_observe',
  effort: 'low',
  maxOutputTokens: 700,
  instructions: `You see one AI-generated poster draft and the facts the poster was meant to carry. For each fact, say only what the image itself shows: "shown" when it is clearly visible (for a number, only if that exact number is legible), "missing" when it is absent or the image shows something else, "unclear" when the image alone cannot tell (for example who a poster is for, when nothing in it points to that group). Never assume something is there because it was intended. You are given no photo to compare with: for "realPhoto" always answer "unclear" with the evidence "No photo was given to compare with." Then one sentence (at most 140 characters) on the most important gap, or that the draft carries the facts. ${STYLE}`,
  schema: S.obj({
    items: S.obj({
      audience: seenSchema('Who it is for'),
      price: seenSchema('The number'),
      mood: seenSchema('The feeling'),
      realPhoto: seenSchema('The real photo (always unclear: no photo is given)'),
      productDetail: seenSchema('The product detail'),
    }),
    note: S.str('One sentence.', 160),
  }),
  read(json) {
    const o = R.obj(json, 'observe');
    const it = R.obj(o.items, 'items');
    const items = Object.fromEntries(INGREDIENT_KEYS.map(k => {
      const v = R.obj(it[k], `items.${k}`);
      return [k, { status: R.oneOf(v.status, SEEN, `items.${k}.status`), evidence: R.str(v.evidence, `items.${k}.evidence`, 100) }];
    })) as DraftReading['items'];
    return { items, note: R.str(o.note, 'note', 160) };
  },
};

export const practiceCheckTask: ModelTask<{ ingredients: Ingredients; note: string }> = {
  name: 'practice_check',
  effort: 'low',
  maxOutputTokens: 400,
  instructions: `Judge a spoken brief (transcribed) that the person gave for a practice request. Mark which ingredients the brief itself contains. Then one sentence (at most 140 characters) naming the most useful missing ingredient, or stating that all were present. ${STYLE}`,
  schema: S.obj({ ingredients: ingredientsSchema, note: S.str('One sentence.', 160) }),
  read(json) { const o = R.obj(json, 'check'); return { ingredients: readIngredients(o.ingredients, 'ingredients'), note: R.str(o.note, 'note', 160) }; },
};

export const FORMAT_TASKS: Record<Exclude<ContentFormat, never>, string> = {
  note: noteTask.name,
  manual: manualTask.name,
  flashcards: flashcardsTask.name,
  podcast: podcastTask.name,
  short: shortTask.name,
};

export { ShapeError };

// ---------------------------------------------------------------- combined turn (reading + decision in one call)

export interface TurnContext {
  firstSightingIfLegible: boolean;
  recentRequests: DecisionInput['recentRequests'];
  interventions: DecisionInput['interventions'];
  activeCards: string[];
  memory: string[];
  secondsSinceLastIntervention: number | null;
  highestStepAllowed: LadderStep;
}

/** One call that reads the screen and decides, to cut latency. Same schemas and readers as the separate tasks. */
export const turnTask: ModelTask<{ reading: Reading; proposal: Proposal }> = {
  name: 'caddie_turn',
  effort: 'low',
  maxOutputTokens: 1500,
  instructions: `Two steps in one answer.
STEP 1 — "reading": ${readingTask.instructions}
STEP 2 — "decision": ${decisionTask.instructions}
For step 2, use your step-1 reading plus the context JSON in the message. When counting repeated vague requests, include the latest request you just read if it is new. If the screen is not legible, stay quiet. firstSighting applies only when the context says firstSightingIfLegible=true and the screen is legible.`,
  schema: S.obj({ reading: readingTask.schema, decision: decisionTask.schema }),
  read(json) {
    const o = R.obj(json, 'turn');
    return { reading: readingTask.read(o.reading), proposal: decisionTask.read(o.decision) };
  },
};
