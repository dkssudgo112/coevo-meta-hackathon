import { loadCreds } from './lib/api.ts';
import { Flag, PROVIDER_DATA_NOTICE } from './ui/common.tsx';

function onPhone(): boolean {
  try { return matchMedia('(pointer: coarse)').matches && innerWidth < 760; } catch { return false; }
}

/** Generated instructional illustration (not a screenshot), reviewed before publication. */
export function SetupIllustration() {
  return (
    <figure className="setup-figure">
      <img src="/img/setup-guide.jpg" width={1672} height={941} alt="Illustration in three panels. 1, Connect: open the Desk on your computer and scan its QR code with your phone. 2, Aim: point your phone at the screen and tap Start watching. 3, Work: use your usual AI while the phone stands beside the monitor; the Caddie helps when it matters." />
      <figcaption className="faint">Illustration of the setup, not a screenshot of the app.</figcaption>
    </figure>
  );
}

const STEPS: { n: number; where: 'Computer' | 'Phone' | 'Both'; title: string; body: string }[] = [
  { n: 1, where: 'Computer', title: 'Open the Desk', body: 'It shows a pairing code, and afterwards keeps what each session left you.' },
  { n: 2, where: 'Phone', title: 'Scan the code', body: 'Use the phone’s camera app. The Caddie opens on the phone, connected to your Desk.' },
  { n: 3, where: 'Phone', title: 'Aim at your screen', body: 'Stand the phone beside the monitor and drag the box around your AI tool. While watching, only the boxed screen area is sent.' },
  { n: 4, where: 'Both', title: 'Start watching, keep working', body: 'Tap Start watching, then go back to ChatGPT, Gemini, Meta AI or Claude in your usual tab.' },
];

export function Landing() {
  const phone = onPhone();
  const paired = loadCreds('phone') !== null;
  return (
    <div className="landing">
      <div className="row"><Flag state="watching" /><span className="eyebrow">Coevo Caddie</span></div>
      <section className="hero">
        <div className="stack">
          <h1>A coach on the phone beside your screen.</h1>
          <p className="muted lead">Keep using your AI tool on your computer. The Caddie watches the screen from your phone, stays quiet while you are on track, and asks one short question when you are stuck.</p>
          {phone ? (
            paired ? (
              <div className="stack">
                <a className="btn primary" href="/caddie">Open your Caddie</a>
                <p className="faint">This phone is already connected to a Desk.</p>
              </div>
            ) : (
              <div className="stack">
                <p className="notice"><strong>Start on your computer.</strong> Open <strong>{location.host}</strong> there and choose <em>Start on this computer</em>. Then come back to this phone and scan the code it shows.</p>
                <a className="btn primary" href="/caddie">The code is on my screen — scan it</a>
              </div>
            )
          ) : (
            <div className="row wrap" style={{ gap: 12 }}>
              <a className="btn primary" href="/desk">Start on this computer</a>
              <span className="faint">Takes about a minute. You will need your phone.</span>
            </div>
          )}
        </div>
      </section>
      <SetupIllustration />

      <section className="stack" aria-labelledby="how-start">
        <h2 id="how-start">How to start</h2>
        <ol className="steps">
          {STEPS.map(s => (
            <li key={s.n} className="card step">
              <div className="row"><span className="step-n" aria-hidden="true">{s.n}</span><span className="tag">{s.where}</span></div>
              <h3>{s.title}</h3>
              <p className="muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="two-col" aria-label="What each device does">
        <div className="card stack">
          <h3>Your computer</h3>
          <p className="muted">Your AI tool, exactly as you use it today, plus the Desk. After a session the Desk holds a note, your playbook, flashcards, a short podcast and a short video, made only when the session earned them.</p>
        </div>
        <div className="card stack">
          <h3>Your phone</h3>
          <p className="muted">The camera on your screen, the Caddie’s question when it matters, and your answer, spoken or typed. Its Practice Range lets you try a new request and see what your words produce.</p>
        </div>
      </section>

      <section className="stack" aria-labelledby="what-happens">
        <h2 id="what-happens">What happens while you work</h2>
        <ol className="stack beats">
          <li><strong>It stays quiet while you are on track</strong>, and each time it says why.</li>
          <li><strong>When you are stuck, it asks one question</strong> in your own words — say, what one feeling “more premium” should give — and you answer out loud or type. It helps you decide what to add; if you ask it for an example, that example is labeled as AI-written.</li>
          <li><strong>After the session, you keep what helps</strong>: a note, a playbook, flashcards, a podcast and a short video, chosen for when you will use them.</li>
          <li><strong>Your AI learns too.</strong> Approve a Caddie card, start a pinned chat with it, and your AI asks the right questions first while the Caddie stays quiet.</li>
        </ol>
      </section>

      <section className="stack" aria-labelledby="see-first">
        <h2 id="see-first">Want to see it first?</h2>
        <div className="row wrap" style={{ gap: 12 }}>
          <a className="btn" href="/demo">Watch the three-minute demo</a>
          <a className="btn" href="/sample">Replay a recorded session</a>
        </div>
        <p className="faint">The recorded session replays one live run on a scripted, fictional café, with no new model calls.</p>
      </section>

      <p className="faint">{PROVIDER_DATA_NOTICE}</p>
    </div>
  );
}
