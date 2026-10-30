import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'coevo.readAloud';
const EARPHONE = /head(phone|set)|ear(phone|bud|pod)|airpods|buds|bluetooth/i;

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
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
  const onRef = useRef(on);
  onRef.current = on;

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
    if (!onRef.current || !supported() || !text) return;
    const u = new SpeechSynthesisUtterance(text.replace(/\[test\]\s*/g, ''));
    u.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);
  const stop = useCallback(() => { if (supported()) window.speechSynthesis.cancel(); }, []);

  return { supported: supported(), on, set, say, stop, notice, clearNotice: () => setNotice('') };
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

  if (!ra.supported) return <section className="stack"><h3>Read the Caddie aloud</h3><p className="faint">This browser has no speech synthesis.</p></section>;
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
          <p className="faint">Only with earphones in, so nobody nearby hears your coaching. The browser speaks with its own voice; nothing extra is sent anywhere.</p>
          {seen && <p className="faint">This phone reports an audio output named “{seen}”. Still, please check.</p>}
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> My earphones are in</label>
          <div className="row">
            <button className="btn primary" disabled={!checked} onClick={() => { ra.set(true); ra.clearNotice(); setConfirming(false); setChecked(false); window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance('Earphones on. I will read new questions here.'), { lang: 'en-US' })); }}>Turn on</button>
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
