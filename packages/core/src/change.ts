// Frame-change detection that runs on the phone. No model is involved.
// The phone samples a tiny grayscale thumbnail of the device-cropped screen
// region. A frame is sent only when the screen changed since the last sent
// frame AND has settled (an AI response finished streaming).

export interface ChangeOptions {
  /** Mean absolute difference (0..1) vs the last sent frame that counts as a change. */
  changeThreshold: number;
  /** Max difference (0..1) between consecutive samples to count as settled. */
  settleThreshold: number;
  /** Consecutive settled samples required before sending. */
  settleSamples: number;
  /** Minimum milliseconds between two sends. */
  minIntervalMs: number;
  /** Difference above which we assume the camera itself moved. */
  motionThreshold: number;
}

export const DEFAULT_CHANGE_OPTIONS: ChangeOptions = {
  changeThreshold: 0.035,
  settleThreshold: 0.012,
  settleSamples: 2,
  minIntervalMs: 4000,
  motionThreshold: 0.3,
};

export type ChangeVerdict =
  | { kind: 'send'; diff: number }
  | { kind: 'settling'; diff: number }
  | { kind: 'unchanged'; diff: number }
  | { kind: 'cooldown'; diff: number }
  | { kind: 'camera-moved'; diff: number };

export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
}

export class ChangeDetector {
  private lastSent: Uint8Array | null = null;
  private previous: Uint8Array | null = null;
  private settled = 0;
  private lastSentAt = -Infinity;
  private readonly opts: ChangeOptions;

  constructor(opts: Partial<ChangeOptions> = {}) {
    this.opts = { ...DEFAULT_CHANGE_OPTIONS, ...opts };
  }

  /** Feed one thumbnail sample. Returns whether to send the full frame now. */
  sample(thumb: Uint8Array, nowMs: number): ChangeVerdict {
    const prev = this.previous;
    this.previous = thumb;
    const step = prev ? meanAbsDiff(prev, thumb) : 0;
    if (prev && step > this.opts.motionThreshold) {
      this.settled = 0;
      return { kind: 'camera-moved', diff: step };
    }
    this.settled = prev && step <= this.opts.settleThreshold ? this.settled + 1 : 0;
    const vsSent = this.lastSent ? meanAbsDiff(this.lastSent, thumb) : 1;
    if (vsSent < this.opts.changeThreshold) return { kind: 'unchanged', diff: vsSent };
    if (this.settled < this.opts.settleSamples) return { kind: 'settling', diff: vsSent };
    if (nowMs - this.lastSentAt < this.opts.minIntervalMs) return { kind: 'cooldown', diff: vsSent };
    this.lastSent = thumb;
    this.lastSentAt = nowMs;
    return { kind: 'send', diff: vsSent };
  }

  /** Forget the reference frame, e.g. after re-aiming the camera. */
  reset(): void {
    this.lastSent = null;
    this.previous = null;
    this.settled = 0;
  }
}

/** Convert RGBA pixels to a grayscale thumbnail (luma). */
export function toGray(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}
