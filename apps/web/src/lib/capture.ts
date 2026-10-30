import type { CaptureSource, CropRect } from '../../../../packages/contracts/index.ts';
import { ChangeDetector, toGray, type ChangeVerdict } from '../../../../packages/core/src/change.ts';
import type { Creds } from './api.ts';

export const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/** Draw the crop region of a video into a canvas, scaled to fit maxW. Only this region ever leaves the device. */
export function drawCrop(video: HTMLVideoElement, crop: CropRect, canvas: HTMLCanvasElement, maxW: number): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const sx = crop.x * vw, sy = crop.y * vh, sw = crop.w * vw, sh = crop.h * vh;
  const scale = Math.min(1, maxW / sw);
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return false;
  g.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return true;
}

export function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', quality));
}

export interface SentTiming {
  /** Epoch ms when a change from the last sent frame was first seen (null if unknown). */
  changeAt: number | null;
  /** Epoch ms when the upload started. */
  sentAt: number;
}

export interface SamplerEvents {
  onVerdict?: (v: ChangeVerdict) => void;
  onSent?: (momentId: string, timing: SentTiming) => void;
  onError?: (message: string, status?: number) => void;
}

/**
 * Samples the cropped screen every 700 ms, runs on-device change detection and
 * uploads a frame only after the screen changed and settled.
 */
export class FrameSampler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private detector = new ChangeDetector();
  private thumb = document.createElement('canvas');
  private full = document.createElement('canvas');
  private busy = false;
  private changeAt: number | null = null;
  /** Epoch ms after which one unchanged, settled frame is sent anyway (quiet retry after an unreadable frame). */
  private retryAt: number | null = null;
  crop: CropRect;
  private readonly video: HTMLVideoElement;
  private readonly creds: Creds;
  private readonly source: CaptureSource;
  private readonly events: SamplerEvents;
  /** Disclosed benchmark test mode: frames are tagged and kept for evaluation (max 20 on the server). */
  benchmark = false;

  constructor(video: HTMLVideoElement, creds: Creds, crop: CropRect, source: CaptureSource, events: SamplerEvents) {
    this.video = video;
    this.creds = creds;
    this.crop = crop;
    this.source = source;
    this.events = events;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 700);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reset(crop?: CropRect): void {
    if (crop) this.crop = crop;
    this.detector.reset();
    this.retryAt = null;
  }

  /** Send the same view once more after a short pause, even if nothing changed (the last one was unreadable). */
  retrySoon(ms = 1500): void {
    this.retryAt = Date.now() + ms;
  }

  private async tick(): Promise<void> {
    if (this.busy || document.hidden) return;
    if (!drawCrop(this.video, this.crop, this.thumb, 64)) return;
    const g = this.thumb.getContext('2d', { willReadFrequently: true })!;
    const px = g.getImageData(0, 0, this.thumb.width, this.thumb.height).data;
    const verdict = this.detector.sample(toGray(px), performance.now());
    this.events.onVerdict?.(verdict);
    if (verdict.kind === 'unchanged') this.changeAt = null;
    else if (verdict.kind !== 'camera-moved' && this.changeAt === null) this.changeAt = Date.now();
    const retry = verdict.kind === 'unchanged' && this.retryAt !== null && Date.now() >= this.retryAt;
    if (verdict.kind !== 'send' && !retry) return;
    this.retryAt = null;
    this.busy = true;
    const timing: SentTiming = { changeAt: this.changeAt, sentAt: Date.now() };
    this.changeAt = null;
    try {
      drawCrop(this.video, this.crop, this.full, 1280);
      const blob = await canvasJpeg(this.full);
      const id = await uploadFrame(this.creds, blob, this.source, true, this.benchmark);
      this.events.onSent?.(id, timing);
    } catch (e) {
      const err = e as Error & { status?: number };
      this.events.onError?.(err.message, err.status);
    } finally {
      this.busy = false;
    }
  }
}

export async function uploadFrame(creds: Creds, blob: Blob, source: CaptureSource, deviceCropped: boolean, benchmark = false): Promise<string> {
  const fd = new FormData();
  if (benchmark) fd.append('benchmark', 'true');
  fd.append('frame', new File([blob], 'frame.jpg', { type: blob.type || 'image/jpeg' }));
  fd.append('source', source);
  fd.append('deviceCropped', String(deviceCropped));
  fd.append('capturedAt', new Date().toISOString());
  const res = await fetch(`/api/w/${creds.workspaceId}/frames`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${creds.token}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? 'Upload failed.'), { status: res.status });
  return data.momentId as string;
}

/** Downscale an image file and crop it to a region before upload. */
export async function cropImageFile(file: File, crop: CropRect, maxW = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  const sw = crop.w * bmp.width, sh = crop.h * bmp.height;
  const scale = Math.min(1, maxW / sw);
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  c.getContext('2d')!.drawImage(bmp, crop.x * bmp.width, crop.y * bmp.height, sw, sh, 0, 0, c.width, c.height);
  return canvasJpeg(c);
}

export async function startRearCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play();
  return stream;
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop());
}

export function vibrate(pattern: number | number[]): boolean {
  try {
    return typeof navigator.vibrate === 'function' ? navigator.vibrate(pattern) : false;
  } catch {
    return false;
  }
}
