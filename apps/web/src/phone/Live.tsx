import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ContentItem, Moment, Session, SkillDimension, Snapshot } from '../../../../packages/contracts/index.ts';
import { post, postBinary, api, type Creds } from '../lib/api.ts';
import type { ConnState } from '../lib/store.ts';
import { vibrate } from '../lib/capture.ts';
import { AssistLabel, changeText, clock, DataTable, Empty, errorText, Flag, FixtureTag, INGREDIENT_TEXT, latestSession, MediaImage, modelSourceLine, PointerFrame, momentLine, PROVIDER_DATA_NOTICE, sessionMoments, type FlagState } from '../ui/common.tsx';
import { byFormat, CardControls, ContentBody, FORMAT_NAME, NoteView } from '../ui/Players.tsx';
import { VoiceButton } from './Voice.tsx';
import { connectionTrouble, illegibleRun } from '../lib/moments.ts';
import { PracticeRange } from './Practice.tsx';
import { ReadAloudSetting, useReadAloud } from './ReadAloud.tsx';

export interface CameraInfo {
  mode: 'camera' | 'photo';
  videoRef: RefObject<HTMLVideoElement | null>;
  message: string;
  onReaim: () => void;
  onPhoto: (file: File) => void;
}

/** Content opened from a past session remembers it, so Back returns there (not to the live session). */
type Sheet = { kind: 'content'; id: string } | { kind: 'practice'; id: string | null; sessionId: string | null } | { kind: 'session'; id: string; highlight?: string } | null;

function Sheet({ title, onClose, back = 'Back to session', waiting, children }: { title: string; onClose: () => void; back?: string; waiting?: boolean; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <header><h2 className="grow">{title}</h2><button className="btn small" onClick={onClose}>{back}</button></header>
        {waiting && <p className="faint" role="status">The Caddie has a new question. It waits until you go back.</p>}
        {children}
      </div>
    </div>
  );
}

