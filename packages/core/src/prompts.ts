// Model tasks: instructions, output schema and a strict reader for each.
// All generated product text is English. Every reader rejects malformed output
// instead of filling in invented content.

import type {
  ContentFormat, Flashcard, Ingredients, LadderStep, LearningDesign, ManualPayload, NotePayload, PodcastLine,
  Reading, ShortScene, ShortSceneRole,
} from '../../contracts/index.ts';
import { CONTENT_FORMATS, INGREDIENT_KEYS, LADDER } from '../../contracts/index.ts';
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

const STYLE = `Write plain, specific English. No praise, greetings, cheerleading, filler or closing summaries. Never say "great", "awesome", "perfect", "well done". Address the person as "you". Quote the person's own words exactly when you quote, at most 15 words at a time (use … to skip words). Prefer what they typed to the AI over voice transcripts: transcripts can contain recognition errors and repeated words, so never quote those parts. Never mention clock times; refer to a moment by what happened in it.`;

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
- vagueTerms: style words in the latest request that carry no concrete instruction, lowercased (e.g. "premium", "luxurious", "better", "modern", "cute").
- ingredients: judge only the latest user request.`,
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
Never repeat a question the AI already asked. One improvement at a time. Message at most 2 sentences and 160 characters. ${STYLE}
Special cases:
- firstSighting=true: stay quiet; in "note" say in at most 90 characters which tool and task you can see and that you will only speak when it helps.
- If an applied Caddie card in activeCards covers this tool and task and the AI asked the clarifying questions first: stay quiet; in "note" say that their AI asked first, as their card says, so you are staying quiet. This takes priority over firstSighting.
- "note" is one short flow line (at most 60 characters, 90 for firstSighting) describing what you saw or why you stayed quiet.`,
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
If nothing meaningful changed, set make=false for all and say why. ${STYLE}`,
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
  maxOutputTokens: 2200,
  instructions: `Write a two-person podcast script (8–18 lines, 300–480 words in total, about 2–3 minutes spoken; never under 60 seconds). Speakers: "caddie" (the coach) and "guest", a skeptical friend in a similar situation (another small-business owner for a menu poster, another job seeker for a cover letter) who raises real objections (time, cost, "why not just say premium?"). The caddie may narrow or withdraw advice when an objection holds; the ending must reflect conditions that changed. Use this session's real moments and the person's own words (quote exactly). The caddie speaks in the first person about its own questions ("when I asked …"). Spoken style, short sentences, no stage directions, no sound effects. ${STYLE}`,
  schema: S.obj({
    title: S.str('Episode title.', 80),
    guest: S.str('Guest display name with their situation, e.g. "Jun, bakery owner".', 40),
    lines: S.arr(S.obj({ speaker: S.enumOf(['caddie', 'guest'], 'Speaker.'), text: S.str('Spoken line.', 500) }), 'Lines.', 8, 18),
  }),
  read(json) {
    const o = R.obj(json, 'podcast');
    return {
      title: R.str(o.title, 'title', 80),
      guest: R.str(o.guest, 'guest', 40),
      lines: R.arr(o.lines, 'lines', (x, p) => { const l = R.obj(x, p); return { speaker: R.oneOf(l.speaker, ['caddie', 'guest'] as const, `${p}.speaker`), text: R.str(l.text, `${p}.text`, 500) }; }, 8, 18),
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

export const practiceScenarioTask: ModelTask<{ scenario: string; hint: string }> = {
  name: 'practice_scenario',
  effort: 'low',
  maxOutputTokens: 400,
  instructions: `Create one short practice request for the Practice Range, in the person's own domain but with a changed condition (a new item, season, audience or channel). One sentence, at most 140 characters, as if a customer or partner asked for it. Also write a hint (at most 140 characters) listing what a strong brief would include, without writing the brief. ${STYLE}`,
  schema: S.obj({ scenario: S.str('Practice request.', 160), hint: S.str('Hint.', 160) }),
  read(json) { const o = R.obj(json, 'scenario'); return { scenario: R.str(o.scenario, 'scenario', 160), hint: R.str(o.hint, 'hint', 160) }; },
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
