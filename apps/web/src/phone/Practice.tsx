import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DraftReading, DraftVerdict, Ingredients, PracticeAttempt, PracticeScene, SeenStatus, Snapshot } from '../../../../packages/contracts/index.ts';
import { INGREDIENT_KEYS } from '../../../../packages/contracts/index.ts';
import { post, postBinary, type Creds } from '../lib/api.ts';
import { AssistLabel, errorText, FixtureTag, INGREDIENT_TEXT, MediaImage, sessionMoments } from '../ui/common.tsx';
import { VoiceButton } from './Voice.tsx';
import { practiceSampleLine } from '../../../../packages/core/src/labels.ts';
import { compareDrafts, DETAIL_NAME, gapCause, judgeFeedback, names as list, seen } from '../../../../packages/core/src/practice.ts';

type Key = keyof Ingredients;
type Props = { creds: Creds; state: Snapshot; attemptId: string | null; sessionId: string | null; onStart: (id: string) => void; onOpen?: (id: string) => void; onReturn?: () => void };

/** One request at a time; a second tap while one is in flight does nothing (no duplicate paid work). */
function useAct() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const act = async (fn: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(errorText(e)); } finally { lock.current = false; setBusy(false); }
  };
  return { err, busy, act };
}

/** Where the person is inside a scene (dialogue line, open steps), kept on this device across reloads. */
type Place = { line: number; briefing: boolean; revising: boolean; pick: DraftVerdict | null; fix: Key | null };
const FRESH: Place = { line: 0, briefing: false, revising: false, pick: null, fix: null };
function usePlace(id: string): [Place, (p: Partial<Place>) => void] {
  const k = `coevo.practice.${id}`;
  const [place, setPlace] = useState<Place>(() => {
    try { return { ...FRESH, ...JSON.parse(localStorage.getItem(k) ?? '{}') }; } catch { return FRESH; }
  });
  const update = (p: Partial<Place>) => setPlace(cur => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(k, JSON.stringify(next)); } catch { /* private mode: keep it in memory */ }
    return next;
  });
  return [place, update];
}

/** Stored evidence from the selected session that this practice follows on from; null when there is none. */
function sessionWhy(state: Snapshot, sessionId: string | null) {
  if (!sessionId) return null;
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return null;
  const asks = sessionMoments(state, sessionId).filter(m => m.decision?.action === 'intervene' && !m.misread && m.decision.message);
  const ask = [...asks].reverse().find(m => m.decision!.missingIngredients.length) ?? asks[asks.length - 1] ?? null;
  const missing = [...new Set(asks.flatMap(m => m.decision!.missingIngredients))];
  if (!ask && !s.design) return null;
  return { quote: ask?.decision?.message ?? null, missing, habit: s.design?.habit ?? null };
}


function stageOf(p: PracticeAttempt): string {
  if (p.revision?.status === 'done' || p.finishedAt) return 'Finished';
  if (p.revision) return 'Revising';
  if (p.judgment) return 'Feedback ready';
  if (p.status === 'done') return 'Waiting for your call';
  if (p.status === 'failed') return 'Needs a retry';
  return 'Waiting for your brief';
}

export function PracticeRange({ creds, state, attemptId, sessionId, onStart, onOpen, onReturn }: Props) {
  const p: PracticeAttempt | undefined = attemptId ? state.practice.find(x => x.id === attemptId) : undefined;
  const { err, busy, act } = useAct();
  const start = (changedFrom?: string) => act(async () => onStart((await post<PracticeAttempt>(creds, '/practice', { autoOpened: false, sessionId, changedFrom: changedFrom ?? null })).id));

  // Only this scope's attempts: a session's own, or standalone ones. Another session's practice is never shown here.
  if (p && (p.sessionId ?? null) !== (sessionId ?? null)) {
    return <div className="notice warn" role="alert">This practice belongs to {p.sessionId ? 'another session' : 'standalone practice'}, so it is not shown here. <button className="btn small" onClick={() => start()}>Start a scene here</button></div>;
  }
  if (!p) return <Entry state={state} sessionId={sessionId} missing={!!attemptId} busy={busy} err={err} onStart={() => start()} onOpen={id => (onOpen ?? onStart)(id)} />;
  if (p.status === 'scenario') return <p className="faint" role="status">Setting the scene…</p>;
  if (p.status === 'failed' && !p.scenario) return <div className="notice warn" role="alert">{p.error} <button className="btn small" disabled={busy} onClick={() => start()}>Try again</button>{err && <span className="faint"> {err}</span>}</div>;
  if (!p.scene) return <LegacyAttempt creds={creds} p={p} onAnother={() => start()} />;
  return <ScenePractice key={p.id} creds={creds} p={p} sessionId={sessionId} onAnother={from => start(from)} onReturn={onReturn} startErr={err} />;
}