export function LiveScreen({ creds, state, conn, camera, embedded, onUnpair }: { creds: Creds; state: Snapshot | null; conn: ConnState; camera?: CameraInfo; embedded?: boolean; onUnpair?: () => void }) {
  // Sheets stack, so Back retraces the path (past session → content → source → back to content).
  const [stack, setStack] = useState<NonNullable<Sheet>[]>([]);
  const sheet: Sheet = stack[stack.length - 1] ?? null;
  const open = (s: NonNullable<Sheet>) => setStack(st => [...st, s]);
  const back = () => setStack(st => st.slice(0, -1));
  const replaceTop = (s: NonNullable<Sheet>) => setStack(st => [...st.slice(0, -1), s]);
  const backLabel = stack.length > 1 ? 'Back' : 'Back to session';
  const [drawer, setDrawer] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [err, setErr] = useState('');
  const session = latestSession(state);
  const moments = sessionMoments(state, session?.id);
  const newestAsk = useMemo(() => [...moments].reverse().find(m => m.decision?.action === 'intervene' && !m.misread) ?? null, [moments]);
  // While the person is recording or typing an answer, that question stays on screen: a newer
  // question waits (no buzz, no swap) until the answer is sent or cancelled.
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const onAnswering = useCallback((id: string, active: boolean) => setAnsweringId(cur => (active ? id : cur === id ? null : cur)), []);
  const pinned = answeringId ? moments.find(m => m.id === answeringId) ?? null : null;
  useEffect(() => { if (answeringId && !pinned) setAnsweringId(null); }, [answeringId, pinned]);
  const asking = pinned ?? newestAsk;
  const waitingAsk = pinned && newestAsk && newestAsk.id !== pinned.id && !newestAsk.response ? newestAsk : null;
  // Acting on the question in the work itself (new ingredients observed) also answers it — but not while answering it.
  const resolvedBy = useMemo(() => (asking && !pinned ? moments.find(m => m.index > asking.index && m.change && !m.misread) ?? null : null), [moments, asking, pinned]);
  // undefined until the first snapshot arrives: whatever is already there is history and never buzzes;
  // every question that arrives after that buzzes, including the first one of a quiet session.
  const seenAsk = useRef<string | null | undefined>(undefined);
  const hydrated = state !== null;
  const ra = useReadAloud();
  useEffect(() => { if (answeringId) ra.stop(); }, [answeringId]);

  // Reading something on the phone (a sheet or the menu) also defers the buzz and speech (plan 3.4).
  const readingSheet = stack.length > 0 || drawer;
  const unseenAsk = hydrated && seenAsk.current !== undefined && !!newestAsk && !newestAsk.response && seenAsk.current !== newestAsk.id;
  useEffect(() => {
    if (!hydrated) return;
    if (seenAsk.current === undefined) { seenAsk.current = newestAsk?.id ?? null; return; }
    if (answeringId || readingSheet) return; // deferred: buzzes once the answer is sent or the sheet is closed
    if (newestAsk && !newestAsk.response && seenAsk.current !== newestAsk.id) {
      vibrate([60, 40, 60]); setPulse(true); setTimeout(() => setPulse(false), 1900);
      ra.say(newestAsk.decision?.message ?? '');
      seenAsk.current = newestAsk.id;
    }
  }, [hydrated, newestAsk?.id, answeringId, readingSheet]);

  if (!state) return <div className="phone"><main><p className="faint" role="status">{conn === 'unauthorized' ? 'This phone is no longer paired.' : 'Connecting to your Desk…'}</p>{conn === 'unauthorized' && onUnpair && <button className="btn" onClick={onUnpair}>Pair again</button>}</main></div>;

  const flag: FlagState = !session || session.status === 'paused' ? 'off' : asking && !asking.response && !resolvedBy ? 'asking' : moments.length ? 'quiet' : 'watching';
  const toolLine = session ? `${session.status === 'paused' ? 'Paused' : session.status === 'ended' ? 'Session ended' : 'Watching'}${session.tool ? ` · ${session.tool}` : ''}` : 'Ready';

  const act = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(errorText(e)); } };

  return (
    <div className="phone">
      <div className="statusbar">
        <Flag state={flag} />
        <div className="grow"><div className="title">{toolLine}</div><div className="sub">{conn === 'live' ? (session?.task ?? 'Coevo Caddie') : 'Reconnecting…'}{session?.fixture && <> · <FixtureTag /></>}</div></div>
        {session && session.status !== 'ended' && <button className="btn small" onClick={() => act(() => post(creds, `/sessions/${session.id}/${session.status === 'paused' ? 'resume' : 'pause'}`))}>{session.status === 'paused' ? 'Resume' : 'Pause'}</button>}
        <button className="btn small" aria-label="Open menu" onClick={() => setDrawer(true)}>≡</button>
      </div>
      {camera?.mode === 'photo' && (
        <div className="card soft row" style={{ margin: '12px 16px 0' }}>
          <span className="grow faint">{camera.message}</span>
          <label className="btn primary small">📷 Send a photo<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; if (f) camera.onPhoto(f); e.target.value = ''; }} /></label>
        </div>
      )}
      {camera?.mode === 'camera' && (
        <div className="camstrip" aria-label="Live camera view of your screen">
          <video ref={camera.videoRef as RefObject<HTMLVideoElement>} playsInline muted />
          <span className="cam-msg" role="status">{session?.status === 'paused' ? 'Paused — camera off, nothing is sent' : camera.message}</span>
        </div>
      )}
      <main>
        {(state.workspace.testFakeModels || !state.workspace.liveCalls) && <div className="notice warn" role="status">{modelSourceLine({ liveCallsEnabled: state.workspace.liveCalls, testFakeModels: state.workspace.testFakeModels })}</div>}
        <NowCard creds={creds} state={state} session={session} moments={moments} asking={asking} resolvedBy={resolvedBy} pulse={pulse} answering={!!pinned} waiting={!!waitingAsk} onAnswering={onAnswering} camera={camera} onReadAgain={ra.on ? ra.say : undefined} onOpen={id => open({ kind: 'content', id })} onPractice={sid => open({ kind: 'practice', id: null, sessionId: sid })} act={act} />
        {err && <p className="faint" role="alert">{err}</p>}
        <Flow state={state} session={session} moments={moments} onOpen={id => open({ kind: 'content', id })} />
        {session && session.status !== 'ended' && <button className="btn ghost" onClick={() => act(() => post(creds, `/sessions/${session.id}/end`))}>End this session</button>}
      </main>

      {drawer && (
        <>
          <div className="sheet-backdrop" onClick={() => setDrawer(false)} />
          <aside className="drawer" aria-label="Menu">
            <div className="row"><h2 className="grow">Caddie</h2><button className="btn small" onClick={() => setDrawer(false)}>Close</button></div>
            <section className="stack">
              <button className="btn" onClick={() => { setDrawer(false); setStack([{ kind: 'practice', id: null, sessionId: null }]); }}>Practice Range</button>
              {camera && <button className="btn" onClick={() => { setDrawer(false); camera.onReaim(); }}>Re-aim the camera</button>}
              {camera && <label className="btn">Send one photo<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; if (f) { setDrawer(false); camera.onPhoto(f); } }} /></label>}
            </section>
            <ReadAloudSetting ra={ra} />
            <Playbook creds={creds} state={state} />
            <Habits state={state} />
            <section className="stack">
              <h3>Past sessions</h3>
              {[...state.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(s => (
                <button key={s.id} className="btn" style={{ justifyContent: 'space-between' }} onClick={() => { setDrawer(false); setStack([{ kind: 'session', id: s.id }]); }}>
                  <span>{s.task ?? 'Session'}{s.fixture ? ' · sample' : ''}</span><span className="faint">{new Date(s.startedAt).toLocaleDateString('en-US')} {clock(s.startedAt)}</span>
                </button>
              ))}
              {!state.sessions.length && <Empty>No sessions yet.</Empty>}
            </section>
            <Privacy creds={creds} state={state} session={session} />
            {!embedded && onUnpair && <button className="btn ghost" onClick={onUnpair}>Unpair this phone</button>}
            <p className="faint">Model use today, paid by this demo (not you): ${state.workspace.budget.spentUsd.toFixed(3)} of ${state.workspace.budget.capUsd.toFixed(2)} cap.</p>
          </aside>
        </>
      )}

      {sheet?.kind === 'content' && (() => {
        const item = state.content.find(c => c.id === sheet.id);
        return item ? (
          <Sheet title={FORMAT_NAME[item.format]} onClose={back} back={backLabel} waiting={unseenAsk}>
            <ContentBody item={item} state={state} creds={creds} onSource={m => open({ kind: 'session', id: item.sessionId, highlight: m })} />
          </Sheet>
        ) : null;
      })()}
      {sheet?.kind === 'practice' && (
        <Sheet title="Practice Range" onClose={back} back={backLabel} waiting={unseenAsk}>
          <PracticeRange creds={creds} state={state} attemptId={sheet.id} sessionId={sheet.sessionId} onStart={id => replaceTop({ kind: 'practice', id, sessionId: sheet.sessionId })} />
        </Sheet>
      )}
      {sheet?.kind === 'session' && (
        <Sheet title="Session" onClose={back} back={backLabel} waiting={unseenAsk}>
          <SessionSummary creds={creds} state={state} sessionId={sheet.id} highlight={sheet.highlight} onOpen={id => open({ kind: 'content', id })} onPractice={sid => open({ kind: 'practice', id: null, sessionId: sid })} onSource={m => open({ kind: 'session', id: sheet.id, highlight: m })} />
        </Sheet>
      )}
    </div>
  );
}

