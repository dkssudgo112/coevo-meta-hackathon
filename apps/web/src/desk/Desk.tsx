import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { InboxItem, Moment, Snapshot } from '../../../../packages/contracts/index.ts';
import { api, createWorkspace, loadCreds, pairLink, post, saveCreds, type Creds } from '../lib/api.ts';
import { useWorkspace } from '../lib/store.ts';
import { FrameSampler, FULL, uploadFrame } from '../lib/capture.ts';
import { AssistLabel, changeText, clock, Empty, errorText, Flag, FixtureTag, latestSession, MediaImage, modelSourceLine, sessionMoments } from '../ui/common.tsx';
import { byFormat, CardControls, ContentBody, FORMAT_NAME } from '../ui/Players.tsx';
import { Habits } from '../phone/Live.tsx';

const PAIR_KEY = 'coevo.deskPair';

interface PairInfo { secret: string; expiresAt: string }

function loadPair(): PairInfo | null {
  try { const r = localStorage.getItem(PAIR_KEY); return r ? (JSON.parse(r) as PairInfo) : null; } catch { return null; }
}
function savePair(p: PairInfo | null): void {
  try { if (p) localStorage.setItem(PAIR_KEY, JSON.stringify(p)); else localStorage.removeItem(PAIR_KEY); } catch { /* tab only */ }
}

export function QR({ text, label }: { text: string; label: string }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }, [text]);
  return <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function DeskApp() {
  const [creds, setCreds] = useState<Creds | null>(() => loadCreds('desk'));
  const [pair, setPair] = useState<PairInfo | null>(loadPair);
  const [err, setErr] = useState('');

  const fresh = async () => {
    setErr('');
    try {
      const w = await createWorkspace('user');
      const c: Creds = { workspaceId: w.workspaceId, token: w.deskToken, role: 'desk' };
      saveCreds(c, 'desk'); setCreds(c);
      const p = { secret: w.pairSecret, expiresAt: w.pairExpiresAt }; savePair(p); setPair(p);
    } catch (e) { setErr(errorText(e)); }
  };
  useEffect(() => { if (!creds) void fresh(); }, []);

  if (!creds) return <div className="desk"><p className="faint" role="status">{err || 'Opening your Desk…'}</p>{err && <button className="btn" onClick={fresh}>Try again</button>}</div>;
  return <DeskWorkspace creds={creds} pair={pair} setPair={p => { savePair(p); setPair(p); }} onReset={() => { saveCreds(null, 'desk'); savePair(null); setCreds(null); void fresh(); }} />;
}

