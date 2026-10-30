// A recorded live run, replayed without any new model call. Everything the Caddie says here is the
// model output saved from one run through the deployed app (published with its exact hashes).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Assistance, ContentFormat, ContentItem, Snapshot } from '../../../../packages/contracts/index.ts';
import { AssistLabel, Flag, INGREDIENT_TEXT } from '../ui/common.tsx';
import { byFormat, ContentBody, FORMAT_NAME, ReplayContext } from '../ui/Players.tsx';

interface RecordedMoment {
  screen: string | null;
  atSec: number;
  session: number;
  reading: { tool: string | null; userRequest: string | null; aiAskedClarifyingQuestion: boolean; aiResponseSummary: string | null } | null;
  decision: { action: 'stay-quiet' | 'intervene'; step: string; message: string | null; note: string | null; reason: string; quote: string | null; missingIngredients: string[]; guardrail: string | null } | null;
  change: { summary: string; assistance: Assistance; addedIngredients: string[] } | null;
  timing: { mode: string; totalMs: number } | null;
}
interface RecordedRun {
  label: string;
  recordedOn: string;
  scenario: string;
  models: Record<string, string>;
  notes: string[];
  design: { habit: string; remainingConditions: string[]; counterpoint: string; formats: Record<string, { make: boolean; why: string }> } | null;
  moments: RecordedMoment[];
  content: Record<string, Record<string, unknown> & { status: string; whyNow: string }>;
  card: { text: string; targetTool: string; status: string } | null;
  cost: { metaUsd: number; mediaReservationUsd: number; note: string };
}
interface Manifest { frames: { file: string; caption: string; session: number }[] }

