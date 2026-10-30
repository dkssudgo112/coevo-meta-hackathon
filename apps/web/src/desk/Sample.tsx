import { useEffect, useRef, useState } from 'react';
import { createWorkspace, post, type Creds } from '../lib/api.ts';
import { useWorkspace } from '../lib/store.ts';
import { canvasJpeg, uploadFrame } from '../lib/capture.ts';
import { errorText, Flag, latestSession, modelSourceLine, sessionMoments, useHealth } from '../ui/common.tsx';
import { LiveScreen } from '../phone/Live.tsx';
import { SessionReview } from './Desk.tsx';

interface Manifest { note: string; frames: { file: string; caption: string; session: number; provenance: 'actual-meta-ai' }[] }

const SOURCE: Record<Manifest['frames'][number]['provenance'], string> = {
  'actual-meta-ai': 'Actual Meta AI reply · scripted, fictional café',
};

/** Rasterize a sample screen (JPEG or SVG) to JPEG, the same format the phone sends. */
async function screenJpeg(url: string): Promise<Blob> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 1280;
  c.height = img.naturalHeight || 800;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return canvasJpeg(c, 0.9);
}

const KEY = 'coevo.sample';

function loadSample(): Creds | null {
  try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as Creds) : null; } catch { return null; }
}

export function SampleApp() {
  const [creds, setCreds] = useState<Creds | null>(loadSample);
  const [err, setErr] = useState('');
  const health = useHealth();
  const start = async () => {
    setErr('');
    try {
      const w = await createWorkspace('sample');
      const c: Creds = { workspaceId: w.workspaceId, token: w.deskToken, role: 'desk' };
      try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* tab only */ }
      setCreds(c);
    } catch (e) { setErr(errorText(e)); }
  };
  if (!creds) {
    return (
      <div className="landing">
        <div className="row"><Flag state="watching" /><span className="eyebrow">Sample session</span></div>
        <h1>Watch the Caddie work, without a phone</h1>
        <p className="muted">You’ll replay a café owner’s screens while they make a poster with Meta AI. The café is fictional and the requests are scripted; every Meta AI reply on screen is real. {modelSourceLine(health)}</p>
        <div className="row"><button className="btn primary" onClick={start}>Start the sample</button></div>
        {err && <p className="faint" role="alert">{err}</p>}
      </div>
    );
  }
  return <SampleRun creds={creds} onRestart={() => { try { sessionStorage.removeItem(KEY); } catch { /* */ } setCreds(null); }} />;
}

