// PCM → WAV (mono, 16-bit) for Muse Voice Transcribe, which accepts
// 16 or 24 kHz mono 16-bit PCM WAV. Used in the browser recorder.

/** Linear resample of mono float samples. */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export function wavDurationSeconds(bytes: Uint8Array): number {
  if (bytes.length < 44) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = view.getUint32(24, true);
  const dataLen = view.getUint32(40, true);
  const channels = view.getUint16(22, true) || 1;
  return rate ? dataLen / (rate * 2 * channels) : 0;
}

export interface WavInfo { sampleRate: number; channels: number; bitsPerSample: number; seconds: number }

/**
 * Validate a WAV for Muse Voice Transcribe (RIFF/WAVE, PCM, mono, 16-bit,
 * 16 or 24 kHz) and compute its duration from the bytes. Returns null when
 * invalid, so cost is never derived from a client-provided duration.
 */
export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let dataLen = -1;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const len = v.getUint32(o + 4, true);
    if (id === 'fmt ' && len >= 16 && o + 24 <= bytes.length) {
      fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === 'data') {
      dataLen = Math.min(len, bytes.length - (o + 8));
      break;
    }
    o += 8 + len + (len % 2);
  }
  if (!fmt || dataLen < 0) return null;
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || (fmt.rate !== 16000 && fmt.rate !== 24000)) return null;
  return { sampleRate: fmt.rate, channels: 1, bitsPerSample: 16, seconds: dataLen / (fmt.rate * 2) };
}