/** Answer in writing when speaking is not possible; it is stored and shown as typed. */
function TypeInstead({ onSend, onActive }: { onSend: (text: string) => Promise<boolean>; onActive: (active: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const active = open && (focused || sending || text.trim().length > 0);
  useEffect(() => { onActive(active); }, [active]);
  if (!open) return <button className="linklike" onClick={() => setOpen(true)}>Can’t talk right now? Type instead</button>;
  const send = async () => {
    setSending(true);
    const ok = await onSend(text.trim());
    setSending(false);
    if (ok) { setText(''); setOpen(false); }
  };
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); void send(); }}>
      <label className="faint" htmlFor="typed-answer">Your answer, in your own words. It is marked as typed. Only the text is sent.</label>
      <textarea id="typed-answer" rows={2} maxLength={600} value={text} onChange={e => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <div className="row"><button className="btn" type="submit" disabled={sending || text.trim().length < 2}>{sending ? 'Sending…' : 'Send answer'}</button><button className="btn ghost" type="button" onClick={() => { setText(''); setOpen(false); }}>Cancel</button></div>
    </form>
  );
}

/**
 * The answer controls for one question. Keyed by the question's moment id, so a recording or a
 * draft always belongs to the question it was started for and can never be sent to a newer one.
 */
function Answer({ creds, momentId, act, onAnswering }: { creds: Creds; momentId: string; act: (fn: () => Promise<unknown>) => Promise<void>; onAnswering: (id: string, active: boolean) => void }) {
  const [voice, setVoice] = useState(false);
  const [typed, setTyped] = useState(false);
  useEffect(() => { onAnswering(momentId, voice || typed); }, [voice, typed]);
  useEffect(() => () => onAnswering(momentId, false), []);
  const path = `/moments/${momentId}/respond`;
  return (
    <>
      <div className="actions">
        <VoiceButton label="Answer" onActive={setVoice} onWav={wav => postBinary(creds, path, wav, 'audio/wav')} />
        <button className="btn" disabled={voice} onClick={() => act(() => post(creds, path, { kind: 'later' }))}>Later</button>
      </div>
      {voice && <p className="faint">Your recording is turned into text; the audio itself is not kept.</p>}
      <TypeInstead onActive={setTyped} onSend={async text => { let ok = false; await act(async () => { await post(creds, path, { kind: 'typed-answer', text }); ok = true; }); return ok; }} />
    </>
  );
}

