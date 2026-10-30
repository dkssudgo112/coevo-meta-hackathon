import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import jsQR from 'jsqr';
import type { CropRect } from '../../../../packages/contracts/index.ts';
import { pairPhone, parsePair, postBinary, type Creds } from '../lib/api.ts';
import { canvasJpeg, drawCrop, FULL, startRearCamera, stopStream } from '../lib/capture.ts';
import { errorText, Flag } from '../ui/common.tsx';

export function PairScreen({ onPaired }: { onPaired: (c: Creds) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'pairing' | 'denied' | 'error'>('starting');
  const [message, setMessage] = useState('');
  const handled = useRef(false);

  const tryPair = async (text: string) => {
    const p = parsePair(text);
    if (!p || handled.current) return false;
    handled.current = true;
    setStatus('pairing');
    try {
      onPaired(await pairPhone(p.workspaceId, p.pairSecret));
    } catch (e) {
      handled.current = false;
      setStatus('error');
      setMessage(errorText(e));
    }
    return true;
  };

  useEffect(() => {
    // A QR scanned with the phone's own camera app lands here with #pair=…
    if (location.hash.includes('pair=')) {
      const text = location.hash;
      history.replaceState(null, '', location.pathname);
      void tryPair(text);
      return;
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await startRearCamera(video.current!);
        setStatus('scanning');
        const loop = () => {
          const v = video.current;
          if (v && v.videoWidth && !handled.current) {
            drawCrop(v, FULL, canvas, 720);
            const g = canvas.getContext('2d', { willReadFrequently: true })!;
            const code = jsQR(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) void tryPair(code.data);
          }
          raf = window.setTimeout(loop, 250);
        };
        loop();
      } catch {
        setStatus('denied');
      }
    })();
    return () => { clearTimeout(raf); stopStream(stream); };
  }, []);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    const scale = Math.min(1, 1200 / bmp.width);
    c.width = bmp.width * scale; c.height = bmp.height * scale;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const code = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (!code?.data || !(await tryPair(code.data))) { setStatus('error'); setMessage('No Coevo QR code was found in that photo.'); }
  };

  return (
    <div className="phone">
      <div className="statusbar"><Flag state="off" /><div className="grow"><div className="title">Coevo Caddie</div><div className="sub">Not connected</div></div></div>
      <main>
        <div className="stack">
          <h2>Stand your phone next to your screen</h2>
          <p className="muted">On your computer, open <strong>{location.host}/desk</strong> and point this camera at the QR code.</p>
        </div>
        <div className="viewfinder" aria-label="Camera view for scanning the Desk QR code">
          <video ref={video} playsInline muted />
          <div className="scanbox" />
        </div>
        {status === 'starting' && <p className="faint" role="status">Starting the camera…</p>}
        {status === 'scanning' && <p className="faint" role="status">Looking for the Coevo Desk QR…</p>}
        {status === 'pairing' && <p className="faint" role="status">Connecting…</p>}
        {status === 'denied' && <div className="notice warn" role="alert">The Caddie needs the camera to see your screen. Allow camera access in your browser settings, or pair with a photo of the QR code.</div>}
        {status === 'error' && <div className="notice warn" role="alert">{message || 'Pairing failed.'} Show a new code on the Desk and try again.</div>}
        <label className="btn block">
          Pair with a photo of the QR
          <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={e => fromPhoto(e.target.files?.[0])} />
        </label>
      </main>
    </div>
  );
}

type Corner = 'tl' | 'br';