function SampleRun({ creds, onRestart }: { creds: Creds; onRestart: () => void }) {
  const { state, conn } = useWorkspace(creds);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const stop = useRef(false);
  const busy = useRef(false);

  useEffect(() => { fetch('/samples/manifest.json').then(r => r.json()).then(setManifest).catch(() => setMsg('Sample frames are missing from this build.')); }, []);
  // Resume where this sample left off (e.g. after a reload).
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !manifest || !state) return;
    resumed.current = true;
    const sent = state.moments.filter(m => m.frame?.source === 'sample').length;
    setI(Math.min(sent, manifest.frames.length - 1));
  }, [manifest, state]);

  const session = latestSession(state);
  const moments = sessionMoments(state, session?.id);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lastRef = useRef(moments[moments.length - 1]);
  lastRef.current = moments[moments.length - 1];

  const sendFrame = async (n: number) => {
    if (!manifest) return;
    const f = manifest.frames[n];
    await uploadFrame(creds, await screenJpeg(`/samples/${f.file}`), 'sample', true);
  };

  const waitIdle = async () => {
    for (let t = 0; t < 90 && !stop.current; t++) {
      await new Promise(r => setTimeout(r, 1000));
      if (!busy.current) return;
    }
  };

  useEffect(() => {
    const last = moments[moments.length - 1];
    busy.current = Boolean(last && (last.readingStatus === 'pending' || (last.readingStatus === 'ok' && !last.decision)));
  }, [moments]);

  const play = async () => {
    if (!manifest) return;
    stop.current = false;
    setPlaying(true);
    setMsg('');
    try {
      for (let n = i; n < manifest.frames.length && !stop.current; n++) {
        const prev = n > 0 ? manifest.frames[n - 1] : null;
        const current = sessionRef.current;
        const crossing = prev && prev.session !== manifest.frames[n].session;
        if (crossing && current && current.status !== 'ended') {
          await post(creds, `/sessions/${current.id}/end`);
          setMsg('Session 1 ended. Review the wrap-up below and the Caddie card it proposes. Continue shows a separate recorded Meta AI chat that began with a Coevo card from an earlier run; your own card here is not in any AI, so the Caddie will not count it as working.');
          setI(n);
          return;
        }
        if (crossing && current?.status === 'ended') await post(creds, '/sessions', {});
        setI(n);
        await sendFrame(n);
        await new Promise(r => setTimeout(r, 2600));
        await waitIdle();
        const last = lastRef.current;
        if (last?.decision?.action === 'intervene' && !last.response) {
          setI(Math.min(n + 1, manifest.frames.length - 1));
          setMsg('The Caddie stepped in. Answer by voice on the phone (your computer’s microphone), or press Continue to see what the owner typed next.');
          return;
        }
      }
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setPlaying(false);
    }
  };

  const frame = manifest?.frames[i];
  return (
    <div className="desk">
      <header className="desk-top">
        <Flag state="watching" />
        <div className="grow"><h2>Sample session</h2><p className="faint">Scripted, fictional café; every screen is an actual Meta AI reply. {state ? modelSourceLine({ liveCallsEnabled: state.workspace.liveCalls, testFakeModels: state.workspace.testFakeModels }) : ''}</p></div>
        <button className="btn small" onClick={onRestart}>New sample</button>
      </header>
      {state && (state.workspace.testFakeModels || !state.workspace.liveCalls) && <div className="notice warn" role="status">{modelSourceLine({ liveCallsEnabled: state.workspace.liveCalls, testFakeModels: state.workspace.testFakeModels })}</div>}
      <div className="split">
        <section className="stack">
          <div className="row"><span className="eyebrow grow">Their screen · sample data</span><span className="faint">{manifest ? `${i + 1} / ${manifest.frames.length}` : ''}</span></div>
          {frame && <div className="screen-sim"><img src={`/samples/${frame.file}`} alt={frame.caption} /></div>}
          {frame && <p className="muted">{frame.caption}</p>}
          {frame && <p className="faint">{SOURCE[frame.provenance] ?? 'Sample screen'}</p>}
          <div className="row wrap">
            {playing ? <button className="btn" onClick={() => { stop.current = true; }}>Pause</button> : <button className="btn primary" disabled={!manifest || !state?.workspace.liveCalls} onClick={play}>{i === 0 && !moments.length ? 'Play the sample' : 'Continue'}</button>}
            <button className="btn" disabled={playing || !manifest || i >= (manifest?.frames.length ?? 1) - 1} onClick={() => setI(x => x + 1)}>Skip frame</button>
            {session && session.status !== 'ended' && <button className="btn ghost" disabled={playing} onClick={() => post(creds, `/sessions/${session.id}/end`)}>End session</button>}
          </div>
          {msg && <p className="faint" role="alert">{msg}</p>}
          <p className="faint">Budget for this sample: ${state?.workspace.budget.spentUsd.toFixed(3) ?? '0.000'} of ${state?.workspace.budget.capUsd.toFixed(2) ?? '0.15'}.</p>
        </section>
        <section aria-label="The Caddie on the phone">
          <div className="phone-frame">{state ? <LiveScreen creds={creds} state={state} conn={conn} embedded /> : <p className="faint">Connecting…</p>}</div>
        </section>
      </div>
      {state && state.sessions.length > 1 && (
        <div className="row wrap" role="tablist" aria-label="Sessions">
          {[...state.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((s, n) => (
            <button key={s.id} role="tab" aria-selected={(picked ?? session?.id) === s.id} className={`btn small ${(picked ?? session?.id) === s.id ? 'primary' : ''}`} onClick={() => setPicked(s.id)}>Session {n + 1}{s.task ? ` · ${s.task}` : ''}</button>
          ))}
        </div>
      )}
      {state && session && <SessionReview creds={creds} state={state} sessionId={picked && state.sessions.some(s => s.id === picked) ? picked : session.id} />}
    </div>
  );
}
