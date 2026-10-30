import { useEffect, useRef, useState } from 'react';
import type { CaddieCard, ContentItem, FlashcardsPayload, ManualPayload, NotePayload, PodcastPayload, ShortPayload, Snapshot } from '../../../../packages/contracts/index.ts';
import { post, postBinary, type Creds } from '../lib/api.ts';
import { useMedia } from '../lib/media.ts';
import { VoiceButton } from '../phone/Voice.tsx';
import { clock, errorText } from './common.tsx';

export const FORMAT_NAME: Record<ContentItem['format'], string> = {
  note: 'Note', manual: 'My playbook', flashcards: 'Flashcards', podcast: 'Podcast', short: 'Short',
};

function momentTime(state: Snapshot, momentId: string | null): string | null {
  const m = momentId ? state.moments.find(x => x.id === momentId) : null;
  return m ? clock(m.at) : null;
}

export function StatusLine({ item, creds }: { item: ContentItem; creds: Creds }) {
  const [busy, setBusy] = useState(false);
  if (item.status === 'generating' || item.status === 'queued') return <p className="faint" role="status">{item.status === 'queued' ? 'Queued' : 'Making it now…'}</p>;
  if (item.status === 'failed' || item.status === 'skipped') {
    return (
      <div className={item.status === 'failed' ? 'notice warn' : 'notice'} role={item.status === 'failed' ? 'alert' : undefined}>
        <div className="row wrap">
          <span className="grow">{item.status === 'failed' ? item.error : `Not made: ${item.whyNow}`}</span>
          <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); try { await post(creds, `/content/${item.id}/retry`); } finally { setBusy(false); } }}>
            {item.status === 'failed' ? 'Retry' : 'Make it anyway'}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

export function NoteView({ item, state }: { item: ContentItem; state: Snapshot }) {
  const p = item.payload as NotePayload | null;
  if (!p) return null;
  return (
    <article className="stack">
      <h3>{p.title}</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p>
      {p.quotes.map((q, i) => (
        <p key={i}><span className="quote">{q.text}</span> {momentTime(state, q.momentId) && <span className="faint">· seen at {momentTime(state, q.momentId)}</span>}</p>
      ))}
      {p.remaining.length > 0 && (<div><div className="eyebrow">Still open</div><ul>{p.remaining.map((r, i) => <li key={i}>{r}</li>)}</ul></div>)}
    </article>
  );
}

export function CardControls({ card, creds, compact }: { card: CaddieCard; creds: Creds; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.text);
  const [err, setErr] = useState('');
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setErr('');
    try { await post(creds, `/cards/${card.id}/action`, { action, ...body }); setEditing(false); } catch (e) { setErr(errorText(e)); }
  };
  const statusText: Record<CaddieCard['status'], string> = {
    proposed: 'Proposed by the Caddie', approved: 'Approved — not applied yet', applied: 'Applied to your AI',
    'observed-working': 'Seen working: your AI asked first', rejected: 'Rejected', revoked: 'Turned off',
  };
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row"><span className="eyebrow grow">Caddie card · for {card.targetTool}</span><span className="faint">{statusText[card.status]}</span></div>
      {editing ? (
        <>
          <label className="sr-only" htmlFor={`card-${card.id}`}>Rule text</label>
          <textarea id={`card-${card.id}`} rows={3} value={text} onChange={e => setText(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)' }} />
          <div className="row"><button className="btn primary small" onClick={() => act('edit', { text })}>Save</button><button className="btn small" onClick={() => { setText(card.text); setEditing(false); }}>Cancel</button></div>
        </>
      ) : (
        <p style={{ fontFamily: 'var(--serif)', fontSize: compact ? '1rem' : '1.1rem' }}>{card.text}</p>
      )}
      {!editing && (
        <div className="row wrap">
          {card.status === 'proposed' && <><button className="btn primary small" onClick={() => act('approve')}>Approve</button><button className="btn small" onClick={() => setEditing(true)}>Edit</button><button className="btn ghost small" onClick={() => act('reject')}>Reject</button></>}
          {card.status === 'approved' && <><button className="btn small" onClick={() => setEditing(true)}>Edit</button><button className="btn ghost small" onClick={() => act('revoke')}>Turn off</button></>}
          {(card.status === 'applied' || card.status === 'observed-working') && <button className="btn ghost small" onClick={() => act('revoke')}>Turn off</button>}
        </div>
      )}
      {card.history.length > 1 && <p className="faint">{card.history.map(h => `${h.status} ${clock(h.at)}`).join(' → ')}</p>}
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}