function NowCard({ creds, state, session, moments, asking, resolvedBy, pulse, answering, waiting, onAnswering, camera, onReadAgain, onOpen, onPractice, act }: { creds: Creds; state: Snapshot; session: Session | null; moments: Moment[]; asking: Moment | null; resolvedBy: Moment | null; pulse: boolean; answering: boolean; waiting: boolean; onAnswering: (id: string, active: boolean) => void; camera?: CameraInfo; onReadAgain?: (text: string) => void; onOpen: (id: string) => void; onPractice: (sessionId: string) => void; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const last = moments[moments.length - 1];

  if (session?.status === 'ended') return <WrapCard creds={creds} state={state} session={session} onOpen={onOpen} onPractice={onPractice} />;

  // Status first (unless a question is open): three unreadable frames in a row (any unreadable photo),
  // or a model/network failure. Fewer unreadable camera frames are retried quietly and change nothing here.
  const openQuestion = !!asking && !asking.response && !resolvedBy;
  const lastFrame = [...moments].reverse().find(m => m.frame && !m.misread);
  if (!openQuestion && lastFrame?.readingStatus === 'illegible' && lastFrame === [...moments].reverse().find(m => !m.misread) && (illegibleRun(moments) >= 3 || camera?.mode !== 'camera')) {
    return (
      <section className="now">
        <div className="eyebrow">Now · Can’t read the screen</div>
        <p className="message" style={{ fontSize: '1.3rem' }}>Tilt me a little, or take one photo.</p>
        {camera && <label className="btn small">📷 Take one photo<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; if (f) camera.onPhoto(f); e.target.value = ''; }} /></label>}
      </section>
    );
  }
  if (!openQuestion && connectionTrouble(last)) {
    // A model or network failure never becomes an empty card and never stops the person's work.
    return (
      <section className="now">
        <div className="eyebrow">Now · Paused</div>
        <p className="message" style={{ fontSize: '1.3rem' }}>Caddie paused — connection.</p>
        <p className="muted" role="status">Can’t reach the Caddie’s AI right now. Keep working; it tries again when your screen changes.</p>
        <p className="faint">Details: {last.readingStatus === 'error' ? last.readingError : last.decision?.reason}</p>
      </section>
    );
  }

  const lastChange = [...moments].reverse().find(m => m.change && !m.misread);
  // SAM pointers belong to the request currently on screen (they arrive a moment after the decision).
  const latestOk = [...moments].reverse().find(m => m.frame && m.readingStatus === 'ok' && !m.misread);
  const pointed = [...moments].reverse().find(m => m.pointers?.length && !m.misread);
  const pointer = pointed && latestOk && pointed.reading?.userRequest === latestOk.reading?.userRequest ? <PointerFrame creds={creds} moment={pointed} /> : null;
  if (!answering && lastChange && (!asking || lastChange.index > asking.index) && lastChange === [...moments].reverse().find(m => m.readingStatus === 'ok' && !m.misread)) {
    return (
      <section className="now" aria-live="polite">
        <div className="row"><span className="eyebrow grow">Now · Seen</span><span className="faint">{clock(lastChange.at)}</span></div>
        <p className="message" style={{ fontSize: '1.3rem' }}>{changeText(lastChange)}</p>
        {lastChange.reading?.userRequest && <p className="quote">{lastChange.reading.userRequest}</p>}
        <div className="row"><AssistLabel value={lastChange.change!.assistance} /></div>
        {pointer}
        {lastChange.decision?.note && <p className="faint">{lastChange.decision.note}</p>}
      </section>
    );
  }

  if (asking && !asking.response && !resolvedBy) {
    const d = asking.decision!;
    return (
      <section className={`now asking ${pulse ? 'pulse' : ''}`} aria-live="polite">
        <div className="row"><span className="eyebrow grow">Now · {d.step === 'example' ? 'An example' : d.step === 'ingredients' ? 'What’s missing' : 'A question'}</span><span className="faint">{clock(d.decidedAt)}</span></div>
        {d.quote && !(d.message ?? '').toLowerCase().includes(d.quote.toLowerCase()) && <p><span className="faint">You wrote</span> <span className="quote">{d.quote}</span></p>}
        <p className="message">{d.message}</p>
        {/* The question step asks one question only; the list of missing details is the next ladder step. */}
        {d.step !== 'question' && d.missingIngredients.length > 0 && <div className="row wrap">{d.missingIngredients.map(k => <span key={k} className="tag">{INGREDIENT_TEXT[k]}</span>)}</div>}
        {d.exampleBrief && (
          <div className="card soft stack">
            <div className="eyebrow">Example brief · AI-written</div>
            <p>{d.exampleBrief}</p>
            <button className="btn small" onClick={() => act(() => post(creds, '/inbox', { kind: 'example-brief', text: d.exampleBrief, refId: asking.id }))}>Send to PC</button>
            <p className="faint">If you use it as is, it counts as “AI wrote it”.</p>
          </div>
        )}
        <Answer key={asking.id} creds={creds} momentId={asking.id} act={act} onAnswering={onAnswering} />
        {waiting && <p className="faint" role="status">The Caddie has a newer question. It will show after you send or cancel this answer.</p>}
        <div className="row wrap" style={{ gap: 16 }}>
          {d.step === 'ingredients' && <button className="linklike" onClick={() => act(() => post(creds, `/moments/${asking.id}/respond`, { kind: 'asked-example' }))}>Show me an example</button>}
          <button className="linklike" onClick={() => act(() => post(creds, `/moments/${asking.id}/respond`, { kind: 'misread' }))}>Misread: that’s not what I wrote</button>
          {onReadAgain && d.message && <button className="linklike" onClick={() => onReadAgain(d.message!)}>🔈 Read it again</button>}
        </div>
        <p className="faint">Why: {d.reason}</p>
      </section>
    );
  }
  if ((asking?.response?.kind === 'voice-answer' || asking?.response?.kind === 'typed-answer') && !moments.some(m => m.index > asking.index && m.frame === null)) {
    return <section className="now"><div className="eyebrow">{asking.response.kind === 'typed-answer' ? 'You wrote' : 'You said'}</div><p className="quote">{asking.response.transcript}</p><p className="faint" role="status">The Caddie is considering your answer…</p></section>;
  }
  if (!last) {
    return <section className="now"><div className="eyebrow">Now</div><p className="message">Work as usual.</p><p className="muted">The Caddie watches your screen and speaks up only when it helps. It never interrupts while you type.</p></section>;
  }
  if (last.readingStatus === 'pending') return <section className="now"><div className="eyebrow">Now</div><p className="muted" role="status">Reading your screen…</p></section>;
  if (last.readingStatus === 'illegible') return <section className="now"><div className="eyebrow">Now</div><p className="muted" role="status">Reading your screen…</p></section>;
  if (last.readingStatus !== 'ok') {
    return <section className="now"><div className="eyebrow">Now · Status</div><p className="muted" role="status">{momentLine(last).text}</p></section>;
  }
  const quiet = [...moments].reverse().find(m => m.decision?.note) ?? last;
  return (
    <section className="now">
      <div className="row"><span className="eyebrow grow">Now · Quiet</span><span className="faint">{clock(quiet.at)}</span></div>
      <p className="message" style={{ fontSize: '1.2rem' }}>{quiet.decision?.note ?? 'Watching.'}</p>
      {pointer}
      {quiet.decision?.reason && <p className="faint">Why quiet: {quiet.decision.reason}</p>}
    </section>
  );
}

