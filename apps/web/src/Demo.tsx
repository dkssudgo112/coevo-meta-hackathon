import { useEffect, useState } from 'react';
import { Flag } from './ui/common.tsx';

/** The published demo file. It is added only after an exact-byte review (scripts/reviewed-assets.json). */
const VIDEO = '/demo/coevo-caddie-demo.mp4';

/** Public watch page for the three-minute demo, with what is real and what is assumed stated plainly. */
export function DemoPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(VIDEO, { method: 'HEAD' }).then(r => setAvailable(r.ok && (r.headers.get('content-type') ?? '').startsWith('video/'))).catch(() => setAvailable(false));
  }, []);
  return (
    <div className="landing">
      <div className="row"><Flag state="watching" /><span className="eyebrow">Coevo Caddie · demo</span></div>
      <h1>Three minutes with the Caddie</h1>
      {available ? (
        <video className="demo-video" src={VIDEO} controls playsInline preload="metadata" aria-label="Coevo Caddie three-minute demo video" />
      ) : available === false ? (
        <p className="notice" role="status">The demo video is being finalized. Meanwhile, the recorded sample session shows the same run.</p>
      ) : (
        <p className="faint" role="status">Loading…</p>
      )}
      <section className="stack">
        <h2>What is real in this video</h2>
        <ul className="stack" style={{ paddingLeft: 20 }}>
          <li><strong>Real model output.</strong> Every Caddie reading, question, note, playbook, flashcard, podcast script, short and practice image comes from the deployed app: Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe and Muse Image; podcast and short voices are Kokoro-82M on Modal.</li>
          <li><strong>Scripted people, actual AI replies.</strong> The café owner and the job applicant are scripted and fictional. The Meta AI and ChatGPT screens are actual replies to those scripts.</li>
          <li><strong>Assumed setup.</strong> The phone is assumed to stand beside the monitor. The phone screen is a real recording of the app in a phone-sized browser with a controlled camera input and a synthetic voice; no physical phone camera or human voice appears.</li>
          <li><strong>The card in Meta AI</strong> was checked in a separate pinned Meta AI chat that began with an earlier card from the app; Meta AI did not carry the rule into other new chats in our check.</li>
        </ul>
      </section>
      <div className="row wrap" style={{ gap: 12 }}>
        <a className="btn primary" href="/sample">Replay the recorded sample</a>
        <a className="btn" href="/">Try it with your phone</a>
        <a className="btn ghost" href="https://github.com/dkssudgo112/coevo-meta-hackathon">Source code</a>
      </div>
    </div>
  );
}
