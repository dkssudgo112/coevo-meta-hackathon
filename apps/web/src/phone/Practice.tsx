import { useState } from 'react';
import type { PracticeAttempt, Snapshot } from '../../../../packages/contracts/index.ts';
import { INGREDIENT_KEYS } from '../../../../packages/contracts/index.ts';
import { post, postBinary, type Creds } from '../lib/api.ts';
import { AssistLabel, errorText, FixtureTag, INGREDIENT_TEXT, MediaImage } from '../ui/common.tsx';
import { VoiceButton } from './Voice.tsx';

/** The drill's own scope: attempts opened during a session belong to it; others stand alone. */
export function PracticeRange({ creds, state, attemptId, sessionId, onStart, onOpen }: { creds: Creds; state: Snapshot; attemptId: string | null; sessionId: string | null; onStart: (id: string) => void; onOpen?: (id: string) => void }) {
  const p: PracticeAttempt | undefined = attemptId ? state.practice.find(x => x.id === attemptId) : undefined;
  const [err, setErr] = useState('');
  const [confirmHint, setConfirmHint] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  // Every button reports a failed request instead of failing silently.
  const act = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(errorText(e)); } };

  const start = () => act(async () => onStart((await post<PracticeAttempt>(creds, '/practice', { autoOpened: false, sessionId })).id));
  const recent = state.practice.filter(x => x.status === 'done' && x.sessionId === sessionId).slice(-5).reverse();

  if (!p) {
    return (
      <div className="stack">
        <p className="muted">A 30-second drill: a new request arrives, you brief the AI out loud, and Muse Image draws what your words produce.</p>
        <p className="faint">{sessionId ? 'Attempts here belong to this session.' : 'Attempts here stand on their own, outside any session.'}</p>
        <button className="btn primary" onClick={start}>Give me a request</button>
        {err && <p className="faint" role="alert">{err}</p>}
        {recent.length > 0 && (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }} aria-label="Earlier attempts">
            {recent.map(x => <li key={x.id}><button className="btn" style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }} onClick={() => (onOpen ?? onStart)(x.id)} aria-label={`Open earlier attempt: ${x.checkNote ?? 'practice attempt'}`}><span className="row wrap" style={{ width: '100%' }}><span className="grow">{x.checkNote}</span>{x.assistance && <AssistLabel value={x.assistance} extra="practice" />}{x.fixture && <FixtureTag />}{x.briefSource === 'typed' && <span className="faint">typed</span>}</span></button></li>)}
          </ul>
        )}
      </div>
    );
  }
  if (p.status === 'scenario') return <p className="faint" role="status">Writing a practice request…</p>;
  if (p.status === 'failed' && !p.scenario) return <div className="notice warn" role="alert">{p.error} <button className="btn small" onClick={start}>Try again</button>{err && <span className="faint"> {err}</span>}</div>;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="eyebrow">Practice request</div>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem' }}>{p.scenario}</p>
        {p.hintViewed ? <p className="faint">Hint: {p.hint}</p> : confirmHint ? (
          <div className="notice">Seeing the hint marks this attempt as “With the Caddie”. <button className="btn small" onClick={() => act(() => post(creds, `/practice/${p.id}/hint`))}>Show hint</button> <button className="btn ghost small" onClick={() => setConfirmHint(false)}>Keep going without it</button></div>
        ) : p.status === 'open' && <button className="linklike" onClick={() => setConfirmHint(true)}>Hint</button>}
      </div>
      {(p.status === 'open' || p.status === 'failed') && (
        <>
          <VoiceButton label="Brief the AI out loud" maxSeconds={30} onWav={wav => postBinary(creds, `/practice/${p.id}/attempt`, wav, 'audio/wav')} />
          {typing ? (
            <form className="stack" onSubmit={e => { e.preventDefault(); void act(() => post(creds, `/practice/${p.id}/attempt`, { text: typed })); }}>
              <label className="faint" htmlFor="typed-brief">Type the brief instead. It is marked as typed, not spoken.</label>
              <textarea id="typed-brief" rows={3} maxLength={600} value={typed} onChange={e => setTyped(e.target.value)} />
              <div className="row"><button className="btn" type="submit" disabled={typed.trim().length < 3}>Send the typed brief</button><button className="btn ghost" type="button" onClick={() => setTyping(false)}>Back to speaking</button></div>
            </form>
          ) : <button className="linklike" onClick={() => setTyping(true)}>Can’t speak right now? Type it</button>}
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
          <div className="row wrap">{p.assistance && <AssistLabel value={p.assistance} extra="practice" />}{p.fixture ? <FixtureTag /> : p.fixture === null ? <span className="faint">Origin not recorded</span> : null}{p.autoOpened && <span className="faint">Opened by the Caddie</span>}</div>
          {p.fixture && <p className="faint">Sample: a scripted practice brief, not a real person’s attempt. The scenario, transcript, image and check are {p.provenance === 'fixture' ? 'from the test model' : 'real model output'}.</p>}
          <button className="btn" onClick={start}>Another request</button>
        </div>
      )}
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}
