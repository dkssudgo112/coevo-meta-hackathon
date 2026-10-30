import { encodeWav, resample } from '../../../../packages/core/src/wav.ts';

/** Microphone → 16 kHz mono 16-bit WAV (the format Muse Voice Transcribe accepts). */
export class Recorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  level = 0;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = e => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
      this.level = Math.min(1, Math.sqrt(sum / (data.length / 16)) * 4);
    };
    src.connect(this.node);
    this.node.connect(this.ctx.destination);
    this.startedAt = performance.now();
  }

  elapsed(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<{ wav: Uint8Array; seconds: number }> {
    const rate = this.ctx?.sampleRate ?? 48000;
    this.node?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    await this.ctx?.close();
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) { pcm.set(c, o); o += c.length; }
    this.chunks = [];
    this.startedAt = 0;
    const down = resample(pcm, rate, 16000);
    return { wav: encodeWav(down, 16000), seconds: down.length / 16000 };
  }

  cancel(): void {
    this.node?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.chunks = [];
    this.startedAt = 0;
  }
}
