"""Media composition for Coevo Caddie: podcast timelines and 9:16 shorts.

TTS-agnostic: callers pass a `speak(text, voice) -> (samples: np.ndarray float32, rate: int)`
function. Runs locally (tests use a synthetic tone) and on Modal (Kokoro TTS).
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from typing import Callable, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

Speak = Callable[[str, str], tuple[np.ndarray, int]]

W, H = 1080, 1920
RATE = 24000
GAP_S = 0.35
BG = (246, 243, 236)
INK = (29, 38, 34)
ACCENT = (31, 90, 68)
SOFT = (223, 233, 226)

MAX_LINES = 18
MAX_SCENES = 6
MAX_TEXT = 600


def _font(size: int, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/System/Library/Fonts/Supplemental/Georgia.ttf"]
        if serif
        else ["/usr/share/fonts/opentype/inter/Inter-Medium.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"]
    )
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def _to_wav_bytes(samples: np.ndarray, rate: int) -> bytes:
    pcm = np.clip(samples, -1, 1)
    pcm16 = (pcm * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm16.tobytes())
    return buf.getvalue()


def _resample(x: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst or len(x) == 0:
        return x.astype(np.float32)
    n = int(len(x) * dst / src)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


@dataclass
class Timeline:
    audio: np.ndarray
    rate: int
    timings: list[dict]

    @property
    def duration(self) -> float:
        return len(self.audio) / self.rate


def build_timeline(texts: Sequence[tuple[str, str]], speak: Speak, gap: float = GAP_S, lead: float = 0.25) -> Timeline:
    """Synthesize each (text, voice) clip and join with gaps, recording exact start/end seconds."""
    out: list[np.ndarray] = [np.zeros(int(lead * RATE), np.float32)]
    timings = []
    t = lead
    for i, (text, voice) in enumerate(texts):
        samples, rate = speak(text[:MAX_TEXT], voice)
        clip = _resample(np.asarray(samples, np.float32).reshape(-1), rate, RATE)
        dur = len(clip) / RATE
        timings.append({"index": i, "start": round(t, 3), "end": round(t + dur, 3)})
        out.append(clip)
        out.append(np.zeros(int(gap * RATE), np.float32))
        t += dur + gap
    return Timeline(np.concatenate(out), RATE, timings)


def _ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def render_podcast(lines: Sequence[dict], voices: dict, speak: Speak) -> dict:
    if not 1 <= len(lines) <= MAX_LINES:
        raise ValueError("podcast needs 1–18 lines")
    tl = build_timeline([(l["text"], voices.get(l["speaker"], voices.get("caddie", ""))) for l in lines], speak)
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "p.wav")
        m4a = os.path.join(d, "p.m4a")
        with open(wav, "wb") as f:
            f.write(_to_wav_bytes(tl.audio, tl.rate))
        _ffmpeg(["-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", m4a])
        data = open(m4a, "rb").read()
    return {"status": "done", "mime": "audio/mp4", "duration": round(tl.duration, 2), "timings": tl.timings, "data_b64": base64.b64encode(data).decode()}


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(img.convert("RGB"), size, method=Image.Resampling.LANCZOS)


def scene_background(scene: dict) -> Image.Image:
    """Full-bleed background: a scene image, the user's evidence frame on a card, or a diagram."""
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)
    b64 = scene.get("imageB64")
    if b64 and not scene.get("label"):
        canvas = _cover(Image.open(io.BytesIO(base64.b64decode(b64))), (W, H))
        shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shade).rectangle([0, int(H * 0.55), W, H], fill=(10, 14, 12, 150))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), shade).convert("RGB")
    elif b64:
        # Evidence: the user's real screen, shown as a framed card (never cropped away).
        frame = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
        frame.thumbnail((W - 120, int(H * 0.45)))
        x = (W - frame.width) // 2
        y = 260
        draw.rounded_rectangle([x - 12, y - 12, x + frame.width + 12, y + frame.height + 12], radius=28, fill=(255, 253, 248), outline=(221, 214, 200), width=3)
        canvas.paste(frame, (x, y))
    elif scene.get("diagram"):
        nodes = scene["diagram"].get("nodes", [])[:4]
        f = _font(52)
        top = 300
        for i, n in enumerate(nodes):
            y = top + i * 230
            draw.rounded_rectangle([140, y, W - 140, y + 150], radius=36, fill=(255, 253, 248) if i % 2 == 0 else SOFT, outline=ACCENT, width=4)
            lines = _wrap(draw, n, f, W - 360)[:2]
            for j, ln in enumerate(lines):
                draw.text((W // 2, y + 75 - (len(lines) - 1) * 32 + j * 64), ln, font=f, fill=INK, anchor="mm")
            if i < len(nodes) - 1:
                draw.line([W // 2, y + 150, W // 2, y + 230], fill=ACCENT, width=6)
                draw.polygon([(W // 2 - 18, y + 206), (W // 2 + 18, y + 206), (W // 2, y + 230)], fill=ACCENT)
    return canvas


def caption_overlay(text: str, label: str | None, title: str | None, dark: bool) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    fg = (246, 243, 236) if dark else INK
    if title:
        draw.text((80, 120), title, font=_font(58, serif=True), fill=fg)
    if label:
        f = _font(40)
        tw = draw.textlength(label, font=f)
        draw.rounded_rectangle([80, 180, 80 + tw + 60, 250], radius=35, fill=ACCENT)
        draw.text((110, 215), label, font=f, fill=(246, 243, 236), anchor="lm")
    f = _font(60)
    lines = _wrap(draw, text, f, W - 160)
    y = H - 160 - len(lines) * 78
    if not dark:
        draw.rounded_rectangle([50, y - 40, W - 50, H - 120], radius=40, fill=(255, 253, 248, 235))
    for i, ln in enumerate(lines):
        draw.text((80, y + i * 78), ln, font=f, fill=fg)
    return layer


def render_short(title: str, voice: str, scenes: Sequence[dict], speak: Speak, fps: int = 30) -> dict:
    if not 1 <= len(scenes) <= MAX_SCENES:
        raise ValueError("short needs 1–6 scenes")
    tl = build_timeline([(s["narration"], voice) for s in scenes], speak, gap=0.6)
    with tempfile.TemporaryDirectory() as d:
        segs = []
        for i, s in enumerate(scenes):
            start = tl.timings[i]["start"] if i else 0.0
            end = tl.timings[i + 1]["start"] if i + 1 < len(scenes) else tl.duration + 0.8
            dur = max(1.0, end - start)
            bg = scene_background(s)
            dark = bool(s.get("imageB64")) and not s.get("label")
            frame = Image.alpha_composite(bg.convert("RGBA"), caption_overlay(s["narration"], s.get("label"), title if i == 0 else None, dark)).convert("RGB")
            png = os.path.join(d, f"s{i}.png")
            frame.save(png)
            seg = os.path.join(d, f"s{i}.mp4")
            n = int(dur * fps)
            _ffmpeg(["-loop", "1", "-i", png, "-vf", f"scale={W * 2}:{H * 2},zoompan=z='1+0.04*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={fps},format=yuv420p", "-frames:v", str(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", seg])
            segs.append(seg)
        lst = os.path.join(d, "list.txt")
        with open(lst, "w") as f:
            f.write("\n".join(f"file '{p}'" for p in segs))
        video = os.path.join(d, "v.mp4")
        _ffmpeg(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
        wav = os.path.join(d, "a.wav")
        audio = np.concatenate([tl.audio, np.zeros(int(0.8 * tl.rate), np.float32)])
        with open(wav, "wb") as f:
            f.write(_to_wav_bytes(audio, tl.rate))
        out = os.path.join(d, "short.mp4")
        total = len(audio) / tl.rate
        _ffmpeg(["-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-ar", "48000", "-b:a", "128k", "-t", f"{total:.2f}", "-movflags", "+faststart", out])
        data = open(out, "rb").read()
    timings = [{"index": i, "start": (tl.timings[i]["start"] if i else 0.0), "end": (tl.timings[i + 1]["start"] if i + 1 < len(scenes) else round(total, 3))} for i in range(len(scenes))]
    return {"status": "done", "mime": "video/mp4", "duration": round(total, 2), "timings": timings, "data_b64": base64.b64encode(data).decode()}


def probe(path: str) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", path], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)