export function ManualView({ item, state, creds }: { item: ContentItem; state: Snapshot; creds: Creds }) {
  const p = item.payload as ManualPayload | null;
  if (!p) return null;
  const card = state.cards.find(c => c.sessionId === item.sessionId && c.status !== 'rejected');
  return (
    <article className="stack">
      <h3>{p.title}</h3>
      <p className="muted"><strong>Use when:</strong> {p.whenToUse}<br /><strong>Skip when:</strong> {p.whenNotToUse}</p>
      <ol className="stack" style={{ paddingLeft: 20, gap: 8 }}>
        {p.steps.map((s, i) => <li key={i}><span className="tag">{s.owner === 'ai' ? 'For your AI' : 'You decide'}</span> {s.text} <span className="faint">— checks: {s.check}</span></li>)}
      </ol>
      {p.pitfalls.length > 0 && <div><div className="eyebrow">Pitfalls from this session</div><ul>{p.pitfalls.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      <div className="row wrap" style={{ alignItems: 'start', gap: 16 }}>
        <div className="grow"><div className="eyebrow">For your AI</div><ul>{p.forYourAI.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div className="grow"><div className="eyebrow">You decide</div><ul>{p.youDecide.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      {card && <CardControls card={card} creds={creds} />}
    </article>
  );
}

export function FlashcardsView({ item, creds }: { item: ContentItem; creds: Creds }) {
  const p = item.payload as FlashcardsPayload | null;
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  if (!p) return null;
  const c = p.cards[Math.min(i, p.cards.length - 1)];
  const review = async (result: 'applied' | 'unsure') => {
    await post(creds, `/content/${item.id}/review`, { cardId: c.id, result });
    setShown(false);
    setI(x => (x + 1) % p.cards.length);
  };
  return (
    <article className="stack">
      <div className="faint">Card {i + 1} of {p.cards.length} · next due {new Date(c.dueAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <div className="card flash">
        <p>{c.scenario}</p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>{c.prompt}</p>
        {shown ? <p className="muted" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>{c.answer}</p> : <button className="btn" onClick={() => setShown(true)}>Show the answer</button>}
      </div>
      {shown && <div className="row"><button className="btn primary grow" onClick={() => review('applied')}>I’d do this</button><button className="btn grow" onClick={() => review('unsure')}>Not sure yet</button></div>}
      <p className="faint">“I’d do this” brings the card back in 1, 3, 7, then 14 days. “Not sure yet” brings it back in 10 minutes. Self-ratings are not counted as evidence.</p>
    </article>
  );
}

export function PodcastView({ item, creds }: { item: ContentItem; creds: Creds }) {
  const p = item.payload as PodcastPayload | null;
  const { url } = useMedia(creds, p?.audioKey);
  const audio = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [asking, setAsking] = useState<{ wasPlaying: boolean; at: number } | null>(null);
  const [answer, setAnswer] = useState<{ question: string; answer: string } | null>(null);
  const [err, setErr] = useState('');
  if (!p) return null;
  const timed = p.lines.some(l => l.end > 0);
  const current = timed ? p.lines.findIndex(l => t >= l.start && t < l.end) : -1;

  const startAsk = () => {
    const a = audio.current;
    const wasPlaying = Boolean(a && !a.paused);
    a?.pause();
    setAnswer(null);
    setErr('');
    setAsking({ wasPlaying, at: a?.currentTime ?? 0 });
  };
  const resume = () => {
    const a = audio.current;
    if (a && asking) { a.currentTime = asking.at; if (asking.wasPlaying) void a.play(); }
    setAsking(null);
  };
  return (
    <article className="stack">
      <h3>{p.title}</h3>
      <p className="faint">Caddie and {p.speakers.guest} · {p.durationSec ? `${Math.round(p.durationSec)} s` : `${p.words} words`}</p>
      {url ? <audio ref={audio} controls src={url} onTimeUpdate={e => setT(e.currentTarget.currentTime)} style={{ width: '100%' }} /> : item.status === 'ready' ? null : <div className="notice">Audio isn’t ready. The full transcript is below.</div>}
      {asking ? (
        <div className="card stack">
          <div className="eyebrow">Ask about this part</div>
          {!answer && <VoiceButton label="Ask your question" onWav={async wav => {
            try { setAnswer(await postBinary(creds, `/content/${item.id}/ask?at=${Math.round(asking.at)}`, wav, 'audio/wav')); } catch (e) { setErr(errorText(e)); }
          }} />}
          {answer && <><p className="faint">You asked: “{answer.question}”</p><p>{answer.answer}</p></>}
          {err && <p className="faint" role="alert">{err}</p>}
          <button className="btn" onClick={resume}>Return to listening</button>
        </div>
      ) : (
        <button className="btn" onClick={startAsk}>Ask about this part</button>
      )}
      <div className="stack" style={{ gap: 4 }} aria-label="Transcript">
        {p.lines.map((l, i) => (
          <div key={i} className={`line ${i === current ? 'current' : ''}`}>
            <div className="who">{l.speaker === 'caddie' ? 'Caddie' : p.speakers.guest}</div>
            <div>{l.text}</div>
          </div>
        ))}
      </div>
      {p.asks.length > 0 && <div><div className="eyebrow">Your questions</div>{p.asks.map((a, i) => <p key={i} className="muted">Q: {a.question}<br />A: {a.answer}</p>)}</div>}
    </article>
  );
}

export function ShortView({ item, creds, state }: { item: ContentItem; creds: Creds; state: Snapshot }) {
  const p = item.payload as ShortPayload | null;
  const { url } = useMedia(creds, p?.videoKey);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { video.current?.load(); }, [url]);
  if (!p) return null;
  return (
    <article className="stack">
      <h3>{p.title}</h3>
      {url ? (
        <div className="short-frame">
          <video ref={video} src={url} playsInline controls onClick={e => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())} />
        </div>
      ) : (
        <div className="notice">{item.status === 'generating' ? 'Rendering the video…' : 'The video isn’t available. Here is the storyboard.'}</div>
      )}
      <ol className="stack" style={{ paddingLeft: 20, gap: 6 }}>
        {p.scenes.map((s, i) => (
          <li key={i}><span className="tag">{s.role}</span> {s.narration}{s.evidence && <span className="faint"> · {s.evidence === 'before' ? 'your earlier screen' : 'your later screen'}{s.evidenceFrameId && !state.moments.some(m => m.frame?.id === s.evidenceFrameId && m.frame.storedKey) ? ' (frame deleted)' : ''}</span>}</li>
        ))}
      </ol>
    </article>
  );
}

export function ContentBody({ item, state, creds }: { item: ContentItem; state: Snapshot; creds: Creds }) {
  return (
    <div className="stack">
      <p className="faint"><strong>Why now:</strong> {item.whyNow}</p>
      <StatusLine item={item} creds={creds} />
      {item.format === 'note' && <NoteView item={item} state={state} />}
      {item.format === 'manual' && <ManualView item={item} state={state} creds={creds} />}
      {item.format === 'flashcards' && <FlashcardsView item={item} creds={creds} />}
      {item.format === 'podcast' && <PodcastView item={item} creds={creds} />}
      {item.format === 'short' && <ShortView item={item} creds={creds} state={state} />}
    </div>
  );
}