function DeskWorkspace({ creds, pair, setPair, onReset }: { creds: Creds; pair: PairInfo | null; setPair: (p: PairInfo | null) => void; onReset: () => void }) {
  const [notices, setNotices] = useState<string[]>([]);
  const { state, conn } = useWorkspace(creds, n => setNotices(x => [...x.slice(-2), n.message]));
  const [selected, setSelected] = useState<string | null>(null);
  const session = state ? state.sessions.find(s => s.id === selected) ?? latestSession(state) : null;

  if (conn === 'unauthorized') return <div className="desk"><Empty>This Desk is no longer valid. <button className="btn small" onClick={onReset}>Start a new Desk</button></Empty></div>;
  if (!state) return <div className="desk"><p className="faint" role="status">Connecting…</p></div>;

  return (
    <div className="desk">
      <header className="desk-top">
        <Flag state={state.workspace.paired ? 'watching' : 'off'} />
        <div className="grow"><h2>Coevo Desk</h2><p className="faint">{state.workspace.paired ? 'Phone connected' : 'Waiting for your phone'} · {conn === 'live' ? 'live' : 'reconnecting…'} · {state.workspace.testFakeModels ? 'fake test model' : `live model calls ${state.workspace.liveCalls ? 'on' : 'off'}`}</p></div>
        <span className="faint">Spent today ${state.workspace.budget.spentUsd.toFixed(3)} / ${state.workspace.budget.capUsd.toFixed(2)}</span>
      </header>
      {(state.workspace.testFakeModels || !state.workspace.liveCalls) && <div className="notice warn" role="status">{modelSourceLine({ liveCallsEnabled: state.workspace.liveCalls, testFakeModels: state.workspace.testFakeModels })}</div>}
      {notices.map((n, i) => <div key={i} className="notice warn" role="status">{n}</div>)}
      <div className="desk-grid">
        <main className="stack-lg">
          {!state.workspace.paired && <PairPanel creds={creds} pair={pair} setPair={setPair} />}
          {state.sessions.length > 0 && (
            <div className="row wrap">
              <label className="faint" htmlFor="session-pick">Session</label>
              <select id="session-pick" value={session?.id ?? ''} onChange={e => setSelected(e.target.value)} style={{ minHeight: 40, borderRadius: 10, padding: '0 10px', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                {[...state.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(s => <option key={s.id} value={s.id}>{new Date(s.startedAt).toLocaleString('en-US')} · {s.task ?? 'session'}{s.fixture ? ' (sample)' : ''}</option>)}
              </select>
            </div>
          )}
          {session ? <SessionReview creds={creds} state={state} sessionId={session.id} /> : state.workspace.paired && <Empty>Your phone is connected. Start working with your AI tool — moments will appear here.</Empty>}
        </main>
        <aside className="stack-lg">
          <Inbox creds={creds} state={state} />
          <OtherCapture creds={creds} />
          <section className="card"><Habits state={state} /></section>
          {state.workspace.paired && <RepairLink creds={creds} setPair={setPair} />}
        </aside>
      </div>
    </div>
  );
}

function PairPanel({ creds, pair, setPair }: { creds: Creds; pair: PairInfo | null; setPair: (p: PairInfo | null) => void }) {
  const expired = !pair || Date.parse(pair.expiresAt) < Date.now();
  const [busy, setBusy] = useState(false);
  const renew = async () => {
    setBusy(true);
    try { const r = await post<{ pairSecret: string; pairExpiresAt: string }>(creds, '/repair'); setPair({ secret: r.pairSecret, expiresAt: r.pairExpiresAt }); } finally { setBusy(false); }
  };
  useEffect(() => { if (expired) void renew(); }, [expired]);
  return (
    <section className="card row wrap" style={{ gap: 24, alignItems: 'center' }}>
      {pair && !expired ? <QR text={pairLink(creds.workspaceId, pair.secret)} label="QR code to pair your phone" /> : <div className="qr" aria-busy="true" />}
      <div className="stack grow" style={{ minWidth: 240 }}>
        <h1>Point your phone here</h1>
        <p className="muted">Open <strong>{location.host}/caddie</strong> on your phone and aim it at this code, or scan it with the phone’s camera app. Then prop the phone beside your monitor.</p>
        <p className="faint">The code works once and expires in 15 minutes.</p>
        <button className="btn small" style={{ justifySelf: 'start' }} disabled={busy} onClick={renew}>Show a new code</button>
      </div>
    </section>
  );
}

function RepairLink({ creds, setPair }: { creds: Creds; setPair: (p: PairInfo | null) => void }) {
  const [p, setP] = useState<PairInfo | null>(null);
  return (
    <section className="card stack">
      <h3>Pair another phone</h3>
      {p ? <QR text={pairLink(creds.workspaceId, p.secret)} label="QR code to pair another phone" /> : <button className="btn small" onClick={async () => { const r = await post<{ pairSecret: string; pairExpiresAt: string }>(creds, '/repair'); const n = { secret: r.pairSecret, expiresAt: r.pairExpiresAt }; setP(n); setPair(n); }}>Show a pairing code</button>}
    </section>
  );
}

function Inbox({ creds, state }: { creds: Creds; state: Snapshot }) {
  const items = [...state.inbox].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className="card stack">
      <div className="row"><h3 className="grow">Sent from Caddie</h3><span className="faint">{items.length}</span></div>
      {!items.length && <p className="faint">Examples and Caddie cards you send from the phone land here, ready to copy.</p>}
      {items.slice(0, 6).map(i => <InboxRow key={i.id} creds={creds} state={state} item={i} />)}
    </section>
  );
}

function InboxRow({ creds, state, item }: { creds: Creds; state: Snapshot; item: InboxItem }) {
  const [copied, setCopied] = useState(false);
  const card = item.kind === 'caddie-card' ? state.cards.find(c => c.id === item.refId) : null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(item.text); } catch { /* fall back to manual selection */ }
    setCopied(true);
    void post(creds, `/inbox/${item.id}/copied`);
  };
  return (
    <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <div className="row"><span className="eyebrow grow">{item.kind === 'caddie-card' ? `Caddie card${card ? ` · ${card.targetTool}` : ''}` : item.kind === 'example-brief' ? 'Example brief · AI-written' : 'Note'}</span><span className="faint">{clock(item.at)}</span></div>
      <p style={{ userSelect: 'all', fontFamily: item.kind === 'caddie-card' ? 'var(--serif)' : undefined }}>{item.text}</p>
      {item.applyHint && <p className="faint">{item.applyHint}</p>}
      <div className="row wrap">
        <button className="btn small primary" onClick={copy}>{copied || item.copiedAt ? 'Copied' : 'Copy'}</button>
        {card?.status === 'approved' && <button className="btn small" onClick={() => post(creds, `/cards/${card.id}/action`, { action: 'applied' })}>I pasted it into {card.targetTool}</button>}
        {card && card.status !== 'approved' && <span className="faint">{card.status === 'observed-working' ? 'Seen working' : card.status}</span>}
      </div>
    </div>
  );
}