/** Load the recorded run if this build publishes one. */
export function useRecordedRun(): { run: RecordedRun | null; manifest: Manifest | null; state: 'loading' | 'ready' | 'none' } {
  const [run, setRun] = useState<RecordedRun | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');
  useEffect(() => {
    Promise.all([fetch('/samples/recorded/run.json'), fetch('/samples/manifest.json')])
      .then(async ([r, m]) => {
        if (!r.ok || !m.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('missing');
        setRun(await r.json()); setManifest(await m.json()); setState('ready');
      })
      .catch(() => setState('none'));
  }, []);
  return { run, manifest, state };
}

/** Recorded payloads → the same ContentItem shape the live players use (read-only, static media). */
function toItems(run: RecordedRun): ContentItem[] {
  const out: ContentItem[] = [];
  for (const [format, c] of Object.entries(run.content)) {
    const { status, whyNow, requestedByUser, audio, video, ...rest } = c as Record<string, unknown> & { status: string; whyNow: string };
    let payload: Record<string, unknown> = rest;
    if (format === 'note') payload = { ...rest, quotes: ((rest.quotes as { text: string }[]) ?? []).map(q => ({ text: q.text, momentId: null })) };
    if (format === 'flashcards') payload = { cards: ((rest.cards as Record<string, string>[]) ?? []).map((x, i) => ({ ...x, id: `rec-${i}`, dueAt: new Date().toISOString(), interval: 0, reviews: [] })) };
    if (format === 'podcast') payload = { ...rest, audioKey: `static:/samples/${audio as string}`, asks: [] };
    if (format === 'short') payload = { ...rest, videoKey: `static:/samples/${video as string}`, scenes: ((rest.scenes as Record<string, unknown>[]) ?? []).map(x => ({ ...x, imagePrompt: null, imageKey: null, evidenceFrameId: null })) };
    out.push({
      id: `rec-${format}`, sessionId: 'recorded', format: format as ContentFormat, status: status as ContentItem['status'], whyNow, sourceMomentIds: [],
      arriveAt: '', payload: payload as unknown as ContentItem['payload'], error: null, attempts: 1, provenance: 'live-model', updatedAt: '',
      ...(requestedByUser ? { requestedByUser: true } : {}),
    });
  }
  return out.sort(byFormat);
}

const EMPTY: Snapshot = {
  workspace: { id: 'recorded', createdAt: '', kind: 'sample', paired: false, liveCalls: false, testFakeModels: false, budget: { spentUsd: 0, capUsd: 0 } },
  sessions: [], moments: [], cards: [], content: [], practice: [], inbox: [], skills: [],
};

function NowPanel({ m }: { m: RecordedMoment }) {
  const d = m.decision;
  if (m.change) {
    return (
      <section className="now">
        <div className="eyebrow">Now · Seen</div>
        <p className="message">{m.change.addedIngredients.length ? `You added ${m.change.addedIngredients.map(k => INGREDIENT_TEXT[k] ?? k).join(', ')}.` : 'Your AI asked the clarifying questions first.'}</p>
        <div className="row"><AssistLabel value={m.change.assistance} /></div>
        {d?.note && <p className="faint">{d.note}</p>}
        <p className="faint">{m.change.addedIngredients.length
          ? 'How labels work: a change that follows a Caddie question is labeled “with the Caddie”. This owner’s brief was scripted in advance, so here it shows the rule, not a measured effect.'
          : 'An AI that asks first is labeled “with the Caddie” because a Caddie card caused it. This chat began with a card from an earlier run; this run’s own card was never applied.'}</p>
      </section>
    );
  }
  if (d?.action === 'intervene') {
    return (
      <section className="now asking">
        <div className="eyebrow">Now · {d.step === 'example' ? 'An example' : d.step === 'ingredients' ? 'What’s missing' : 'A question'}</div>
        <p className="message">{d.message}</p>
        {d.step !== 'question' && d.missingIngredients.length > 0 && <div className="row wrap">{d.missingIngredients.map(k => <span key={k} className="tag">{INGREDIENT_TEXT[k] ?? k}</span>)}</div>}
        <p className="faint">Why: {d.reason}</p>
        <p className="faint">In this run the owner did not answer; their next request came next.</p>
      </section>
    );
  }
  return (
    <section className="now">
      <div className="eyebrow">Now · Quiet</div>
      <p className="message" style={{ fontSize: '1.1rem' }}>{d?.note ?? d?.reason}</p>
      {d?.note && <p className="faint">Why quiet: {d.reason}</p>}
    </section>
  );
}

export function RecordedRunView({ run, manifest, onLive }: { run: RecordedRun; manifest: Manifest; onLive: () => void }) {
  const frames = run.moments.filter(m => m.screen);
  const s1 = frames.filter(m => m.session === 1);
  const s2 = frames.filter(m => m.session === 2);
  // Steps: each session-1 screen, the wrap, then the session-2 screen(s).
  const steps = useMemo(() => [...s1.map(m => ({ kind: 'moment' as const, m })), { kind: 'wrap' as const }, ...s2.map(m => ({ kind: 'moment' as const, m }))], [run]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const items = useMemo(() => toItems(run), [run]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = steps[i];

  useEffect(() => {
    if (!playing) return;
    if (i >= steps.length - 1 || steps[i].kind === 'wrap') { setPlaying(false); return; }
    timer.current = setTimeout(() => setI(x => x + 1), 4000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, i, steps]);

  const caption = (file: string | null) => manifest.frames.find(f => f.file === file)?.caption ?? '';
  // The flow shows only what has happened by this step.
  const flowUntil = step.kind === 'moment' ? frames.indexOf(step.m) : s1.length - 1;

  return (
    <ReplayContext.Provider value={true}>
      <div className="desk">
        <header className="desk-top">
          <Flag state="watching" />
          <h2 className="grow">Sample session <span className="tag">{run.label}</span></h2>
          <button className="btn small" onClick={onLive}>Run it live instead</button>
        </header>
        <div className="stack" style={{ gap: 4 }}>
          <p className="faint">Recorded {new Date(`${run.recordedOn}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} through the deployed app · {[...new Set(Object.values(run.models))].join(' · ')}. Replayed without new model calls.</p>
          <p className="faint">{run.scenario}</p>
          <p className="faint">Not in this replay: SAM 3.1 finds your screen during phone setup, and Muse Voice Transcribe turns spoken answers into text — this owner did not speak.</p>
        </div>
        <div className="split">
          <section className="stack">
            <div className="row"><span className="eyebrow grow">{step.kind === 'wrap' ? 'After session 1' : `Their screen · session ${step.m.session}`}</span><span className="faint">{i + 1} / {steps.length}</span></div>
            {step.kind === 'moment' && step.m.screen && <div className="screen-sim"><img src={`/samples/${step.m.screen}`} alt={caption(step.m.screen)} /></div>}
            {step.kind === 'moment' && <p className="muted">{caption(step.m.screen)}</p>}
            {step.kind === 'moment' && <p className="faint">Actual Meta AI reply · scripted, fictional café</p>}
            {step.kind === 'wrap' && <p className="muted">The session ended. The Caddie planned what was worth making, with a reason for each format. Open any of them on the right.</p>}
            <div className="row wrap">
              <button className="btn" disabled={i === 0} onClick={() => { setPlaying(false); setI(x => x - 1); }}>Back</button>
              {playing ? <button className="btn" onClick={() => setPlaying(false)}>Pause</button> : <button className="btn primary" disabled={i >= steps.length - 1} onClick={() => { if (steps[i].kind === 'wrap') setI(x => x + 1); setPlaying(true); }}>Play</button>}
              <button className="btn" disabled={i >= steps.length - 1} onClick={() => { setPlaying(false); setI(x => x + 1); }}>Next</button>
            </div>
          </section>
          <section aria-label="The Caddie on the phone">
            <div className="phone-frame">
              <div className="phone"><main className="stack">
                {step.kind === 'moment' ? <NowPanel m={step.m} /> : (
                  <section className="now">
                    <div className="eyebrow">Session wrap</div>
                    {run.design && <p className="message" style={{ fontSize: '1.15rem' }}>{run.design.habit}</p>}
                    {run.card && (
                      <div className="card stack" style={{ gap: 8 }}>
                        <div className="eyebrow">Caddie card · for {run.card.targetTool} · proposed</div>
                        <p style={{ fontFamily: 'var(--serif)' }}>{run.card.text}</p>
                        <p className="faint">In the app you approve, edit or reject it; approved cards go to the Desk to copy into your AI.</p>
                      </div>
                    )}
                    <div className="stack" style={{ gap: 6 }}>
                      {items.map(c => <button key={c.id} className={`btn ${open === c.id ? 'primary' : ''}`} style={{ justifyContent: 'space-between' }} onClick={() => setOpen(open === c.id ? null : c.id)}><span>{FORMAT_NAME[c.format]}</span><span className="faint">{c.requestedByUser ? 'made on request' : c.status}</span></button>)}
                    </div>
                  </section>
                )}
                <section className="stack" aria-label="This session">
                  <div className="eyebrow">This session</div>
                  {frames.slice(0, flowUntil + 1).filter(m => step.kind === 'wrap' || m.session === (step.kind === 'moment' ? step.m.session : 1)).reverse().map((m, n) => (
                    <div key={n} className="flow-item">
                      <time>+{Math.floor(m.atSec / 60)}:{String(m.atSec % 60).padStart(2, '0')}</time>
                      <span>{m.reading?.userRequest ? `“${m.reading.userRequest.slice(0, 80)}${m.reading.userRequest.length > 80 ? '…' : ''}” · ` : ''}{m.decision?.action === 'intervene' ? `Caddie: ${m.decision.message}` : m.decision?.note ?? m.decision?.reason}{m.timing ? <span className="faint"> · {(m.timing.totalMs / 1000).toFixed(1)} s</span> : null}</span>
                    </div>
                  ))}
                </section>
              </main></div>
            </div>
          </section>
        </div>
        {step.kind === 'wrap' && open && (() => { const c = items.find(x => x.id === open); return c ? <section className="card stack"><h3>{FORMAT_NAME[c.format]}</h3><ContentBody item={c} state={EMPTY} creds={null as never} /></section> : null; })()}
        <p className="faint">This run cost ${run.cost.metaUsd.toFixed(4)} in Meta usage plus a ${run.cost.mediaReservationUsd.toFixed(2)} media reservation. {run.cost.note}</p>
        {i === steps.length - 1 && (
          <div className="notice">{run.notes[2]} <button className="btn small" onClick={onLive}>Run it live yourself</button> <a className="btn small" href="/desk">Use it with your phone</a></div>
        )}
      </div>
    </ReplayContext.Provider>
  );
}
