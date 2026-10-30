import { useEffect, useRef, useState } from 'react';
import { Recorder } from '../lib/recorder.ts';
import { errorText } from '../ui/common.tsx';

/** Tap to talk, tap to send. Records 16 kHz WAV on the device. */
export function VoiceButton({ label, onWav, maxSeconds = 60, disabled }: { label: string; onWav: (wav: Uint8Array, seconds: number) => Promise<void>; maxSeconds?: number; disabled?: boolean }) {
  const rec = useRef<Recorder | null>(null);
  const [state, setState] = useState<'idle' | 'recording' | 'sending' | 'error'>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => () => rec.current?.cancel(), []);
  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => {
      const r = rec.current;
      if (!r) return;
      setLevel(r.level);
      setElapsed(r.elapsed());
      if (r.elapsed() >= maxSeconds) void stop();
    }, 100);
    return () => clearInterval(t);
  }, [state]);

  const start = async () => {
    setErr('');
    try {
      rec.current = new Recorder();
      await rec.current.start();
      setState('recording');
    } catch {
      setState('error');
      setErr('Microphone access is needed to answer by voice.');
    }
  };

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const { wav, seconds } = await r.stop();
    if (seconds < 0.6) { setState('idle'); return; }
    setState('sending');
    try {
      await onWav(wav, seconds);
      setState('idle');
    } catch (e) {
      setState('error');
      setErr(errorText(e));
    }
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        className={`btn primary mic ${state === 'recording' ? 'recording' : ''}`}
        onClick={state === 'recording' ? stop : start}
        disabled={disabled || state === 'sending'}
        aria-pressed={state === 'recording'}
      >
        {state === 'recording' ? `■ Stop and send · ${Math.floor(elapsed)}s` : state === 'sending' ? 'Sending…' : `🎤 ${label}`}
      </button>
      {state === 'recording' && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>}
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}