function OtherCapture({ creds }: { creds: Creds }) {
  const video = useRef<HTMLVideoElement>(null);
  const sampler = useRef<FrameSampler | null>(null);
  const [sharing, setSharing] = useState(false);
  const [msg, setMsg] = useState('');
  const share = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
      const v = video.current!;
      v.srcObject = stream; v.muted = true; await v.play();
      sampler.current = new FrameSampler(v, creds, FULL, 'screen-share', { onSent: () => setMsg('Sent a screen frame'), onError: (m, s) => { if (s !== 429) setMsg(m); } });
      sampler.current.start();
      setSharing(true);
      stream.getVideoTracks()[0].addEventListener('ended', () => { sampler.current?.stop(); setSharing(false); setMsg('Screen sharing stopped'); });
    } catch { setMsg('Screen sharing was cancelled or is not available in this browser.'); }
  };
  const stop = () => { sampler.current?.stop(); (video.current?.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); setSharing(false); };
  return (
    <section className="card stack">
      <h3>Other ways to show your screen</h3>
      <p className="faint">If the phone camera can’t read your screen, share this computer’s screen or send a screenshot. Only what you share is sent.</p>
      <video ref={video} hidden playsInline />
      {sharing ? <button className="btn small" onClick={stop}>Stop sharing</button> : <button className="btn small" onClick={share}>Share this screen</button>}
      <label className="btn small">Upload a screenshot<input className="sr-only" type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { await uploadFrame(creds, f, 'photo', true); setMsg('Screenshot sent'); } catch (x) { setMsg(errorText(x)); } }} /></label>
      {msg && <p className="faint" role="status">{msg}</p>}
    </section>
  );
}