/** Crop editor over a live video or a still image. Only this region is ever uploaded. */
export function CropEditor({ media, crop, onChange, aspect }: { media: React.ReactNode; crop: CropRect; onChange: (c: CropRect) => void; aspect?: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Corner | null>(null);
  const move = (e: RPointerEvent) => {
    if (!drag.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (drag.current === 'tl') {
      const x2 = crop.x + crop.w, y2 = crop.y + crop.h;
      const nx = Math.min(x, x2 - 0.1), ny = Math.min(y, y2 - 0.1);
      onChange({ x: nx, y: ny, w: x2 - nx, h: y2 - ny });
    } else {
      onChange({ ...crop, w: Math.max(0.1, x - crop.x), h: Math.max(0.1, y - crop.y) });
    }
  };
  return (
    <div className="viewfinder" style={aspect ? { aspectRatio: String(aspect) } : undefined} ref={box} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
      {media}
      <div className="croprect" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
        <button type="button" aria-label="Move top-left corner" className="handle" style={{ left: 0, top: 0 }} onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = 'tl'; }} />
        <button type="button" aria-label="Move bottom-right corner" className="handle" style={{ left: '100%', top: '100%' }} onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = 'br'; }} />
      </div>
    </div>
  );
}

export function AimScreen({ creds, initial, onDone, onPhotos }: { creds: Creds; initial: CropRect | null; onDone: (crop: CropRect) => void; onPhotos: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [crop, setCrop] = useState<CropRect>(initial ?? { x: 0.1, y: 0.15, w: 0.8, h: 0.6 });
  const [camera, setCamera] = useState<'starting' | 'on' | 'denied'>('starting');
  const [find, setFind] = useState<{ state: 'idle' | 'sending' | 'found' | 'none' | 'error'; message?: string }>({ state: 'idle' });
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    startRearCamera(video.current!).then(s => { stream = s; setCamera('on'); }).catch(() => setCamera('denied'));
    return () => stopStream(stream);
  }, []);

  const findScreen = async () => {
    if (!video.current) return;
    setFind({ state: 'sending' });
    try {
      const c = document.createElement('canvas');
      drawCrop(video.current, FULL, c, 1280);
      const r = await postBinary<{ crop: CropRect | null; error?: string }>(creds, '/calibrate', await canvasJpeg(c), 'image/jpeg');
      if (r.crop) { setCrop(r.crop); setFind({ state: 'found' }); }
      else setFind({ state: r.error ? 'error' : 'none', message: r.error });
    } catch (e) {
      setFind({ state: 'error', message: errorText(e) });
    }
  };

  return (
    <div className="phone">
      <div className="statusbar"><Flag state="watching" /><div className="grow"><div className="title">Aim at your screen</div><div className="sub">Connected to Desk</div></div></div>
      <main>
        <p className="muted">Prop the phone 50–70 cm from your monitor. Drag the corners so the box covers only your screen. <strong>Only what’s inside the box is sent.</strong></p>
        <CropEditor aspect={aspect} media={<video ref={video} playsInline muted onLoadedMetadata={e => setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || null)} />} crop={crop} onChange={setCrop} />
        {camera === 'denied' && <div className="notice warn" role="alert">Camera access was denied. You can still use the Caddie with photos.</div>}
        <div className="card soft stack">
          <button className="btn" onClick={findScreen} disabled={camera !== 'on' || find.state === 'sending'}>{find.state === 'sending' ? 'Finding your screen…' : 'Find my screen for me'}</button>
          <p className="faint">This sends <strong>one setup photo</strong> (the whole camera view) to Meta’s SAM 3.1 model to locate the monitor. It is not stored. After setup, only the boxed screen area is sent.</p>
          {find.state === 'found' && <p className="faint" role="status">Found it. Adjust the corners if needed.</p>}
          {find.state === 'none' && <p className="faint" role="status">No screen was found. Drag the corners by hand.</p>}
          {find.state === 'error' && <p className="faint" role="alert">{find.message ?? 'Screen finding is unavailable.'} Drag the corners by hand.</p>}
        </div>
        <button className="btn primary block" onClick={() => onDone(crop)} disabled={camera !== 'on'}>Start watching</button>
        <button className="linklike" onClick={onPhotos}>Use single photos instead</button>
      </main>
    </div>
  );
}
