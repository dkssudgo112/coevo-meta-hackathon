// Shared contracts for Coevo Caddie. Erasable TypeScript only (no enums), so
// Node can run tests directly with type stripping.

// ---------- Provenance and evidence vocabulary ----------

/** Who did the work behind an observation. Never conflate these. */
export type Assistance = 'independent' | 'coached' | 'ai-produced' | 'unobserved';

/** How strong an `independent` observation is. Transfer to real work is strongest. */
export type EvidenceStrength = 'transfer' | 'practice' | 'in-task';

/** Where a piece of data came from. Fixture and simulated data must stay labeled. */
export type Provenance = 'observed' | 'live-model' | 'user' | 'rule' | 'fixture' | 'simulated-persona';

/** Delegation, Description, Discernment, Diligence. */
export type SkillDimension = 'delegation' | 'description' | 'discernment' | 'diligence';

export type ContentFormat = 'note' | 'manual' | 'flashcards' | 'podcast' | 'short';

export const CONTENT_FORMATS: readonly ContentFormat[] = ['note', 'manual', 'flashcards', 'podcast', 'short'];

export interface WorkReference {
  /** Workspace id (one paired phone + Desk). */
  projectId: string;
  sessionId: string;
  /** One task inside a session, e.g. "poster for a new dessert". */
  workId: string;
}

// ---------- Capture ----------

export type CaptureSource = 'camera' | 'photo' | 'screen-share' | 'sample';

/** Region of the camera image that contains the screen, normalized 0..1. */
export interface CropRect { x: number; y: number; w: number; h: number }

export interface FrameRef {
  id: string;
  capturedAt: string;
  source: CaptureSource;
  /** R2 key for the device-cropped frame kept as evidence. Absent after deletion. */
  storedKey?: string;
  deleted: boolean;
  width: number;
  height: number;
  /** True when the frame was cropped on the device before upload. */
  deviceCropped: boolean;
  fixture: boolean;
}

// ---------- Reading (model interpretation of one frame) ----------

export interface Ingredients {
  audience: boolean;
  price: boolean;
  mood: boolean;
  realPhoto: boolean;
  productDetail: boolean;
}

export const INGREDIENT_KEYS: readonly (keyof Ingredients)[] = ['audience', 'price', 'mood', 'realPhoto', 'productDetail'];