function Entry({ state, sessionId, missing, busy, err, onStart, onOpen }: { state: Snapshot; sessionId: string | null; missing: boolean; busy: boolean; err: string; onStart: () => void; onOpen: (id: string) => void }) {
  const why = sessionWhy(state, sessionId);
  const recent = state.practice.filter(x => (x.sessionId ?? null) === (sessionId ?? null) && x.status !== 'scenario').slice(-5).reverse();
  return (
    <div className="stack">
      {missing && <p className="notice" role="status">That practice no longer exists.</p>}
      <div className="stack" style={{ gap: 6 }}>
        <h3>Rehearse a changed request</h3>
        <p className="muted">Someone brings a new poster request. You brief the AI in your own words, decide whether its draft is ready, and revise once. About three minutes.</p>
      </div>
      {why ? (
        <div className="card soft stack" style={{ gap: 6 }}>
          <div className="eyebrow">Why this follows your session</div>
          {why.quote && <p>The Caddie asked: <span className="quote">{why.quote}</span></p>}
          {why.missing.length > 0 && <p className="muted">Missing from the requests then: {list(why.missing)}. The scene gives you all five details to brief with.</p>}
          {why.habit && <p className="faint">Habit noted for this session: {why.habit}</p>}
        </div>
      ) : <p className="faint">{sessionId ? 'Attempts here belong to this session.' : 'Standalone practice: not tied to any session, and it uses none of your sessions’ details.'}</p>}
      <button className="btn primary" disabled={busy} onClick={onStart}>{busy ? 'Setting the scene…' : 'Start a scene'}</button>
      {err && <p className="faint" role="alert">{err}</p>}
      {recent.length > 0 && (
        <section className="stack" style={{ gap: 8 }} aria-label="Earlier attempts">
          <div className="eyebrow">{sessionId ? 'Earlier in this session' : 'Earlier standalone practice'}</div>
          {recent.map(x => (
            <button key={x.id} className="btn attempt-row" onClick={() => onOpen(x.id)}>
              <span className="grow" style={{ textAlign: 'left' }}>{x.scene ? `${x.scene.speaker.name}: ${x.scenario}` : x.checkNote ?? x.scenario}</span>
              <span className="row wrap" style={{ gap: 6 }}>
                <span className="faint">{x.scene ? stageOf(x) : 'Earlier format'}</span>
                {x.assistance && <AssistLabel value={x.assistance} extra="practice" />}
                {x.fixture && <FixtureTag />}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

const STEPS = ['Request', 'Brief', 'Judge', 'Revise'] as const;
function Progress({ at }: { at: number }) {
  return (
    <ol className="practice-progress" aria-label={`Step ${at + 1} of 4: ${STEPS[at]}`}>
      {STEPS.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'current' : ''} aria-current={i === at ? 'step' : undefined}><span className="dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>{s}</li>)}
    </ol>
  );
}

function Speaker({ scene, children, caddie }: { scene?: PracticeScene; children: ReactNode; caddie?: boolean }) {
  return (
    <div className={`dialogue${caddie ? ' caddie' : ''}`}>
      <div className="plate">{caddie ? <strong>The Caddie</strong> : <><strong>{scene!.speaker.name}</strong><span>{scene!.speaker.role}</span></>}</div>
      {children}
    </div>
  );
}

function Notes({ scene, compact }: { scene: PracticeScene; compact?: boolean }) {
  return (
    <details className="card notes" open={!compact}>
      <summary><span className="eyebrow">What you know</span></summary>
      <dl>
        {INGREDIENT_KEYS.map(k => <div key={k} className="fact"><dt>{FACT_LABEL[k]}</dt><dd>{scene.facts[k].text}</dd></div>)}
        <div className="fact changed"><dt>What changed</dt><dd>{scene.changed}</dd></div>
      </dl>
    </details>
  );
}
const FACT_LABEL: Record<Key, string> = { audience: 'Who it’s for', price: 'Price', mood: 'Feeling', realPhoto: 'Your photo', productDetail: 'Product' };

function ScenePractice({ creds, p, sessionId, onAnother, onReturn, startErr }: { creds: Creds; p: PracticeAttempt; sessionId: string | null; onAnother: (from: string) => void; onReturn?: () => void; startErr: string }) {
  const s = p.scene!;
  const [place, setPlace] = usePlace(p.id);
  const { err, busy, act } = useAct();
  const lastLine = s.lines.length - 1;
  const line = Math.min(place.line, lastLine);
  const briefing = place.briefing || p.status !== 'open' || !!p.transcript;
  const judged = !!p.judgment;
  const rev = p.revision ?? null;
  const showResult = rev?.status === 'done' || (!!p.finishedAt && !rev);
  const step = !briefing ? 0 : p.status !== 'done' ? 1 : !judged ? 2 : place.revising || rev || p.finishedAt ? 3 : 2;
  const origin = p.provenance === 'fixture' ? 'Scene written by the test model' : 'Scene written by Muse Spark for this practice';
  // A new step starts at the top, so the progress and the new prompt are what the person sees first.
  const root = useRef<HTMLDivElement>(null);
  const mark = `${step}:${judged}:${showResult}`;
  const firstMark = useRef(mark);
  useEffect(() => {
    if (firstMark.current === mark) return;
    firstMark.current = '';
    // Revising starts at the revise panel; everything else at the top of the practice.
    const el = step === 3 && !showResult ? root.current?.querySelector('.revise') ?? root.current : root.current;
    el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [mark]);

  return (
    <div className="stack practice" ref={root}>
      <Progress at={step} />
      {step === 0 ? (
        <div className="scene-stage">
          <img className="scene-bg" src={`/img/practice/${s.setting}.jpg`} alt="" />
          <span className="scene-tag">Illustrative scene</span>
        </div>
      ) : (
        <div className="scene-line">
          <img src={`/img/practice/${s.setting}.jpg`} alt="" />
          <span><strong>{s.speaker.name}</strong> · {s.speaker.role}<span className="faint"> · {p.scenario}</span></span>
        </div>
      )}

      {step === 0 && (
        <>
          <Speaker scene={s}>
            <div aria-live="polite" className="lines">{s.lines.slice(0, line + 1).map((l, i) => <p key={i} className={i === line ? 'current' : 'read'}>{l}</p>)}</div>
            {line < lastLine && <button className="btn small next" onClick={() => setPlace({ line: line + 1 })}>Next</button>}
          </Speaker>
          {line >= lastLine && (
            <>
              <Notes scene={s} />
              <p className="faint">{origin}. The people and the business are fictional.</p>
              <button className="btn primary" onClick={() => setPlace({ briefing: true })}>Brief the AI</button>
            </>
          )}
        </>
      )}

      {step === 1 && <BriefStep creds={creds} p={p} />}

      {step >= 2 && p.status === 'done' && !showResult && (
        <>
          {!judged ? <JudgeStep creds={creds} p={p} place={place} setPlace={setPlace} /> : (
            <>
              <Feedback creds={creds} p={p} />
              {!place.revising && !rev && !p.finishedAt && (
                <div className="row wrap">
                  <button className="btn primary" onClick={() => setPlace({ revising: true })}>Revise the brief</button>
                  <button className="btn" disabled={busy} onClick={() => act(() => post(creds, `/practice/${p.id}/finish`))}>Finish here</button>
                </div>
              )}
              {(place.revising || rev) && <ReviseStep creds={creds} p={p} />}
            </>
          )}
        </>
      )}

      {showResult && (
        <>
          <Result creds={creds} p={p} />
          {p.finishedAt && !rev && <button className="btn" onClick={() => setPlace({ revising: true })}>Revise anyway</button>}
          {p.finishedAt && !rev && place.revising && <ReviseStep creds={creds} p={p} />}
          <div className="row wrap">
            {onReturn && <button className="btn primary" onClick={onReturn}>{sessionId ? 'Back to the session' : 'Close practice'}</button>}
            <button className="btn" onClick={() => onAnother(p.id)}>New scene with a changed condition</button>
          </div>
          {startErr && <p className="faint" role="alert">{startErr}</p>}
        </>
      )}
      <Labels p={p} />
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}

function Labels({ p }: { p: PracticeAttempt }) {
  return (
    <>
      <div className="row wrap">{p.fixture ? <FixtureTag /> : p.fixture === null ? <span className="faint">Origin not recorded</span> : null}{p.autoOpened && <span className="faint">Opened by the Caddie</span>}</div>
      {p.fixture && <p className="faint">{practiceSampleLine(p.briefSource, p.provenance)}</p>}
    </>
  );
}

/** Speak or type a brief; used for the first brief and for the revision. */
function BriefInput({ creds, path, label, disabled }: { creds: Creds; path: string; label: string; disabled?: boolean }) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const { err, busy, act } = useAct();
  return (
    <div className="stack">
      <VoiceButton label={label} maxSeconds={30} disabled={disabled || busy} onWav={wav => postBinary(creds, path, wav, 'audio/wav')} />
      {typing ? (
        <form className="stack" onSubmit={e => { e.preventDefault(); void act(() => post(creds, path, { text: typed })); }}>
          <label className="faint" htmlFor={`typed-${path}`}>Type the brief instead. It is marked as typed, not spoken.</label>
          <textarea id={`typed-${path}`} rows={3} maxLength={600} value={typed} onChange={e => setTyped(e.target.value)} />
          <div className="row"><button className="btn" type="submit" disabled={busy || disabled || typed.trim().length < 3}>{busy ? 'Sending…' : 'Send the typed brief'}</button><button className="btn ghost" type="button" onClick={() => setTyping(false)}>Back to speaking</button></div>
        </form>
      ) : <button className="linklike" onClick={() => setTyping(true)}>Can’t speak right now? Type it</button>}
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}

function BriefStep({ creds, p }: { creds: Creds; p: PracticeAttempt }) {
  const s = p.scene!;
  const [confirmHint, setConfirmHint] = useState(false);
  const { err, act } = useAct();
  const working = p.status === 'transcribing' || p.status === 'checking';
  return (
    <>
      <Speaker caddie><p className="current">{working ? 'Your brief is with the AI.' : 'Your turn. Brief the AI in your own words, out loud (up to 30 seconds) or typed. Muse Image draws a draft from your brief; it can leave things out or add its own, which is why you judge it next.'}</p></Speaker>
      <Notes scene={s} compact={working} />
      {!working && (
        <div className="stack">
          {p.hintViewed ? <p className="faint">Hint: {p.hint}</p> : confirmHint ? (
            <div className="notice">Seeing the hint marks this attempt as “With the Caddie”. <button className="btn small" onClick={() => act(() => post(creds, `/practice/${p.id}/hint`))}>Show hint</button> <button className="btn ghost small" onClick={() => setConfirmHint(false)}>Keep going without it</button></div>
          ) : <button className="linklike" onClick={() => setConfirmHint(true)}>Hint</button>}
          <BriefInput creds={creds} path={`/practice/${p.id}/attempt`} label="Brief the AI out loud" />
          {p.status === 'failed' && <p className="notice warn" role="alert">{p.error} Your scene is kept; brief it again.</p>}
        </div>
      )}
      {p.transcript && <p><span className="faint">{p.briefSource === 'typed' ? 'You typed:' : 'You said:'}</span> <span className="quote">{p.transcript}</span></p>}
      {p.status === 'transcribing' && <p className="faint" role="status">Transcribing your brief…</p>}
      {p.status === 'checking' && <p className="faint" role="status">Muse Image is drawing your brief…</p>}
      {err && <p className="faint" role="alert">{err}</p>}
    </>
  );
}

const CHOICES: { v: DraftVerdict; title: string; sub: string }[] = [
  { v: 'ready', title: 'Ready for the window', sub: 'Put it up as it is.' },
  { v: 'fix', title: 'One detail needs fixing', sub: 'Choose which one.' },
  { v: 'redo', title: 'Start over', sub: 'The draft misses too much.' },
];

function DraftImage({ creds, p, which }: { creds: Creds; p: PracticeAttempt; which: 'first' | 'revision' }) {
  const d = which === 'first' ? p : p.revision!;
  const { err, busy, act } = useAct();
  if (d.imageStatus === 'ready') return <MediaImage creds={creds} k={d.imageKey} alt={`Draft drawn by Muse Image from your ${which === 'revision' ? 'revised ' : ''}${d.briefSource === 'typed' ? 'typed' : 'spoken'} brief`} className="poster-img draft" />;
  if (d.imageStatus === 'generating') return <p className="faint" role="status">Drawing it again…</p>;
  return (
    <div className="notice row wrap">
      <span className="grow">The draft could not be drawn{d.error ? ` (${d.error})` : ''}. The check of your brief is kept.</span>
      <button className="btn small" disabled={busy} onClick={() => act(() => post(creds, `/practice/${p.id}/image`, { which }))}>Draw it again</button>
      {err && <span className="faint" role="alert">{err}</span>}
    </div>
  );
}

function JudgeStep({ creds, p, place, setPlace }: { creds: Creds; p: PracticeAttempt; place: Place; setPlace: (x: Partial<Place>) => void }) {
  const { err, busy, act } = useAct();
  const ready = p.imageStatus === 'ready';
  const canSave = !!place.pick && (place.pick !== 'fix' || !!place.fix);
  return (
    <div className="judge">
      <div className="judge-head">
        <div className="judge-thumb"><DraftImage creds={creds} p={p} which="first" /></div>
        <div className="stack" style={{ gap: 8, alignContent: 'start' }}>
          <h3 id="judge-q">Is this draft ready for the window?</h3>
          <p className="faint">Compare it with what you know, then decide. The Caddie says what it sees only after you save your call.</p>
        </div>
      </div>
      <details className="card soft">
        <summary className="faint">See the draft full size</summary>
        <DraftImage creds={creds} p={p} which="first" />
      </details>
      <details className="card soft">
        <summary className="faint">{p.briefSource === 'typed' ? 'What you typed' : 'What you said'}</summary>
        <p className="quote" style={{ marginTop: 8 }}>{p.transcript}</p>
      </details>
      <Notes scene={p.scene!} compact />
      {ready && (
        <div className="stack" role="group" aria-labelledby="judge-q">
          {CHOICES.map(c => (
            <div key={c.v} className="stack" style={{ gap: 8 }}>
              <button className="choice" aria-pressed={place.pick === c.v} onClick={() => setPlace({ pick: c.v, fix: c.v === 'fix' ? place.fix : null })}>
                <strong>{c.title}</strong><span>{c.sub}</span>
              </button>
              {c.v === 'fix' && place.pick === 'fix' && (
                <div className="detail-chips" role="group" aria-label="Which detail needs fixing?">
                  {INGREDIENT_KEYS.map(k => <button key={k} className="chip" aria-pressed={place.fix === k} onClick={() => setPlace({ fix: k })}>{DETAIL_NAME[k]}</button>)}
                </div>
              )}
            </div>
          ))}
          <button className="btn primary" disabled={!canSave || busy} onClick={() => act(() => post(creds, `/practice/${p.id}/judge`, { verdict: place.pick, fix: place.fix }))}>{busy ? 'Saving…' : 'Save my call'}</button>
          {err && <p className="faint" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}

const SEEN_TEXT: Record<SeenStatus, string> = { shown: 'Shown', missing: 'Missing', unclear: 'Can’t tell' };
const VERDICT_TEXT: Record<DraftVerdict, string> = { ready: 'Ready for the window', fix: 'One detail needs fixing', redo: 'Start over' };

function BriefList({ ingredients, scene }: { ingredients: Ingredients | null; scene: PracticeScene }) {
  if (!ingredients) return <p className="faint">Not checked.</p>;
  return (
    <ul className="checks">
      {INGREDIENT_KEYS.map(k => <li key={k} className={ingredients[k] ? 'yes' : 'no'}><span aria-hidden="true">{ingredients[k] ? '✓' : '○'}</span> {k === 'realPhoto' ? (scene.hasRealPhoto ? 'asks to use your real photo' : 'your own real material') : INGREDIENT_TEXT[k]}<span className="sr-only">{ingredients[k] ? ': in the brief' : ': not in the brief'}</span></li>)}
    </ul>
  );
}

function ReadingList({ creds, p, which }: { creds: Creds; p: PracticeAttempt; which: 'first' | 'revision' }) {
  const d = which === 'first' ? { reading: p.reading, status: p.readingStatus, image: p.imageStatus } : { reading: p.revision!.reading, status: p.revision!.readingStatus, image: p.revision!.imageStatus };
  const { err, busy, act } = useAct();
  if (d.image !== 'ready') return <p className="faint">No draft to read.</p>;
  if (d.status === 'reading' || d.status === 'none' || d.status === undefined) return <p className="faint" role="status">Muse Spark is reading the draft…</p>;
  if (d.status === 'failed' || !d.reading) return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="faint">Not assessed: the draft could not be read, so nothing is said about what it shows.</p>
      <button className="btn small" disabled={busy} onClick={() => act(() => post(creds, `/practice/${p.id}/read`, { which }))}>Read it again</button>
      {err && <span className="faint" role="alert">{err}</span>}
    </div>
  );
  const r = d.reading;
  return (
    <ul className="seen-list">
      {INGREDIENT_KEYS.map(k => {
        const st = seen(p.scene!, r, k);
        const ev = k === 'realPhoto' ? (p.scene!.hasRealPhoto ? 'By rule: a generated image is never your photo.' : 'Not judged: no photo to compare with.') : r.items[k].evidence;
        return <li key={k}><span className={`seen ${st}`}>{SEEN_TEXT[st]}</span><span><strong>{DETAIL_NAME[k]}</strong> <span className="faint">{ev}</span></span></li>;
      })}
    </ul>
  );
}

function Feedback({ creds, p }: { creds: Creds; p: PracticeAttempt }) {
  const s = p.scene!;
  const j = p.judgment!;
  const r: DraftReading | null = p.readingStatus === 'ready' ? p.reading ?? null : null;
  const f = r ? judgeFeedback(s, p.ingredients, r, j) : null;
  return (
    <div className="stack">
      <Speaker caddie>
        <p className="current">{f ? f.headline : p.readingStatus === 'failed' ? 'Your call is saved. The draft could not be read, so it is not assessed against the notes.' : 'Your call is saved. Reading the draft against the notes…'}</p>
      </Speaker>
      {f && f.stakes.length > 0 && <p className="faint">If it went up as drawn, going by Muse Spark’s reading:</p>}
      {f && f.stakes.map(st => <Speaker key={st.key} scene={s}><p className="current">{st.text}</p></Speaker>)}
      <div className="three">
        <section className="card stack" style={{ gap: 8 }}>
          <div className="eyebrow">Your call</div>
          <p><strong>{VERDICT_TEXT[j.verdict]}</strong>{j.verdict === 'fix' && j.fix ? `: ${DETAIL_NAME[j.fix]}` : ''}</p>
          <div><AssistLabel value={j.assistance} extra="your call" /></div>
        </section>
        <section className="card stack" style={{ gap: 8 }}>
          <div className="eyebrow">The brief check found</div>
          <BriefList ingredients={p.ingredients} scene={s} />
          <p className="faint">Kinds of detail in your words, not whether each value matches the notes.</p>
          <div className="row wrap">{p.assistance && <AssistLabel value={p.assistance} extra="practice" />}{p.briefSource === 'typed' && <span className="faint">typed</span>}</div>
        </section>
        <section className="card stack" style={{ gap: 8 }}>
          <div className="eyebrow">The draft shows · Muse Spark’s reading{r?.provenance === 'fixture' ? ' (test model)' : ''}</div>
          <ReadingList creds={creds} p={p} which="first" />
        </section>
      </div>
      {f && f.points.length > 0 && (
        <ul className="stack gap-points" aria-label="What is missing and why">
          {f.points.map(pt => <li key={pt.key}><strong>{DETAIL_NAME[pt.key]}.</strong> {pt.text}</li>)}
        </ul>
      )}
      {f && f.next.length > 0 && <div className="card soft stack" style={{ gap: 6 }}><div className="eyebrow">Try next</div><ul style={{ margin: 0, paddingLeft: 20 }}>{f.next.map(n => <li key={n}>{n}</li>)}</ul></div>}
    </div>
  );
}

function ReviseStep({ creds, p }: { creds: Creds; p: PracticeAttempt }) {
  const rev = p.revision ?? null;
  const working = rev && (rev.status === 'transcribing' || rev.status === 'checking');
  return (
    <div className="card stack revise">
      <div className="eyebrow">Revise once</div>
      {!working && (
        <>
          <p className="muted">Brief it again in your own words. This brief is marked “With the Caddie”, because you have seen the feedback. Your first brief, its draft and labels stay as they were.</p>
          <BriefInput creds={creds} path={`/practice/${p.id}/revise`} label="Brief it again out loud" />
          {rev?.status === 'failed' && <p className="notice warn" role="alert">{rev.error} Brief it again.</p>}
        </>
      )}
      {rev?.transcript && <p><span className="faint">{rev.briefSource === 'typed' ? 'You typed:' : 'You said:'}</span> <span className="quote">{rev.transcript}</span></p>}
      {rev?.status === 'transcribing' && <p className="faint" role="status">Transcribing your revised brief…</p>}
      {rev?.status === 'checking' && <p className="faint" role="status">Muse Image is drawing the revised brief…</p>}
    </div>
  );
}

function Cell({ said, st }: { said: boolean | undefined; st: SeenStatus | null }) {
  return (
    <span className="cell">
      <span className={said ? 'said yes' : 'said no'}>{said === undefined ? '—' : said ? '✓ mentioned' : '○ not found'}</span>
      {st ? <span className={`seen ${st}`}>{SEEN_TEXT[st]}</span> : <span className="faint">not read</span>}
    </span>
  );
}

function Result({ creds, p }: { creds: Creds; p: PracticeAttempt }) {
  const s = p.scene!;
  const rev = p.revision?.status === 'done' ? p.revision : null;
  const first = p.readingStatus === 'ready' ? p.reading ?? null : null;
  const second = rev?.readingStatus === 'ready' ? rev.reading ?? null : null;
  const cmp = first && second ? compareDrafts(s, first, second) : null;
  const tail = rev ? (second ? judgeFeedback(s, rev.ingredients, second, { verdict: 'ready', fix: null }) : null) : null;
  const firstCall = first ? judgeFeedback(s, p.ingredients, first, p.judgment!) : null;
  return (
    <div className="stack">
      <h3>{rev ? 'Before and after your revision' : 'Your attempt'}</h3>
      <div className={rev ? 'thumbs' : 'thumbs one'}>
        <figure><DraftImage creds={creds} p={p} which="first" /><figcaption>First draft {p.assistance && <AssistLabel value={p.assistance} extra="practice" />}</figcaption></figure>
        {rev && <figure><DraftImage creds={creds} p={p} which="revision" /><figcaption>Revised draft <AssistLabel value={rev.assistance} extra="practice" /></figcaption></figure>}
      </div>
      <table className="compare-table">
        <caption className="faint">The first mark is whether the brief check found that kind of detail in your words (it does not compare values with the notes). The second is what Muse Spark could see in that draft.</caption>
        <thead><tr><th scope="col">Detail</th><th scope="col">First</th>{rev && <th scope="col">Revised</th>}</tr></thead>
        <tbody>
          {INGREDIENT_KEYS.map(k => (
            <tr key={k}>
              <th scope="row">{DETAIL_NAME[k]}</th>
              <td><Cell said={p.ingredients?.[k]} st={first ? seen(s, first, k) : null} /></td>
              {rev && <td><Cell said={rev.ingredients?.[k]} st={second ? seen(s, second, k) : null} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rev && rev.readingStatus !== 'ready' && <ReadingList creds={creds} p={p} which="revision" />}
      {!first && <ReadingList creds={creds} p={p} which="first" />}
      <div className="card soft stack" style={{ gap: 6 }}>
        <div className="eyebrow">Your call on the first draft</div>
        <p>{VERDICT_TEXT[p.judgment!.verdict]}{p.judgment!.fix ? `: ${DETAIL_NAME[p.judgment!.fix]}` : ''}. {firstCall ? firstCall.headline : 'The first draft was not read, so your call is not compared with it.'}</p>
      </div>
      {cmp && (
        <div className="card stack" style={{ gap: 6 }}>
          <div className="eyebrow">What changed in the draft</div>
          <p>In Muse Spark’s reading: {cmp.now.length ? `now seen in the draft: ${list(cmp.now)}.` : 'nothing new from the notes is seen in the revised draft.'} {cmp.still.length ? `Still missing: ${list(cmp.still)}.` : 'Nothing is found missing.'}{cmp.unsure.length ? ` Could not tell: ${list(cmp.unsure)}.` : ''}</p>
          {cmp.still.map(k => <p key={k} className="faint">{DETAIL_NAME[k]}: {gapCause(k, rev!.ingredients) === 'brief' ? 'the check did not find it in the revised brief.' : gapCause(k, rev!.ingredients) === 'draft' ? 'your brief mentioned it; Muse Spark did not see it in the draft.' : 'only you can add it.'}</p>)}
        </div>
      )}
      {tail && tail.next.length > 0 && <div className="card soft stack" style={{ gap: 6 }}><div className="eyebrow">Try next</div><ul style={{ margin: 0, paddingLeft: 20 }}>{tail.next.map(n => <li key={n}>{n}</li>)}</ul></div>}
      <p className="faint">No score: these are the details your briefs named and what Muse Spark could see in each draft.</p>
    </div>
  );
}

/** Attempts made before scenes existed keep their original layout. */
function LegacyAttempt({ creds, p, onAnother }: { creds: Creds; p: PracticeAttempt; onAnother: () => void }) {
  const { err, act } = useAct();
  return (
    <div className="stack">
      <div className="card stack">
        <div className="eyebrow">Practice request · earlier format</div>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem' }}>{p.scenario}</p>
        {p.hintViewed && <p className="faint">Hint: {p.hint}</p>}
      </div>
      {(p.status === 'open' || p.status === 'failed') && (
        <>
          <BriefInput creds={creds} path={`/practice/${p.id}/attempt`} label="Brief the AI out loud" />
          {p.status === 'failed' && <p className="faint" role="alert">{p.error}</p>}
        </>
      )}
      {p.status === 'transcribing' && <p className="faint" role="status">Transcribing your brief…</p>}
      {p.status === 'checking' && <p className="faint" role="status">Drawing it with Muse Image and checking the ingredients…</p>}
      {p.transcript && <p><span className="faint">{p.briefSource === 'typed' ? 'You typed:' : 'You said:'}</span> <span className="quote">{p.transcript}</span></p>}
      {p.status === 'done' && (
        <div className="stack">
          {p.imageStatus === 'ready' ? <MediaImage creds={creds} k={p.imageKey} alt={`Poster generated by Muse Image from your ${p.briefSource === 'typed' ? 'typed' : 'spoken'} brief`} className="poster-img" />
            : p.imageStatus === 'generating' ? <p className="faint" role="status">Drawing it again…</p>
            : <div className="notice row wrap"><span className="grow">The image could not be drawn{p.error ? ` (${p.error})` : ''}. The ingredient check still counts.</span><button className="btn small" onClick={() => act(() => post(creds, `/practice/${p.id}/image`))}>Draw it again</button></div>}
          <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 4 }}>
            {INGREDIENT_KEYS.map(k => <li key={k}>{p.ingredients?.[k] ? '✓' : '○'} {INGREDIENT_TEXT[k]}</li>)}
          </ul>
          <p>{p.checkNote}</p>
          <p className="faint">This earlier format checked the brief only; the image was not read.</p>
          <div className="row wrap">{p.assistance && <AssistLabel value={p.assistance} extra="practice" />}</div>
          <button className="btn" onClick={onAnother}>Start a scene</button>
        </div>
      )}
      <Labels p={p} />
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}
