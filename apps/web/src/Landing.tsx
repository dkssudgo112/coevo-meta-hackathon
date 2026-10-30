import { Flag, modelSourceLine, PROVIDER_DATA_NOTICE, useHealth } from './ui/common.tsx';

function onPhone(): boolean {
  try { return matchMedia('(pointer: coarse)').matches && innerWidth < 760; } catch { return false; }
}

export function Landing() {
  const phone = onPhone();
  const health = useHealth();
  const desk = (
    <div className="card choice" key="desk">
      <h3>On your computer</h3>
      <p className="muted">Open the Desk. It shows a code for your phone and keeps the evidence of each session.</p>
      <a className={`btn ${phone ? '' : 'primary'}`} href="/desk">Open the Desk</a>
    </div>
  );
  const caddie = (
    <div className="card choice" key="caddie">
      <h3>On your phone</h3>
      <p className="muted">Open the Caddie, point it at the Desk code, then prop it next to your monitor.</p>
      <a className={`btn ${phone ? 'primary' : ''}`} href="/caddie">Open the Caddie</a>
    </div>
  );
  return (
    <div className="landing">
      <div className="row"><Flag state="watching" /><span className="eyebrow">Coevo Caddie</span></div>
      <div className="stack">
        <h1>A caddie on the phone beside your screen.</h1>
        <p className="muted" style={{ fontSize: '1.1rem', maxWidth: 640 }}>It watches how you work with any AI — ChatGPT, Gemini, Meta AI, Claude — steps in only when it matters, and helps both you and your AI get better.</p>
      </div>
      <div className="choices">
        {phone ? [caddie, desk] : [desk, caddie]}
        <div className="card choice">
          <h3>No phone handy?</h3>
          <p className="muted">Replay a sample session. Screens are sample data. {modelSourceLine(health)}</p>
          <a className="btn" href="/sample">Try a sample session</a>
        </div>
      </div>
      <section className="stack">
        <h2>How it works</h2>
        <ol className="stack" style={{ paddingLeft: 20 }}>
          <li><strong>It watches quietly.</strong> Your phone’s camera reads your screen only when it changes. Only the boxed screen area is sent, to Meta’s Muse Spark model.</li>
          <li><strong>It steps in when you’re stuck.</strong> If you keep asking for “more premium”, it asks one question — who it’s for, the price — and you answer out loud. It doesn’t write the brief for you.</li>
          <li><strong>You and your AI both improve.</strong> After the session you get a note, a playbook, flashcards, a two-voice podcast and a short video, chosen for when you’ll use them. Approve a Caddie card and your AI starts asking first.</li>
        </ol>
      </section>
      <p className="faint">Evidence is labeled honestly: on your own, with the Caddie, AI wrote it, or not seen yet. Not seen yet never means you can’t.</p>
      <p className="faint">{PROVIDER_DATA_NOTICE}</p>
    </div>
  );
}
