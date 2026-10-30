import { useEffect, useRef, useState } from 'react';
import type { CropRect } from '../../../../packages/contracts/index.ts';
import { loadCreds, post, saveCreds, type Creds } from '../lib/api.ts';
import { useWorkspace } from '../lib/store.ts';
import { cropImageFile, FrameSampler, startRearCamera, stopStream, uploadFrame, type SentTiming } from '../lib/capture.ts';
import { errorText, latestSession } from '../ui/common.tsx';
import { AimScreen, CropEditor, PairScreen } from './Setup.tsx';
import { LiveScreen } from './Live.tsx';

const CROP_KEY = 'coevo.crop';
const BENCH_KEY = 'coevo.benchmark';
const BENCHMARK_MAX = 20;

/** Benchmark test mode is opt-in per tab via /caddie?benchmark=1 and disclosed on screen. */
function benchmarkMode(): boolean {
  try {
    if (new URLSearchParams(location.search).has('benchmark')) sessionStorage.setItem(BENCH_KEY, '1');
    return sessionStorage.getItem(BENCH_KEY) === '1';
  } catch { return new URLSearchParams(location.search).has('benchmark'); }
}

function loadCrop(): CropRect | null {
  try { const r = localStorage.getItem(CROP_KEY); return r ? (JSON.parse(r) as CropRect) : null; } catch { return null; }
}
function saveCrop(c: CropRect): void {
  try { localStorage.setItem(CROP_KEY, JSON.stringify(c)); } catch { /* per-tab only */ }
}

export function CaddieApp() {
  const [creds, setCreds] = useState<Creds | null>(() => (location.hash.includes('pair=') ? null : loadCreds('phone')));
  const [mode, setMode] = useState<'aim' | 'camera' | 'photos'>(() => (loadCrop() ? 'camera' : 'aim'));
  const [crop, setCrop] = useState<CropRect | null>(loadCrop);

  if (!creds) return <PairScreen onPaired={c => { saveCreds(c, 'phone'); setCreds(c); setMode(loadCrop() ? 'camera' : 'aim'); }} />;
  if (mode === 'aim') return <AimScreen creds={creds} initial={crop} onDone={c => { saveCrop(c); setCrop(c); setMode('camera'); }} onPhotos={() => setMode('photos')} />;
  return <Watching creds={creds} crop={mode === 'camera' ? crop : null} onReaim={() => setMode('aim')} onUnpair={() => { saveCreds(null, 'phone'); setCreds(null); }} />;
}

