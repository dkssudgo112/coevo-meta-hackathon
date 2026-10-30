import type { Moment } from '../../../../packages/contracts/index.ts';

/**
 * How many of the latest camera frames in a row the model could not read. Model and network errors
 * are not unreadable frames: they neither count nor break the run.
 */
export function illegibleRun(moments: Moment[]): number {
  let run = 0;
  for (let i = moments.length - 1; i >= 0; i--) {
    const m = moments[i];
    if (!m.frame || m.misread) continue;
    if (m.readingStatus === 'illegible') run++;
    else if (m.readingStatus === 'ok') break;
  }
  return run;
}

/** A model or network failure (not an unreadable frame, not a budget stop, not a restart). */
export function connectionTrouble(m: Moment | undefined): boolean {
  return !!m && !m.interrupted && (m.readingStatus === 'error' || (m.readingStatus === 'ok' && m.decision?.guardrail === 'decision-error'));
}

/** The server restarted while this moment was being read or decided (closed honestly, nothing invented). */
export function missedLook(m: Moment | undefined): boolean {
  return !!m?.interrupted;
}