export const ARTIFACT_PARTS = ['title', 'photo', 'price'] as const;
export type ArtifactPart = (typeof ARTIFACT_PARTS)[number];
export const ARTIFACT_KINDS = ['none', 'design', 'document', 'other'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * Visual coaching: SAM 3.1 points at a region of the person's artifact on the kept frame. When a part
 * the person asked for is missing, the box marks the whole artifact and the text says what is missing.
 */
export interface Pointer {
  part: ArtifactPart;
  /** True when the part is on the artifact (box marks it); false when it is missing (box marks the artifact). */
  found: boolean;
  /** Normalized 0..1 box on the stored frame. */
  box: { x: number; y: number; w: number; h: number };
  confidence: number | null;
  /** Short line, e.g. "The price isn't visible." */
  text: string;
}

export interface Reading {
  legible: boolean;
  /** Name of the AI tool on screen, e.g. "Meta AI", or null when unsure. */
  tool: string | null;
  /** Short task description, e.g. "poster for a new dessert". */
  task: string | null;
  /** Latest user message to the AI, verbatim as read from the screen. */
  userRequest: string | null;
  /** Whether the user appears to be typing an unsent message right now. */
  userTyping: boolean;
  aiResponseSummary: string | null;
  /** True when the AI's latest turn asks the user clarifying questions before producing. */
  aiAskedClarifyingQuestion: boolean;
  /** Which details the AI asked for before producing (empty when it did not ask). Older readings may lack it. */
  aiAskedFor?: (keyof Ingredients)[];
  artifactVisible: boolean;
  /** What the latest request tells the AI to fix or remove from its earlier result (a wrong or invented detail), or null. Older readings may lack it. */
  correctsAI?: string | null;
  /** The latest request explicitly tells the AI not to invent details, to use only the given facts, or to mark assumptions. */
  asksNoInvention?: boolean;
  /** What kind of result the AI shows: a designed image (poster, flyer, menu…), a text document, something else, or none. Older readings may lack it. */
  artifactKind?: ArtifactKind;
  /** For a visible poster-like artifact: which parts it clearly shows. Older readings may lack it. */
  artifactShows?: ArtifactPart[];
  /** Vague style words the user leaned on, e.g. ["premium"]. */
  vagueTerms: string[];
  /** Ingredients present in the user's latest request. */
  ingredients: Ingredients;
  /** 0..1 self-reported confidence. */
  confidence: number;
}

// ---------- Caddie decisions ----------

export type LadderStep = 'watch' | 'question' | 'ingredients' | 'example';

export const LADDER: readonly LadderStep[] = ['watch', 'question', 'ingredients', 'example'];

export interface Decision {
  action: 'stay-quiet' | 'intervene';
  step: LadderStep;
  /** Why the Caddie intervened or stayed quiet. Always present. */
  reason: string;
  /** User's own words being quoted, if any. */
  quote: string | null;
  /** The card text shown on the phone (null when quiet). */
  message: string | null;
  /** One short line for the flow, e.g. why the Caddie stayed quiet. Model-written. */
  note: string | null;
  missingIngredients: (keyof Ingredients)[];
  /** Only at the `example` step. Anything the user copies from here is ai-produced. */
  exampleBrief: string | null;
  /** Set when a deterministic guardrail changed the model's proposal. */
  guardrail: string | null;
  provenance: Provenance;
  model: string | null;
  decidedAt: string;
}

export type ResponseKind = 'voice-answer' | 'typed-answer' | 'later' | 'dismissed' | 'misread' | 'asked-example';

export interface UserResponse {
  kind: ResponseKind;
  transcript: string | null;
  at: string;
}

export type ReadingStatus = 'pending' | 'ok' | 'illegible' | 'error' | 'disabled' | 'budget';

export interface Moment {
  id: string;
  work: WorkReference;
  index: number;
  at: string;
  frame: FrameRef | null;
  readingStatus: ReadingStatus;
  readingError: string | null;
  reading: Reading | null;
  /** Set when the user said "That's not what I asked". Excluded from evidence. */
  misread: boolean;
  decision: Decision | null;
  response: UserResponse | null;
  /** Observed change compared with the previous legible moment. */
  change: ObservedChange | null;
  provenance: Provenance;
  /** Server-side latency breakdown for this moment, in milliseconds. */
  timing?: MomentTiming | null;
  /** Captured in the disclosed benchmark test mode (frame kept for evaluation, max 20). */
  benchmark?: boolean;
  /** Id of the server instance that started this moment's work (restart recovery). */
  runner?: string;
  /** The server restarted while this moment was being read or decided; nothing was invented for it. */
  interrupted?: boolean;
  /** SAM 3.1 pointers on the artifact (visual coaching), when a check ran for this moment. */
  pointers?: Pointer[];
  pointerCheck?: { status: 'done' | 'failed'; model: string; at: string; error?: string };
}

export interface MomentTiming {
  mode: 'separate' | 'combined';
  /** Token-count round trips (before each generation). */
  countMs: number;
  /** Generation round trips. */
  generateMs: number;
  /** Upload accepted → decision stored. */
  totalMs: number;
  calls: number;
  /** Benchmark only, measured on the phone: screen change first detected → card shown, and upload → card shown. */
  client?: { changeToCardMs: number | null; uploadToCardMs: number };
}

export interface ObservedChange {
  addedIngredients: (keyof Ingredients)[];
  /** Assistance label for the change, based on whether the Caddie had intervened. */
  assistance: Assistance;
  aiAskedFirst: boolean;
  /** No earlier readable request in this session: the details were named, not shown to be added. */
  firstSeen?: boolean;
  /** Discernment evidence: the request corrected this detail of the AI's earlier result. */
  correctedDetail?: string | null;
  /** Diligence evidence: the request told the AI not to invent details or to mark assumptions. */
  askedNoInvention?: boolean;
  summary: string;
}

// ---------- Evidence and skills ----------

export interface Evidence {
  id: string;
  work: WorkReference;
  momentId: string | null;
  practiceId: string | null;
  kind: 'user-request' | 'ai-output' | 'caddie-intervention' | 'user-decision' | 'observed-change' | 'practice' | 'card-observation';
  sourceText: string;
  assistance: Assistance;
  strength: EvidenceStrength | null;
  dimension: SkillDimension | null;
  observedAt: string;
  fixture: boolean;
  provenance: Provenance;
}

// ---------- Caddie cards (rules for the user's AI) ----------

export type CardStatus = 'proposed' | 'approved' | 'applied' | 'observed-working' | 'rejected' | 'revoked';

export interface CardEvent {
  status: CardStatus;
  at: string;
  by: 'user' | 'caddie' | 'observation';
  note: string | null;
}

export interface CaddieCard {
  id: string;
  sessionId: string;
  text: string;
  /** Where the rule applies, e.g. "Posters and menu visuals". */
  scope: string;
  targetTool: string;
  /** Details the card tells the AI to ask for; used to check that an observed question matches the card. */
  asks?: (keyof Ingredients)[];
  status: CardStatus;
  history: CardEvent[];
  sourceMomentIds: string[];
  provenance: Provenance;
}

// ---------- Content ----------

export type ContentStatus = 'skipped' | 'queued' | 'generating' | 'ready' | 'failed';

export interface LearningDesign {
  habit: string;
  turningPoint: { quote: string; momentId: string | null };
  remainingConditions: string[];
  counterpoint: string;
  ingredientsUsed: (keyof Ingredients)[];
  /** The Caddie's choice per format, with a one-line reason. */
  formats: Record<ContentFormat, { make: boolean; why: string }>;
}

export interface NotePayload { title: string; body: string; quotes: { text: string; momentId: string | null }[]; remaining: string[] }

export interface ManualPayload {
  title: string;
  whenToUse: string;
  whenNotToUse: string;
  steps: { text: string; check: string; owner: 'ai' | 'you' }[];
  pitfalls: string[];
  forYourAI: string[];
  youDecide: string[];
  /** One rule for the user's AI, in their voice; becomes the proposed Caddie card. */
  cardRule: string;
  /** Details the card rule tells the AI to ask for. */
  cardAsks: (keyof Ingredients)[];
}

export interface Flashcard { id: string; prompt: string; answer: string; scenario: string; dueAt: string; interval: number; reviews: { at: string; result: 'applied' | 'unsure' }[] }

export interface FlashcardsPayload { cards: Flashcard[] }

export interface PodcastLine { speaker: 'caddie' | 'guest'; text: string; start: number; end: number }

export interface PodcastPayload {
  title: string;
  /** Total narration words; >= 160 words keeps the audio above 60 seconds. */
  words: number;
  speakers: { caddie: string; guest: string };
  lines: PodcastLine[];
  audioKey: string | null;
  durationSec: number | null;
  /** Renderer phase timings in seconds (model load, TTS, composition). */
  renderTiming?: Record<string, number | boolean> | null;
  asks: { question: string; answer: string; atSec: number; at: string; provenance: Provenance }[];
}

export type ShortSceneRole = 'hook' | 'evidence' | 'cause' | 'rule' | 'question';

export interface ShortScene {
  role: ShortSceneRole;
  /** Full narration; captions show this text in full. */
  narration: string;
  imagePrompt: string | null;
  imageKey: string | null;
  /** 'before'/'after' scenes use the user's own frames as evidence. */
  evidence: 'before' | 'after' | null;
  evidenceFrameId: string | null;
  diagram: { nodes: string[] } | null;
  start: number;
  end: number;
}

export interface ShortPayload { title: string; scenes: ShortScene[]; videoKey: string | null; durationSec: number | null; renderTiming?: Record<string, number | boolean> | null }

export type ContentPayload = NotePayload | ManualPayload | FlashcardsPayload | PodcastPayload | ShortPayload;

export interface ContentItem {
  id: string;
  sessionId: string;
  format: ContentFormat;
  status: ContentStatus;
  whyNow: string;
  sourceMomentIds: string[];
  /** When the Caddie wants this to arrive in the flow. */
  arriveAt: string;
  payload: ContentPayload | null;
  error: string | null;
  attempts: number;
  provenance: Provenance;
  updatedAt: string;
  /** Which server instance is generating it; a restarted instance knows the work was lost. */
  runner?: string;
  /** The Caddie skipped this format and the person asked for it anyway; whyNow keeps the Caddie's reason. */
  requestedByUser?: boolean;
}

// ---------- Practice Range ----------

export interface PracticeAttempt {
  id: string;
  sessionId: string | null;
  scenario: string;
  /** Written by the model; shown only when the user taps Hint (marks the attempt coached). */
  hint: string | null;
  startedAt: string;
  /** Opened by the Caddie automatically (excluded from independent evidence). */
  autoOpened: boolean;
  /** The user looked at a hint/explanation before answering. */
  hintViewed: boolean;
  transcript: string | null;
  /** How the brief was given: spoken (the drill) or typed (fallback when speaking is not possible). */
  briefSource?: 'spoken' | 'typed';
  imageKey: string | null;
  imageStatus: 'none' | 'generating' | 'ready' | 'failed';
  ingredients: Ingredients | null;
  checkNote: string | null;
  assistance: Assistance | null;
  status: 'scenario' | 'open' | 'transcribing' | 'checking' | 'done' | 'failed';
  error: string | null;
  /** Where the MODEL output came from (live model or the test fake). */
  provenance: Provenance;
  /**
   * Where the INPUT came from: true for a scripted/sample context (a fixture session or a sample
   * workspace), false for an ordinary person's attempt, null when an older record did not say.
   */
  fixture?: boolean | null;
}

// ---------- Sessions, inbox, workspace ----------

export interface Session {
  id: string;
  workspaceId: string;
  startedAt: string;
  endedAt: string | null;
  tool: string | null;
  task: string | null;
  workId: string;
  status: 'live' | 'paused' | 'ended';
  fixture: boolean;
  /** Content for this session has been planned. */
  wrapStatus: 'none' | 'planning' | 'planned' | 'failed';
  design: LearningDesign | null;
}

export interface InboxItem {
  id: string;
  kind: 'example-brief' | 'caddie-card' | 'note';
  text: string;
  /** Tool-specific apply hint, e.g. how to store it in Meta AI Memory. */
  applyHint: string | null;
  refId: string | null;
  at: string;
  copiedAt: string | null;
}

export interface SkillObservation {
  id: string;
  dimension: SkillDimension;
  assistance: Assistance;
  strength: EvidenceStrength | null;
  momentId: string | null;
  practiceId: string | null;
  note: string;
  at: string;
  /** Not real-user evidence (scripted input, sample workspace or a test model). */
  fixture: boolean;
  /** An older practice record did not say where its input came from; never counted as a real person. */
  originUnknown?: boolean;
}

export interface WorkspaceSummary {
  id: string;
  createdAt: string;
  kind: 'user' | 'sample';
  paired: boolean;
  liveCalls: boolean;
  /** Local test runs only: a scripted fake model answers, and everything it makes is fixture. */
  testFakeModels: boolean;
  budget: { spentUsd: number; capUsd: number };
}

export interface Snapshot {
  workspace: WorkspaceSummary;
  sessions: Session[];
  moments: Moment[];
  cards: CaddieCard[];
  content: ContentItem[];
  practice: PracticeAttempt[];
  inbox: InboxItem[];
  skills: SkillObservation[];
}

export type EntityName = 'session' | 'moment' | 'card' | 'content' | 'practice' | 'inbox' | 'skill';

export type ServerEvent =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'upsert'; entity: EntityName; data: Session | Moment | CaddieCard | ContentItem | PracticeAttempt | InboxItem | SkillObservation }
  | { type: 'remove'; entity: EntityName; id: string }
  | { type: 'workspace'; workspace: WorkspaceSummary }
  | { type: 'notice'; level: 'info' | 'warn'; code: string; message: string };

// ---------- Health ----------

export interface Readiness {
  service: 'coevo';
  mode: 'mock' | 'live';
  metaKeyConfigured: boolean;
  liveCallsEnabled: boolean;
  mediaServiceConfigured: boolean;
  testFakeModels: boolean;
  model: string;
  implementation: 'caddie';
}