export function EvidenceRows({ creds, state, moments }: { creds: Creds; state: Snapshot; moments: Moment[] }) {
  return (
    <table className="evidence">
      <thead><tr><th>Frame</th><th>You said</th><th>Caddie</th><th>Then</th></tr></thead>
      <tbody>
        {moments.map(m => (
          <tr key={m.id} className={m.misread ? 'misread' : undefined}>
            <td>
              {m.frame ? (
                <div className="stack" style={{ gap: 4 }}>
                  <MediaImage creds={creds} k={m.frame.storedKey} alt={`Screen at ${clock(m.at)}`} />
                  <span className="faint">{clock(m.at)} · {m.frame.source}{m.frame.fixture ? ' · sample' : ''}</span>
                  {m.frame.storedKey && <button className="linklike" onClick={() => api(creds, `/frames/${m.frame!.id}`, { method: 'DELETE' })}>Delete frame</button>}
                  {!m.frame.storedKey && <span className="faint">{m.readingStatus === 'ok' ? 'Source removed' : 'Not kept'}</span>}
                </div>
              ) : <span className="faint">{clock(m.at)} · reply</span>}
            </td>
            <td>
              {m.reading?.userRequest ? <span className="quote">{m.reading.userRequest}</span> : <span className="faint">{m.readingStatus === 'ok' ? '—' : m.readingError ?? m.readingStatus}</span>}
              {m.response?.transcript && <p className="faint" style={{ marginTop: 6 }}>Answered by voice: “{m.response.transcript}”</p>}
              {m.misread && <p className="faint">Marked “not what I asked”</p>}
            </td>
            <td>
              {m.decision?.action === 'intervene' ? (
                <div className="stack" style={{ gap: 4 }}><span className="tag">{m.decision.step}</span><span>{m.decision.message}</span>{m.decision.exampleBrief && <span className="faint">Example: {m.decision.exampleBrief}</span>}</div>
              ) : (
                <span className="faint">{m.decision ? `Quiet — ${m.decision.note ?? m.decision.reason}` : m.readingStatus === 'pending' ? 'Reading…' : ''}</span>
              )}
              {m.decision?.guardrail && <p className="faint">Guardrail: {m.decision.guardrail}</p>}
              {m.decision && <p className="faint">{m.decision.provenance === 'live-model' ? `Live model · ${m.decision.model}` : m.decision.provenance === 'fixture' ? 'Test fixture (fake model)' : 'Rule'}</p>}
            </td>
            <td>{m.change ? <div className="stack" style={{ gap: 4 }}><AssistLabel value={m.change.assistance} /><span>{changeText(m)}</span></div> : <span className="faint">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SessionReview({ creds, state, sessionId }: { creds: Creds; state: Snapshot; sessionId: string }) {
  const session = state.sessions.find(s => s.id === sessionId)!;
  const moments = sessionMoments(state, sessionId);
  const items = state.content.filter(c => c.sessionId === sessionId).sort(byFormat);
  const [open, setOpen] = useState<string | null>(null);
  const cards = state.cards.filter(c => c.sessionId === sessionId && c.status !== 'rejected');
  return (
    <section className="stack-lg">
      <div className="row wrap"><h2 className="grow">{session.task ?? 'Session'}{session.tool ? ` · ${session.tool}` : ''}</h2>{session.fixture && <FixtureTag />}<span className="faint">{session.status}</span></div>
      {moments.length ? <div className="card" style={{ overflowX: 'auto' }}><EvidenceRows creds={creds} state={state} moments={moments} /></div> : <Empty>No moments yet.</Empty>}
      {session.design && <div className="card stack"><div className="eyebrow">What changed</div><p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>{session.design.habit}</p><p className="faint">Counterpoint: {session.design.counterpoint}</p></div>}
      {cards.map(c => <CardControls key={c.id} card={c} creds={creds} />)}
      {items.length > 0 && (
        <div className="card">
          <div className="eyebrow">Made from this session</div>
          <div className="formats">
            {items.map(i => (
              <div key={i.id} className="format-row">
                <strong>{FORMAT_NAME[i.format]}</strong>
                <span className="faint">{i.whyNow}</span>
                <span className="row"><span className="pill-status">{i.status}</span>{(i.payload || i.status === 'failed' || i.status === 'skipped') && <button className="btn small" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? 'Close' : 'Open'}</button>}</span>
              </div>
            ))}
          </div>
          {open && (() => { const i = items.find(x => x.id === open); return i ? <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 8 }}><ContentBody item={i} state={state} creds={creds} /></div> : null; })()}
        </div>
      )}
      {session.status === 'ended' && session.wrapStatus === 'failed' && <button className="btn" onClick={() => post(creds, `/sessions/${session.id}/wrap`)}>Retry the wrap-up</button>}
    </section>
  );
}
