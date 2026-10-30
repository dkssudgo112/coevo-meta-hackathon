import { useEffect, useRef, useState } from 'react';
import { Recorder, RecorderCancelled } from '../lib/recorder.ts';
import { errorText } from '../ui/common.tsx';

type Phase = 'idle' | 'starting' | 'recording' | 'sending' | 'error';

/**
 * Tap to talk, tap to send. Records 16 kHz WAV on the device.
 * One recorder at a time: taps while the microphone is opening are ignored, leaving the screen
 * releases the microphone (even if permission is still pending), and `onActive` tells the parent
 * while the person is answering so nothing changes under them.
 */
export function VoiceButton({ label, onWav, maxSeconds = 60, disabled, onActive }: {
  label: string;
  onWav: (wav: Uint8Array, seconds: number) => Promise<void>;
  maxSeconds?: number;
  disabled?: boolean;
  onActive?: (active: boolean) => void;
}) {
  const rec = useRef<Recorder | null>(null);
  const phaseRef = useRef<Phase>('idle');
  // Each start gets a generation; a late completion from an older one never changes the current phase.
  const gen = useRef(0);
  const mounted = useRef(true);
  const activeCb = useRef(onActive);
  activeCb.current = onActive;
  const [state, setStateRaw] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');

  const setState = (p: Phase) => {
    const wasActive = phaseRef.current === 'starting' || phaseRef.current === 'recording' || phaseRef.current === 'sending';
    const active = p === 'starting' || p === 'recording' || p === 'sending';
    phaseRef.current = p;
    if (mounted.current) setStateRaw(p);
    if (wasActive !== active) activeCb.current?.(active);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      gen.current++;
      rec.current?.cancel();
      rec.current = null;
      if (phaseRef.current === 'starting' || phaseRef.current === 'recording' || phaseRef.current === 'sending') activeCb.current?.(false);
      phaseRef.current = 'idle';
    };
  }, []);
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
    if (phaseRef.current === 'starting' || phaseRef.current === 'recording' || phaseRef.current === 'sending') return;
    setErr('');
    setElapsed(0);
    const my = ++gen.current;
    const r = new Recorder();
    rec.current = r;
    setState('starting');
    try {
      await r.start();
      if (gen.current !== my || rec.current !== r) { r.cancel(); return; }
      setState('recording');
    } catch (e) {
      r.cancel();
      if (gen.current !== my) return; // cancelled, superseded or unmounted: the current phase is not ours
      rec.current = null;
      if (e instanceof RecorderCancelled) { setState('idle'); return; }
      setState('error');
      setErr('The microphone is blocked. Allow it in your browser settings, or type your answer.');
    }
  };

  const stop = async () => {
    const r = rec.current;
    if (!r || phaseRef.current !== 'recording') return;
    const my = gen.current;
    rec.current = null;
    let out: { wav: Uint8Array; seconds: number };
    try {
      out = await r.stop();
    } catch {
      r.cancel();
      if (gen.current !== my) return;
      setState('error');
      setErr('Recording failed. Try again, or type your answer.');
      return;
    }
    if (gen.current !== my) return;
    if (out.seconds < 0.6) { setState('idle'); return; }
    setState('sending');
    try {
      await onWav(out.wav, out.seconds);
      if (gen.current === my) setState('idle');
    } catch (e) {
      if (gen.current !== my) return;
      setState('error');
      setErr(errorText(e));
    }
  };

  const discard = () => {
    gen.current++;
    const r = rec.current;
    rec.current = null;
    r?.cancel();
    setState('idle');
  };

  const busy = state === 'starting' || state === 'sending';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        className={`btn primary mic ${state === 'recording' ? 'recording' : ''}`}
        onClick={state === 'recording' ? stop : start}
        disabled={busy || (disabled && state !== 'recording')}
        aria-pressed={state === 'recording'}
      >
        {state === 'recording' ? `■ Stop and send · ${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`
          : state === 'starting' ? 'Opening the microphone…'
          : state === 'sending' ? 'Sending…'
          : `🎤 ${label}`}
      </button>
      {state === 'recording' && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>}
      {(state === 'recording' || state === 'starting') && <button className="btn ghost small" onClick={discard}>Cancel, don't send</button>}
      {err && <p className="faint" role="alert">{err}</p>}
    </div>
  );
}
