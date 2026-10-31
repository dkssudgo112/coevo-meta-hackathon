import { useEffect, useState } from 'react';
import { Flag } from './ui/common.tsx';

/** The published demo file and its captions. Both are added only after an exact-byte review (scripts/reviewed-assets.json). */
const VIDEO = '/demo/coevo-caddie-demo.mp4?v=97ce8420';
const CAPTIONS = '/demo/coevo-caddie-demo.en.vtt?v=4fcedd90';

/** Public watch page for the demo, with what is real and what is assumed stated plainly. */
export function DemoPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(VIDEO, { method: 'HEAD' }).then(r => setAvailable(r.ok && (r.headers.get('content-type') ?? '').startsWith('video/'))).catch(() => setAvailable(false));
  }, []);
  return (
    <div className="landing">
      <div className="row"><Flag state="watching" /><span className="eyebrow">Coevo Caddie · demo</span></div>
      <h1>Coevo Caddie in under three minutes</h1>
      {available ? (
        <video className="demo-video" src={VIDEO} controls playsInline preload="metadata" aria-label="Coevo Caddie demo video">
          <track kind="captions" src={CAPTIONS} srcLang="en" label="English" default />
        </video>
      ) : available === false ? (
        <p className="notice" role="status">The demo video is being finalized. Meanwhile, the recorded sample session shows a real run.</p>
      ) : (
        <p className="faint" role="status">Loading…</p>
      )}
      <section className="stack">
        <h2>What is real in this video</h2>
        <ul className="stack" style={{ paddingLeft: 20 }}>
          <li><strong>Real product, real output.</strong> Product screens are captures of the deployed app. Screen readings, interventions, learning content, the Practice scene and drafts came from Meta's models through that app: Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe and Muse Image. Practice feedback uses the app's rules over Muse Spark's image reading. The podcast and short voices are Kokoro-82M on Modal.</li>
          <li><strong>Scripted people, actual AI replies.</strong> The café owner is scripted and fictional; the Meta AI screens are actual replies to that script.</li>
          <li><strong>Assumed setup.</strong> The phone is assumed to stand beside the monitor: its screens come from a live run in a phone-sized browser with a controlled camera. The spoken answer was a synthetic voice; the film shows its waveform and the transcript exactly as stored, without playing that voice.</li>
          <li><strong>Labels.</strong> A tag on each scene says which run it comes from. The opening setup picture is an illustration. Practice shows a separate live sample with scripted briefs and a scripted choice; the second draft has a space for a real photo, which was never attached. The card check is a separate pinned Meta AI chat that began with a card from an earlier run; in our check Meta AI did not carry the rule into other new chats.</li>
          <li><strong>Narration</strong> is a synthetic voice (Kokoro-82M). Captions are available in the player.</li>
          <li><strong>Made during the hackathon.</strong> The Coevo Caddie app was newly implemented during this hackathon, based on my earlier Coevo concept.</li>
        </ul>
      </section>
      <div className="row wrap" style={{ gap: 12 }}>
        <a className="btn primary" href="/">Try it with your phone</a>
        <a className="btn" href="/practice-preview">Explore a practice scene</a>
        <a className="btn" href="/sample">Replay a recorded session</a>
        <a className="btn ghost" href="https://github.com/dkssudgo112/coevo-meta-hackathon">Source code</a>
      </div>
    </div>
  );
}