function Watching({ creds, crop, onReaim, onUnpair }: { creds: Creds; crop: CropRect | null; onReaim: () => void; onUnpair: () => void }) {
  const { state, conn } = useWorkspace(creds);
  // Benchmark only: when a sent frame's card arrives, report change→card and upload→card to the server.
  const pendingTiming = useRef(new Map<string, SentTiming>());
  useEffect(() => {
    if (!state || !pendingTiming.current.size) return;
    for (const [id, t] of [...pendingTiming.current]) {
      const m = state.moments.find(x => x.id === id);
      if (!m?.decision) continue;
      pendingTiming.current.delete(id);
      const shown = Date.now();
      post(creds, `/moments/${id}/client-timing`, { changeToCardMs: t.changeAt === null ? null : shown - t.changeAt, uploadToCardMs: shown - t.sentAt }).catch(() => { /* timing is optional */ });
    }
  }, [state]);
  const [bench] = useState(benchmarkMode);
  const [benchStopped, setBenchStopped] = useState(false);
  const benchCount = state ? state.moments.filter(m => m.benchmark).length : 0;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampler = useRef<FrameSampler | null>(null);
  const [message, setMessage] = useState(crop ? 'Starting the camera…' : 'Photo mode: send a photo whenever you want the Caddie to look.');
  const [photo, setPhoto] = useState<{ file: File; url: string; crop: CropRect; aspect: number | null } | null>(null);
  const session = latestSession(state);
  const paused = session?.status === 'paused';

  const benchDone = bench && (benchStopped || benchCount >= BENCHMARK_MAX);
  // The camera runs only while actively watching. Pause, benchmark stop and benchmark
  // completion turn the camera itself off (tracks stopped), not just the uploads.
  const cameraOn = Boolean(crop) && !paused && !benchDone;

  useEffect(() => {
    if (!cameraOn || !crop || !videoRef.current) {
      if (crop) setMessage(paused ? 'Paused — camera off, nothing is sent' : benchDone ? 'Benchmark finished — camera off' : 'Camera off');
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setMessage('Starting the camera…');
    startRearCamera(videoRef.current).then(s => {
      // A late getUserMedia resolution after pause/unmount must not leave the camera on.
      if (cancelled) { stopStream(s); return; }
      stream = s;
      sampler.current = new FrameSampler(videoRef.current!, creds, crop, 'camera', {
        onVerdict: v => setMessage(v.kind === 'camera-moved' ? 'Camera moved — hold still or re-aim' : v.kind === 'settling' ? 'Screen is changing…' : 'Watching your screen'),
        onSent: (id, t) => { setMessage('Sent the boxed screen area'); if (bench) pendingTiming.current.set(id, t); },
        onError: (m, status) => { if (status === 409) sampler.current?.stop(); if (status !== 429) setMessage(m); },
      });
      sampler.current.benchmark = bench;
      sampler.current.start();
    }).catch(() => { if (!cancelled) setMessage('Camera unavailable — use photos from the menu'); });
    return () => {
      cancelled = true;
      sampler.current?.stop();
      sampler.current = null;
      stopStream(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOn, crop?.x, crop?.y, crop?.w, crop?.h, creds.token]);

  const exitBenchmark = () => {
    try { sessionStorage.removeItem(BENCH_KEY); } catch { /* tab only */ }
    location.replace('/caddie');
  };

  const onPhoto = (file: File) => setPhoto({ file, url: URL.createObjectURL(file), crop: crop ?? { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, aspect: null });

  return (
    <>
      {bench && (
        <div className="notice warn" role="status" style={{ borderRadius: 0, position: 'sticky', top: 0, zIndex: 6 }}>
          <div className="row wrap">
            <strong className="grow">Benchmark test mode · {Math.min(benchCount, BENCHMARK_MAX)}/{BENCHMARK_MAX} frames</strong>
            {!benchStopped && benchCount < BENCHMARK_MAX ? <button className="btn small" onClick={() => setBenchStopped(true)}>Stop</button> : <span>Stopped — camera off. Export or delete on the Desk</span>}
            <button className="btn small ghost" onClick={exitBenchmark}>Exit benchmark mode</button>
          </div>
          <span className="faint">For a synthetic test conversation only. Device-cropped frames are kept for evaluation until you delete them on the Desk.</span>
        </div>
      )}
      <LiveScreen creds={creds} state={state} conn={conn} camera={{ mode: crop ? 'camera' : 'photo', videoRef, message, onReaim, onPhoto }} onUnpair={onUnpair} />
      {photo && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Crop photo">
          <div className="sheet">
            <h2>Send this screen area</h2>
            <p className="muted">Drag the corners to cover only your screen. Only the boxed area is sent.</p>
            <CropEditor aspect={photo.aspect} media={<img src={photo.url} alt="Photo of your screen" style={{ width: '100%', height: '100%', objectFit: 'fill' }} onLoad={e => { const a = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight; setPhoto(p => (p ? { ...p, aspect: a } : p)); }} />} crop={photo.crop} onChange={c => setPhoto({ ...photo, crop: c })} />
            <div className="row">
              <button className="btn primary grow" onClick={async () => {
                try { await uploadFrame(creds, await cropImageFile(photo.file, photo.crop), 'photo', true); setMessage('Photo sent'); } catch (e) { setMessage(errorText(e)); }
                URL.revokeObjectURL(photo.url); setPhoto(null);
              }}>Send</button>
              <button className="btn" onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
