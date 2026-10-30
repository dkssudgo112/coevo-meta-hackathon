import type { Session } from '../../../../packages/contracts/index.ts';

export type CameraGate = { hasCrop: boolean; sessionStatus: Session['status'] | null; benchDone: boolean };

/**
 * The camera runs only while watching: before the first session (its first frame starts one) and
 * during a live session. Pause, an ended session and a finished benchmark turn the camera itself off.
 */
export function cameraShouldRun(g: CameraGate): boolean {
  return g.hasCrop && !g.benchDone && (g.sessionStatus === null || g.sessionStatus === 'live');
}

/** What the camera strip says while the camera is off. */
export function cameraOffMessage(g: CameraGate): string {
  if (g.sessionStatus === 'paused') return 'Paused — camera off, nothing is sent';
  if (g.benchDone) return 'Benchmark finished — camera off';
  if (g.sessionStatus === 'ended') return 'Session ended — camera off';
  return 'Camera off';
}
