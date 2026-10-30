import { useEffect, useState, type ReactNode } from 'react';
import type { Assistance, Moment, Snapshot } from '../../../../packages/contracts/index.ts';
import type { Creds } from '../lib/api.ts';
import { useMedia } from '../lib/media.ts';

export type FlagState = 'watching' | 'asking' | 'quiet' | 'off';

export function Flag({ state, label }: { state: FlagState; label?: string }) {
  return (
    <svg className="flag" data-state={state} viewBox="0 0 26 26" role="img" aria-label={label ?? `Caddie is ${state}`}>
      <path d="M6 3v20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path className="cloth" d="M7 4h12l-3.2 4L19 12H7z" fill="currentColor" />
    </svg>
  );
}

const LABEL_TEXT: Record<Assistance, string> = {
  independent: 'On your own',
  coached: 'With the Caddie',
  'ai-produced': 'AI wrote it',
  unobserved: 'Not seen yet',
};

export function AssistLabel({ value, extra }: { value: Assistance; extra?: string }) {
  return <span className={`label ${value}`} title={value}>{LABEL_TEXT[value]}{extra ? ` · ${extra}` : ''}</span>;
}

export function FixtureTag() {
  return <span className="tag fixture" title="Sample data from a scripted scenario, not a real user session">Sample data</span>;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function MediaImage({ creds, k, alt, className }: { creds: Creds | null; k: string | null | undefined; alt: string; className?: string }) {
  const { url, state } = useMedia(creds, k);
  if (!k) return <div className={className ?? 'thumb'}>Frame deleted</div>;
  if (state === 'gone') return <div className={className ?? 'thumb'}>Not available</div>;
  if (!url) return <div className={className ?? 'thumb'} aria-busy="true">Loading…</div>;
  return <img className={className ?? 'thumb'} src={url} alt={alt} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}

export const INGREDIENT_TEXT: Record<string, string> = {
  audience: 'who it’s for', price: 'a concrete number', mood: 'a concrete feeling', realPhoto: 'your own real material', productDetail: 'specific details',
};

export function latestSession(s: Snapshot | null) {
  return s ? [...s.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null : null;
}

export function sessionMoments(s: Snapshot | null, sessionId: string | null | undefined): Moment[] {
  if (!s || !sessionId) return [];
  return s.moments.filter(m => m.work.sessionId === sessionId).sort((a, b) => a.index - b.index);
}

/** Short human line for a moment in the flow. Model text where it exists, plain status otherwise. */
export function momentLine(m: Moment): { text: string; kind: 'caddie' | 'quiet' | 'change' | 'status' } {
  if (m.readingStatus === 'pending') return { text: 'Reading your screen…', kind: 'status' };
  if (m.readingStatus === 'disabled' || m.readingStatus === 'error' || m.readingStatus === 'budget') return { text: m.readingError ?? 'The Caddie could not read this frame.', kind: 'status' };
  if (m.readingStatus === 'illegible') return { text: 'Couldn’t read the screen in this frame.', kind: 'status' };
  if (m.decision?.action === 'intervene') return { text: `Caddie: ${m.decision.message}`, kind: 'caddie' };
  if (m.change) return { text: changeText(m), kind: 'change' };
  return { text: m.decision?.note ?? (m.decision?.reason ? `Quiet — ${m.decision.reason}` : 'Quiet'), kind: 'quiet' };
}

/** Human words for an observed change, e.g. "You added who it’s for, price." */
export function changeText(m: Moment): string {
  const c = m.change;
  if (!c) return '';
  const parts: string[] = [];
  if (c.addedIngredients.length) parts.push(`You added ${c.addedIngredients.map(k => INGREDIENT_TEXT[k] ?? k).join(', ')}.`);
  if (c.aiAskedFirst) parts.push('Your AI asked first.');
  return parts.join(' ');
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export interface HealthInfo { liveCallsEnabled: boolean; testFakeModels: boolean }

/** Server mode, so copy never claims live model output when it isn't. */
export function useHealth(): HealthInfo | null {
  const [h, setH] = useState<HealthInfo | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/health').then(r => r.json()).then(d => { if (live) setH({ liveCallsEnabled: Boolean(d.liveCallsEnabled), testFakeModels: Boolean(d.testFakeModels) }); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return h;
}

/** One honest sentence about who produces the Caddie's words right now. */
export function modelSourceLine(h: HealthInfo | null): string {
  if (!h) return 'The Caddie’s readings and replies come from Meta models when live calls are on.';
  if (h.testFakeModels) return 'Test build: a scripted fake model answers. Nothing is real model output.';
  if (!h.liveCallsEnabled) return 'Live model calls are off on this server right now, so the Caddie cannot respond. Nothing is simulated.';
  return 'The Caddie’s readings and replies are live Meta model output.';
}

/** Shown wherever screen content is sent. Accurate for this hackathon deployment's billing state. */
/** What leaves the phone, who receives it, how long Coevo keeps it, and how to delete it. */
export function DataTable() {
  const rows: [string, string, string, string][] = [
    ['Screen frames — only the boxed area, after the screen changed', 'This app’s server, then Meta Muse Spark to read it. For a short, the selected before and after frames also go to Modal to make the video', 'Discarded after reading unless it is evidence for a moment (a question, a change, the AI’s result); evidence stays in this workspace’s private storage', '“Delete frame” removes the stored image; a short already made from it keeps it until you delete the session'],
    ['One setup photo (the whole camera view), only if you tap “Find my screen”', 'Meta SAM 3.1, to find the monitor', 'Not stored', '—'],
    ['Spoken answers', 'Meta Muse Voice Transcribe; the text then goes to Muse Spark for the Caddie’s reply and your session content', 'Audio is not stored; the text is kept with the moment', 'Delete the session'],
    ['Typed answers', 'Meta Muse Spark, for the Caddie’s reply and your session content', 'Kept with the moment', 'Delete the session'],
    ['Practice briefs (spoken or typed)', 'Voice Transcribe if spoken, then Muse Spark to check it and Muse Image to draw it', 'The text, check and image are kept with the attempt', 'Delete the session (attempts opened in it)'],
    ['Note, playbook, flashcards, podcast, short', 'Written by Muse Spark from your session; the podcast script and the short’s narration and images go to Modal to make audio and video', 'Kept in this workspace until you delete them', 'Delete the session'],
    ['Approved Caddie cards', 'Shown to the model as your current rules while approved', 'Kept even after their session is deleted, because they are your rules now', 'Revoke the card'],
  ];
  return (
    <details className="data-table">
      <summary>What leaves this phone, and how long it stays</summary>
      <table>
        <thead><tr><th>What</th><th>Sent to</th><th>Kept by Coevo</th><th>Delete</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
      <p className="faint">Deleting here removes Coevo’s copies. It cannot delete what Meta or Modal keep under their own terms; see the note on free credits.</p>
    </details>
  );
}

export const PROVIDER_DATA_NOTICE = 'This hackathon deployment runs on Meta’s free developer credits. Meta’s billing page says content sent while free credits are in use may be used to improve its products. Use test content and keep personal information off your screen.';
