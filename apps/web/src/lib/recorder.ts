import { encodeWav, resample } from '../../../../packages/core/src/wav.ts';

/** Thrown by start() when cancel() came first (e.g. the screen closed while permission was pending). */
export class RecorderCancelled extends Error {
  constructor() { super('Recording was cancelled.'); this.name = 'RecorderCancelled'; }
}

interface AudioCtx {
  sampleRate: number;
  destination: unknown;
  createMediaStreamSource(s: MediaStream): { connect(n: unknown): void };
  createScriptProcessor(size: number, inCh: number, outCh: number): { onaudioprocess: ((e: { inputBuffer: { getChannelData(c: number): Float32Array } }) => void) | null; connect(n: unknown): void; disconnect(): void };
  close(): Promise<void>;
}
export interface RecorderDeps {
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  createContext: () => AudioCtx;
}
const browserDeps: RecorderDeps = {
  getUserMedia: c => navigator.mediaDevices.getUserMedia(c),
  createContext: () => new AudioContext() as unknown as AudioCtx,
};

/**
 * Microphone → 16 kHz mono 16-bit WAV (the format Muse Voice Transcribe accepts).
 * Cancel-safe: a stream that arrives after cancel() is stopped at once and no audio context
 * is started; a failed setup releases whatever it had already opened.
 */
export class Recorder {
  private ctx: AudioCtx | null = null;
  private stream: MediaStream | null = null;
  private node: ReturnType<AudioCtx['createScriptProcessor']> | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  private cancelled = false;
  private readonly deps: RecorderDeps;
  level = 0;

  constructor(deps: RecorderDeps = browserDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    if (this.cancelled) throw new RecorderCancelled();
    let stream: MediaStream | null = null;
    let ctx: AudioCtx | null = null;
    try {
      stream = await this.deps.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (this.cancelled) throw new RecorderCancelled();
      ctx = this.deps.createContext();
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      this.chunks = [];
      node.onaudioprocess = e => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        this.chunks.push(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
        this.level = Math.min(1, Math.sqrt(sum / (data.length / 16)) * 4);
      };
      src.connect(node);
      node.connect(ctx.destination);
      if (this.cancelled) { node.disconnect(); throw new RecorderCancelled(); }
      this.stream = stream;
      this.ctx = ctx;
      this.node = node;
      this.startedAt = performance.now();
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      await ctx?.close().catch(() => undefined);
      throw e;
    }
  }

  elapsed(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<{ wav: Uint8Array; seconds: number }> {
    const rate = this.ctx?.sampleRate ?? 48000;
    this.release();
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) { pcm.set(c, o); o += c.length; }
    this.chunks = [];
    const down = resample(pcm, rate, 16000);
    return { wav: encodeWav(down, 16000), seconds: down.length / 16000 };
  }

  /** Stop now, including a start() that is still waiting for permission. */
  cancel(): void {
    this.cancelled = true;
    this.release();
    this.chunks = [];
  }

  private release(): void {
    this.node?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.startedAt = 0;
  }
}