function WrapCard({ creds, state, session, onOpen, onPractice }: { creds: Creds; state: Snapshot; session: Session; onOpen: (id: string) => void; onPractice: (sessionId: string) => void }) {
  const items = state.content.filter(c => c.sessionId === session.id).sort(byFormat);
  const note = items.find(c => c.format === 'note' && c.status === 'ready');
  const card = state.cards.find(c => c.sessionId === session.id && c.status === 'proposed');
  return (
    <section className="now">
      <div className="eyebrow">Session wrap</div>
      {session.wrapStatus === 'none' || session.wrapStatus === 'planning' ? <p className="muted" role="status">The Caddie is deciding what’s worth making from this session…</p> : null}
      {session.wrapStatus === 'failed' && <div className="notice warn" role="alert">The wrap-up couldn’t be planned. <button className="btn small" onClick={() => post(creds, `/sessions/${session.id}/wrap`)}>Retry</button></div>}
      {session.design && <p className="message" style={{ fontSize: '1.2rem' }}>{session.design.habit}</p>}
      {note && <div className="card soft"><NoteView item={note} state={state} /></div>}
      {card && <CardControls card={card} creds={creds} compact state={state} />}
      {session.design && <button className="btn" onClick={() => onPractice(session.id)}>Practice this in the Practice Range</button>}
      {items.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {items.map(i => (
            <button key={i.id} className="btn" style={{ justifyContent: 'space-between' }} onClick={() => onOpen(i.id)} disabled={i.status === 'skipped' && !i.payload ? false : false}>
              <span>{FORMAT_NAME[i.format]}</span><span className="faint">{i.status === 'ready' ? (Date.parse(i.arriveAt) > Date.now() ? `arrives ${clock(i.arriveAt)}` : 'ready') : i.status === 'skipped' ? 'not made' : i.status}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Flow({ state, session, moments, onOpen }: { state: Snapshot; session: Session | null; moments: Moment[]; onOpen: (id: string) => void }) {
  if (!session) return null;
  type Item = { at: string; key: string; node: ReactNode };
  const items: Item[] = [];
  for (const m of moments) {
    const l = momentLine(m);
    items.push({
      at: m.at, key: m.id,
      node: (
        <div className={`flow-item ${m.misread ? 'misread' : ''}`}>
          <time dateTime={m.at}>{clock(m.at)}</time>
          <div className="stack" style={{ gap: 4 }}>
            <span>{m.reading?.userRequest && l.kind !== 'status' ? <><span className="quote">{m.reading.userRequest}</span> · </> : null}{l.text}</span>
            <span className="row wrap">{m.change && <AssistLabel value={m.change.assistance} />}{(m.response?.kind === 'voice-answer' || m.response?.kind === 'typed-answer') && <span className="faint">You {m.response.kind === 'typed-answer' ? 'wrote' : 'answered'}: “{m.response.transcript}”</span>}{m.response?.kind === 'later' && <span className="faint">Later</span>}{m.misread && <span className="faint">Marked as misread</span>}</span>
          </div>
        </div>
      ),
    });
  }
  for (const c of state.content.filter(x => x.sessionId === session.id && x.status !== 'skipped')) {
    const future = Date.parse(c.arriveAt) > Date.now();
    items.push({ at: c.status === 'ready' && !future ? c.updatedAt : c.arriveAt, key: c.id, node: <ContentRow item={c} future={future} onOpen={onOpen} /> });
  }
  for (const p of state.practice.filter(x => x.status === 'done' && x.sessionId === session.id)) {
    items.push({ at: p.startedAt, key: p.id, node: <div className="flow-item"><time>{clock(p.startedAt)}</time><span>Practice: {p.checkNote} {p.assistance && <AssistLabel value={p.assistance} extra="practice" />}</span></div> });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section aria-label="This session" className="flow">
      <div className="eyebrow">This session</div>
      {items.length ? items.map(i => <div key={i.key}>{i.node}</div>) : <p className="faint">Nothing yet.</p>}
    </section>
  );
}

function ContentRow({ item, future, onOpen }: { item: ContentItem; future: boolean; onOpen: (id: string) => void }) {
  return (
    <div className="flow-item">
      <time dateTime={item.arriveAt}>{clock(future ? item.arriveAt : item.updatedAt)}</time>
      <div className="row wrap">
        <span className="grow">{future ? 'Coming up' : FORMAT_NAME[item.format]}{future ? `: ${FORMAT_NAME[item.format]}` : item.status === 'ready' ? ' ready' : item.status === 'failed' ? ' failed' : ' in progress'} <span className="faint">— {item.requestedByUser ? 'you asked for it' : item.whyNow}</span></span>
        <button className="btn small" onClick={() => onOpen(item.id)}>{future ? 'Open now' : 'Open'}</button>
      </div>
    </div>
  );
}

const DIMS: { key: SkillDimension; name: string; about: string }[] = [
  { key: 'description', name: 'Description', about: 'Giving your AI the specifics it needs' },
  { key: 'delegation', name: 'Delegation', about: 'Deciding what your AI should ask or do' },
  { key: 'discernment', name: 'Discernment', about: 'Catching mistakes in what the AI gave back — seen when your own request tells the AI to fix a wrong or made-up detail' },
  { key: 'diligence', name: 'Diligence', about: 'Keeping made-up details out — seen when your own request tells the AI not to invent anything' },
];

export function Habits({ state }: { state: Snapshot }) {
  return (
    <section className="stack">
      <h3>Your habits</h3>
      <p className="faint">Observations only — no levels or scores. “Not seen yet” shows only that it has not come up in your own requests; it never means you can’t.</p>
      {DIMS.map(d => {
        const obs = state.skills.filter(s => s.dimension === d.key).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
        return (
          <div key={d.key} className="stack" style={{ gap: 4 }}>
            <div className="row"><strong className="grow">{d.name}</strong>{!obs.length && <AssistLabel value="unobserved" />}</div>
            <span className="faint">{d.about}</span>
            {obs.map(o => <div key={o.id} className="row wrap"><AssistLabel value={o.assistance} extra={o.strength ?? undefined} /><span className="faint">{o.note} · {clock(o.at)}{o.fixture ? ' · sample' : ''}</span></div>)}
          </div>
        );
      })}
    </section>
  );
}

function Playbook({ creds, state }: { creds: Creds; state: Snapshot }) {
  const cards = state.cards.filter(c => c.status !== 'rejected');
  return (
    <section className="stack">
      <h3>My playbook</h3>
      {cards.length ? cards.map(c => <CardControls key={c.id} card={c} creds={creds} compact />) : <Empty>No Caddie cards yet. They come from sessions where the Caddie had to step in.</Empty>}
    </section>
  );
}

function Privacy({ creds, state, session }: { creds: Creds; state: Snapshot; session: Session | null }) {
  const [busy, setBusy] = useState(false);
  const kept = session ? state.moments.filter(m => m.work.sessionId === session.id && m.frame?.storedKey) : [];
  return (
    <section className="stack">
      <h3>Privacy</h3>
      <p className="faint">Only the boxed screen area is sent. Frames are read, then discarded unless they are evidence for a moment. You can delete kept frames at any time.</p>
      <p className="faint">{PROVIDER_DATA_NOTICE}</p>
      <DataTable />
      {session && <button className="btn" disabled={busy || !kept.length} onClick={async () => { setBusy(true); try { for (const m of kept) await api(creds, `/frames/${m.frame!.id}`, { method: 'DELETE' }); } finally { setBusy(false); } }}>Delete {kept.length} kept frame{kept.length === 1 ? '' : 's'} from this session</button>}
      {session && <button className="btn ghost" disabled={busy} onClick={async () => { if (!confirm('Delete this session, its frames and its content?')) return; setBusy(true); try { await api(creds, `/sessions/${session.id}`, { method: 'DELETE' }); } finally { setBusy(false); } }}>Delete this session</button>}
    </section>
  );
}

function SessionSummary({ creds, state, sessionId, highlight, onOpen, onPractice, onSource }: { creds: Creds; state: Snapshot; sessionId: string; highlight?: string; onOpen: (id: string) => void; onPractice: (sessionId: string) => void; onSource: (momentId: string) => void }) {
  const s = state.sessions.find(x => x.id === sessionId);
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => { mark.current?.scrollIntoView({ block: 'center' }); }, [highlight]);
  if (!s) return <Empty>This session was deleted.</Empty>;
  const ms = sessionMoments(state, s.id);
  const cards = state.cards.filter(c => c.sessionId === s.id);
  return (
    <div className="stack">
      <p className="faint">{s.tool ?? 'Unknown tool'} · {new Date(s.startedAt).toLocaleString('en-US')}{s.fixture ? ' · sample data' : ''}</p>
      {ms.map(m => (
        <div key={m.id} ref={m.id === highlight ? mark : undefined} className={`flow-item ${m.misread ? 'misread' : ''} ${m.id === highlight ? 'source' : ''}`} aria-current={m.id === highlight ? 'true' : undefined}>
          <time>{clock(m.at)}</time>
          <span className="stack" style={{ gap: 6 }}>
            <span>{momentLine(m).text} {m.change && <AssistLabel value={m.change.assistance} />}</span>
            {/* The source moment shows its actual frame when one was kept. */}
            {m.id === highlight && m.frame && (m.frame.storedKey ? <MediaImage creds={creds} k={m.frame.storedKey} alt={`Your screen at ${clock(m.at)}`} /> : <span className="faint">The frame of this moment was deleted.</span>)}
          </span>
        </div>
      ))}
      {state.content.filter(c => c.sessionId === s.id).sort(byFormat).map(c => <button key={c.id} className="btn" onClick={() => onOpen(c.id)}>{FORMAT_NAME[c.format]} · {c.status}</button>)}
      {cards.map(c => <CardControls key={c.id} card={c} creds={creds} compact state={state} onSource={onSource} />)}
      {s.design && <button className="btn" onClick={() => onPractice(s.id)}>Practice this in the Practice Range</button>}
      {s.status === 'ended' && s.wrapStatus !== 'planned' && <button className="btn" onClick={() => post(creds, `/sessions/${s.id}/wrap`)}>Wrap up this session</button>}
    </div>
  );
}
