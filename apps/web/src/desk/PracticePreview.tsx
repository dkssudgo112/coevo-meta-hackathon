import { useRef, useState } from 'react';
import type { DraftVerdict, Ingredients } from '../../../../packages/contracts/index.ts';
import { INGREDIENT_KEYS } from '../../../../packages/contracts/index.ts';
import { compareDrafts, DETAIL_NAME, judgeFeedback, names, seen } from '../../../../packages/core/src/practice.ts';
import { AssistLabel, Flag } from '../ui/common.tsx';
import { PRACTICE_RECORDING as run } from './practiceRecording.ts';
import type { RecordedDraft } from './practicePreview.ts';

const STEPS = ['The request', 'Judge the draft', 'See the feedback', 'Compare the revision'];
const STATUS = { shown: 'Shown', missing: 'Missing', unclear: 'Can’t tell' };
type Detail = keyof Ingredients;

function Poster({ draft, label }: { draft: RecordedDraft; label: string }) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  return <figure className="preview-poster">
    {failed ? <div className="notice" role="alert">The recorded image could not load. <button className="btn small" onClick={() => { setFailed(false); setRetry(x => x + 1); }}>Retry image</button></div>
      : <a href={draft.image} target="_blank" rel="noopener noreferrer" aria-label={`Open full-size ${label.toLowerCase()} in a new tab`}><img key={retry} src={draft.image} width={1280} height={1920} alt={label} onError={() => setFailed(true)} /></a>}
    <figcaption>{label}</figcaption>
  </figure>;
}

function Facts({ compact = false }: { compact?: boolean }) {
  return <details className="card notes preview-facts" open={!compact}>
    <summary>What Maya told the owner</summary>
    <dl>{INGREDIENT_KEYS.map(k => <div className="fact" key={k}><dt>{DETAIL_NAME[k]}</dt><dd>{run.scene.facts[k].text}</dd></div>)}</dl>
    <p className="faint">Fictional exercise facts. No real photo was attached in this run.</p>
  </details>;
}

function DraftDetails({ draft }: { draft: RecordedDraft }) {
  return <details className="card soft">
    <summary>Read the recorded brief</summary>
    <p className="quote" style={{ marginTop: 12 }}>{draft.brief}</p>
    <p className="faint">Typed, scripted input from the recorded run.</p>
  </details>;
}

