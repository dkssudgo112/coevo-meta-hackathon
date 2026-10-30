import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'coevo.readAloud';
const EARPHONE = /head(phone|set)|ear(phone|bud|pod)|airpods|buds|bluetooth/i;

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Joke voices some desktops ship; never pick them for coaching. */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy)\b/i;

/** Only an English voice that runs on the device itself: online voices send the text to the browser maker. */
function localVoice(): SpeechSynthesisVoice | null {
  if (!supported()) return null;
  const vs = window.speechSynthesis.getVoices().filter(v => v.localService && !NOVELTY.test(v.name));
  const en = vs.filter(v => v.lang.toLowerCase().startsWith('en'));
  return en.find(v => v.default) ?? en.find(v => /^en[-_]us/i.test(v.lang)) ?? en[0] ?? null;
}

function utterance(text: string, voice: SpeechSynthesisVoice): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang || 'en-US';
  return u;
}

/**
 * Live Caddie voice (plan 6.1): browser speech synthesis, only after the person turns it on and
 * confirms their earphones are in. Never on by default, never through the speaker on its own: it
 * switches itself off when the audio devices change (earphones out), and the choice lasts only for
 * this tab.
 */
export function useReadAloud() {
  const [on, setOn] = useState<boolean>(() => {
    try { return supported() && sessionStorage.getItem(KEY) === 'on'; } catch { return false; }
  });
  const [notice, setNotice] = useState('');
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(localVoice);
  const onRef = useRef(on);
  onRef.current = on;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // Voices load asynchronously in most browsers.
  useEffect(() => {
    if (!supported()) return;
    const update = () => setVoice(localVoice());
    update();
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);

  const set = useCallback((v: boolean) => {
    setOn(v);
    try { if (v) sessionStorage.setItem(KEY, 'on'); else sessionStorage.removeItem(KEY); } catch { /* tab only */ }
    if (!v && supported()) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const changed = () => {
      if (!onRef.current) return;
      set(false);
      setNotice('Read-aloud turned off because your audio devices changed. Turn it on again when your earphones are in.');
    };
    md.addEventListener('devicechange', changed);
    return () => md.removeEventListener('devicechange', changed);
  }, [set]);

  const say = useCallback((text: string) => {
    const v = voiceRef.current;
    if (!onRef.current || !v || !text) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance(text.replace(/\[test\]\s*/g, ''), v));
  }, []);
  const stop = useCallback(() => { if (supported()) window.speechSynthesis.cancel(); }, []);

  return { supported: supported(), voice, on: on && !!voice, set, say, stop, notice, clearNotice: () => setNotice('') };
}

export type ReadAloud = ReturnType<typeof useReadAloud>;

/** Drawer control: opt in with an explicit earphone confirmation. */
export function ReadAloudSetting({ ra }: { ra: ReadAloud }) {
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    navigator.mediaDevices?.enumerateDevices?.().then(ds => {
      const out = ds.find(d => d.kind === 'audiooutput' && EARPHONE.test(d.label));
      setSeen(out ? out.label : null);
    }).catch(() => setSeen(null));
  }, [confirming]);

  if (!ra.supported || !ra.voice) return <section className="stack"><h3>Read the Caddie aloud</h3><p className="faint">Not available here: this browser has no voice that runs on the phone itself, and an online voice would send the text away.</p></section>;
  return (
    <section className="stack">
      <h3>Read the Caddie aloud</h3>
      {ra.notice && <p className="faint" role="status">{ra.notice}</p>}
      {ra.on ? (
        <>
          <p className="faint">On for this tab: new questions are read aloud through your earphones. It turns off by itself if your audio devices change.</p>
          <button className="btn" onClick={() => ra.set(false)}>Turn off</button>
        </>
      ) : confirming ? (
        <div className="stack">
          <p className="faint">Only with earphones in, so nobody nearby hears your coaching. Your phone’s own voice ({ra.voice.name}) reads it; the text stays on this phone.</p>
          {seen && <p className="faint">This phone reports an audio output named “{seen}”. Still, please check.</p>}
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> My earphones are in</label>
          <div className="row">
            <button className="btn primary" disabled={!checked} onClick={() => { ra.set(true); ra.clearNotice(); setConfirming(false); setChecked(false); if (ra.voice) window.speechSynthesis.speak(utterance('Earphones on. I will read new questions here.', ra.voice)); }}>Turn on</button>
            <button className="btn ghost" onClick={() => { setConfirming(false); setChecked(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p className="faint">Off. The Caddie stays silent and only vibrates.</p>
          <button className="btn" onClick={() => setConfirming(true)}>Turn on with earphones…</button>
        </>
      )}
    </section>
  );
}
