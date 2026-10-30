import { loadCreds } from './lib/api.ts';
import { Flag, PROVIDER_DATA_NOTICE } from './ui/common.tsx';

function onPhone(): boolean {
  try { return matchMedia('(pointer: coarse)').matches && innerWidth < 760; } catch { return false; }
}

/** A drawn diagram of the setup (not a screenshot): your AI tool on the monitor, the phone on a stand beside it. */
export function SetupDiagram() {
  return (
    <figure className="setup-figure">
      <svg viewBox="0 0 520 300" role="img" aria-labelledby="setup-title" className="setup-svg">
        <title id="setup-title">Drawing: a computer showing your AI tool, and a phone on a stand beside it with its camera aimed at the screen.</title>
        {/* desk */}
        <line x1="20" y1="262" x2="500" y2="262" className="sd-line" />
        {/* monitor */}
        <rect x="40" y="30" width="300" height="190" rx="12" className="sd-device" />
        <rect x="54" y="44" width="272" height="162" rx="6" className="sd-screen" />
        <path d="M175 220 h30 l8 30 h-46 z" className="sd-device" />
        <rect x="150" y="250" width="80" height="12" rx="4" className="sd-device" />
        {/* chat on screen */}
        <rect x="70" y="60" width="150" height="16" rx="8" className="sd-bubble" />
        <rect x="160" y="88" width="150" height="16" rx="8" className="sd-bubble-me" />
        <rect x="70" y="116" width="120" height="16" rx="8" className="sd-bubble" />
        <rect x="70" y="140" width="96" height="52" rx="6" className="sd-art" />
        <rect x="190" y="166" width="120" height="26" rx="13" className="sd-input" />
        {/* camera view */}
        <path d="M398 118 L326 52 L326 204 Z" className="sd-cone" />
        {/* phone on stand */}
        <rect x="392" y="74" width="74" height="146" rx="14" className="sd-device" />
        <rect x="400" y="86" width="58" height="122" rx="8" className="sd-phone-screen" />
        <circle cx="429" cy="80" r="2.5" className="sd-dot" />
        <rect x="408" y="138" width="42" height="30" rx="6" className="sd-card" />
        <path d="M404 220 l-12 42 h74 l-12 -42" className="sd-stand" />
        {/* labels */}
        <text x="190" y="290" textAnchor="middle" className="sd-label">Your AI tool, as usual</text>
        <text x="429" y="290" textAnchor="middle" className="sd-label">Caddie on your phone</text>
      </svg>
      <figcaption className="faint">Drawing of the setup, not a screenshot.</figcaption>
    </figure>
  );
}

const STEPS: { n: number; where: 'Computer' | 'Phone' | 'Both'; title: string; body: string }[] = [
  { n: 1, where: 'Computer', title: 'Open the Desk', body: 'It shows a pairing code, and afterwards keeps what each session left you.' },
  { n: 2, where: 'Phone', title: 'Scan the code', body: 'Use the phone’s camera app. The Caddie opens on the phone, connected to your Desk.' },
  { n: 3, where: 'Phone', title: 'Aim at your screen', body: 'Stand the phone beside the monitor and drag the box around your AI tool. Only that box is ever sent.' },
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
        <SetupDiagram />
      </section>

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
          <li><strong>When you are stuck, it asks one question</strong> in your own words — say, what one feeling “more premium” should give — and you answer out loud or type. It never writes the request for you.</li>
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