/** A self-contained, read-only replay. Selections stay in React memory; no API, storage, camera or microphone. */
export function PracticePreview() {
  const [step, setStep] = useState(0);
  const [verdict, setVerdict] = useState<DraftVerdict | null>(null);
  const [fix, setFix] = useState<Detail | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const move = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => { title.current?.focus({ preventScroll: true }); title.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  };
  const feedback = verdict ? judgeFeedback(run.scene, run.first.ingredients, run.first.reading, { verdict, fix }) : null;
  const change = compareDrafts(run.scene, run.first.reading, run.revision.reading);
  const ready = !!verdict && (verdict !== 'fix' || !!fix);
  return <div className="landing practice-preview">
    <header className="row wrap"><Flag state="quiet" label="Coevo Caddie recorded practice" /><a href="/">Coevo Caddie</a><span className="tag">Recorded live run</span><a className="preview-home" href="/">Use Coevo with your phone →</a></header>
    <section className="stack preview-intro">
      <h1>Would you put this poster up?</h1>
      <p className="muted lead">After coaching a work session, Coevo can suggest a changed request to rehearse. Explore one in about a minute: read a colleague’s request, judge an AI draft, then compare the recorded revision.</p>
      <p className="faint">No sign-in or phone needed. These are saved Muse Spark and Muse Image outputs from October 31. Your choices explore the case locally; nothing is saved or generated.</p>
    </section>
    <ol className="preview-steps" aria-label="Practice walkthrough">
      {STEPS.map((text, i) => <li key={text} aria-current={step === i ? 'step' : undefined} className={step === i ? 'current' : i < step ? 'done' : ''}><span>{i + 1}</span>{text}</li>)}
    </ol>
    <h2 tabIndex={-1} ref={title} className="preview-step-title">{STEPS[step]}</h2>

    {step === 0 && <div className="preview-columns">
      <section className="stack">
        <div className="scene-stage"><img className="scene-bg" src={`/img/practice/${run.scene.setting}.jpg`} alt="Illustration of a fictional neighborhood café" /><span className="scene-tag">Illustrative scene</span></div>
        <div className="dialogue preview-dialogue"><div className="plate"><strong>{run.scene.speaker.name}</strong><span>{run.scene.speaker.role}</span></div>{run.scene.lines.map(line => <p key={line}>{line}</p>)}</div>
        <p className="faint">A fictional colleague, written by Muse Spark for this exercise.</p>
      </section>
      <section className="stack"><Facts /><div className="notice"><strong>The changed request</strong><p>{run.scene.changed}</p></div><button className="btn primary" onClick={() => move(1)}>See the first draft</button></section>
    </div>}

    {step === 1 && <div className="preview-columns">
      <section className="stack"><Poster draft={run.first} label="First draft · Muse Image" /><DraftDetails draft={run.first} /></section>
      <section className="stack"><Facts compact /><h3>What would you do with this draft?</h3><p className="faint">Look at the image and the notes before opening the Caddie’s reading.</p>
        {([{ value: 'ready', title: 'Put it up', sub: 'The draft is ready as it is.' }, { value: 'fix', title: 'Fix one detail', sub: 'Choose the detail you would change.' }, { value: 'redo', title: 'Start over', sub: 'The draft misses too much.' }] as const).map(c => <div key={c.value} className="stack" style={{ gap: 8 }}><button className="choice" aria-pressed={verdict === c.value} onClick={() => { setVerdict(c.value); if (c.value !== 'fix') setFix(null); }}><strong>{c.title}</strong><span>{c.sub}</span></button>{c.value === 'fix' && verdict === 'fix' && <div className="detail-chips" role="group" aria-label="Which detail would you fix?">{INGREDIENT_KEYS.map(k => <button className="chip" key={k} aria-pressed={fix === k} onClick={() => setFix(k)}>{DETAIL_NAME[k]}</button>)}</div>}</div>)}
        <button className="btn primary" disabled={!ready} onClick={() => move(2)}>See feedback on my choice</button><p className="faint">This explores saved evidence. It does not assess or record your ability.</p>
      </section>
    </div>}

    {step === 2 && feedback && <div className="preview-columns">
      <section className="stack"><Poster draft={run.first} label="The same first draft" /><details className="card"><summary>See every saved image observation</summary><ul className="seen-list" style={{ marginTop: 12 }}>{INGREDIENT_KEYS.map(k => <li key={k}><span className={`seen ${seen(run.scene, run.first.reading, k)}`}>{STATUS[seen(run.scene, run.first.reading, k)]}</span><span><strong>{DETAIL_NAME[k]}</strong> — {k === 'realPhoto' ? 'By rule: a generated image is never the owner’s photo.' : run.first.reading.items[k].evidence}</span></li>)}</ul></details></section>
      <section className="stack"><div className="dialogue caddie"><div className="plate"><strong>The Caddie</strong></div><p>{feedback.headline}</p></div>
        <p className="faint">The live app’s feedback rules applied to your selection and Muse Spark’s saved reading. No new model call.</p>
        {feedback.stakes.map(s => <blockquote className="card preview-reaction" key={s.key}><div className="eyebrow">Maya · if it went up this way</div><p>“{s.text}”</p></blockquote>)}
        <div className="card stack"><h3>What to change</h3><ul className="stack">{feedback.next.map(n => <li key={n}>{n}</li>)}</ul></div>
        <p className="faint">In the recorded run, the scripted owner chose “fix the price.” The next step shows that run’s revision, whatever you chose here.</p>
        <button className="btn primary" onClick={() => move(3)}>Compare the recorded revision</button>
      </section>
    </div>}

    {step === 3 && <section className="stack">
      <p className="lead">The second brief adds both prices and a place for the owner’s photo.</p>
      <div className="preview-columns preview-comparison"><section className="stack"><Poster draft={run.first} label="First draft" /><AssistLabel value={run.first.assistance} extra="recorded practice" /><DraftDetails draft={run.first} /></section><section className="stack"><Poster draft={run.revision} label="After one coached revision" /><AssistLabel value={run.revision.assistance} extra="recorded practice" /><DraftDetails draft={run.revision} /></section></div>
      <p className="faint">Open either image to inspect it full size.</p>
      <div className="preview-columns"><div className="card stack"><h3>Now visible in Muse Spark’s reading</h3><p>{names(change.now)}.</p><p className="muted">The saved reading found the $4.50 and $5.25 prices and the words “weekday morning commuters” in the revised draft.</p></div><div className="card stack"><h3>Still the owner’s job</h3><p>Place the real cup photo in the empty space. A generated placeholder is not that photo.</p><p className="faint">No score or measured learning gain. The first brief and image are preserved; the revision is marked “with the Caddie.”</p></div></div>
      <div className="notice"><strong>Bring it back to the work.</strong><p>In a real session, the Caddie can suggest a changed request to rehearse. You judge the AI’s result, keep the evidence, and return to that same session.</p></div>
      <div className="row wrap"><a className="btn primary" href="/">Use Coevo with your phone</a><a className="btn" href="/sample">See the Caddie during work</a><a className="btn" href="/demo">Watch the full demo</a></div>
    </section>}

    <footer className="stack preview-footer"><div className="row wrap">{step > 0 && <button className="btn ghost" onClick={() => move(step - 1)}>Back one step</button>}<button className="btn ghost" onClick={() => { setVerdict(null); setFix(null); move(0); }}>Start the walkthrough again</button><a href="/sample">Recorded work session</a></div>
      <p className="faint">Recorded sample, scripted people. The scene, briefs’ checks, images and image readings came from the deployed app; the original typed briefs and choice were scripted. The café backdrop is an illustration. Your selections here remain only in this page, and disappear when you leave or reload.</p>
    </footer>
  </div>;
}
