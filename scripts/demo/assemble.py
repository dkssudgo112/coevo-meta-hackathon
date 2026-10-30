"""Assemble the three-minute demo from recorded clips and title cards, with burned-in English captions.

Usage: python3 scripts/demo/assemble.py edl.json
edl.json:
{
  "output": "out/demo.mp4",
  "segments": [
    {"card": {"title": "Coevo Caddie", "sub": "Built during the hackathon"}, "duration": 4, "caption": null},
    {"src": "clips/desk.mov", "in": 2.0, "out": 10.0, "caption": "A café owner makes a poster with Meta AI. The phone beside the monitor is the Caddie."}
  ]
}
Still segments hold an image, optionally over an audio excerpt:
    {"still": "frames/reply.jpg", "duration": 8, "audio": "podcast.m4a", "audio_in": 12.0, "crop": [0, 0, 1600, 1000], "caption": "..."}
Split segments put a PC recording (left) beside a phone recording (right):
    {"split": {"left": "clips/pc.mov", "left_in": 12.0, "right": "clips/phone.mov", "right_in": 3.5}, "duration": 20, "caption": "..."}
Clips are letterboxed into 1920x1080. Audio from clips is kept (split: left audio); cards are silent.
Needs ffmpeg and Pillow. No model calls.
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
BG = (246, 243, 236)
INK = (29, 38, 34)
ACCENT = (31, 90, 68)


def font(size, serif=False):
    for p in (["/System/Library/Fonts/Supplemental/Georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"] if serif else ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def wrap(draw, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textlength(t, font=f) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def caption_png(text, path):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if text:
        d = ImageDraw.Draw(img)
        f = font(44)
        lines = wrap(d, text, f, W - 360)[:3]
        h = len(lines) * 58 + 40
        y = H - 70 - h
        d.rounded_rectangle([140, y, W - 140, y + h], radius=24, fill=(18, 24, 21, 215))
        for i, ln in enumerate(lines):
            d.text((W // 2, y + 20 + i * 58 + 29), ln, font=f, fill=(246, 243, 236), anchor="mm")
    img.save(path)


def card_png(card, path):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((W // 2, H // 2 - 40), card.get("title", ""), font=font(96, serif=True), fill=INK, anchor="mm")
    if card.get("sub"):
        d.text((W // 2, H // 2 + 60), card["sub"], font=font(40), fill=ACCENT, anchor="mm")
    img.save(path)


def run(args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def has_audio(src):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", src], capture_output=True, text=True)
    return bool(r.stdout.strip())


def main(edl_path):
    edl = json.load(open(edl_path))
    base = os.path.dirname(os.path.abspath(edl_path))
    out = os.path.join(base, edl["output"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        parts = []
        for i, seg in enumerate(edl["segments"]):
            cap = os.path.join(d, f"cap{i}.png")
            caption_png(seg.get("caption"), cap)
            part = os.path.join(d, f"p{i}.mp4")
            if "split" in seg:
                sp = seg["split"]
                dur = seg["duration"]
                left, right = os.path.join(base, sp["left"]), os.path.join(base, sp["right"])
                vf = (f"color=c=0x141917:s={W}x{H}:r={FPS}:d={dur}[bg];"
                      f"[0:v]scale=1240:840:force_original_aspect_ratio=decrease,fps={FPS}[l];"
                      f"[1:v]scale=-2:840,fps={FPS}[r];"
                      f"[bg][l]overlay=x=60:y=40+(840-h)/2[t1];[t1][r]overlay=x=W-w-80:y=40[t2];"
                      f"[t2][2:v]overlay=0:0,format=yuv420p[v]")
                audio = ["-map", "0:a"] if has_audio(left) else ["-map", "3:a"]
                extra = [] if has_audio(left) else ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
                run(["-ss", str(sp.get("left_in", 0)), "-t", str(dur), "-i", left, "-ss", str(sp.get("right_in", 0)), "-t", str(dur), "-i", right, "-i", cap, *extra,
                     "-filter_complex", vf, "-map", "[v]", *audio, "-t", str(dur), "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", part])
            elif "still" in seg:
                # An image held on screen, optionally over an audio excerpt (e.g. the podcast).
                img = os.path.join(base, seg["still"])
                dur = seg.get("duration", 5)
                # Optional crop [x0, y0, x1, y1] in source pixels, so small UI text fills the frame.
                crop = ""
                if seg.get("crop"):
                    x0, y0, x1, y1 = seg["crop"]
                    crop = f"crop={x1 - x0}:{y1 - y0}:{x0}:{y0},"
                vf = f"[0:v]{crop}scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x141917,fps={FPS}[b];[b][1:v]overlay=0:0,format=yuv420p[v]"
                if seg.get("audio"):
                    aud = ["-ss", str(seg.get("audio_in", 0)), "-t", str(dur), "-i", os.path.join(base, seg["audio"])]
                else:
                    aud = ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
                run(["-loop", "1", "-t", str(dur), "-i", img, "-i", cap, *aud, "-filter_complex", vf, "-map", "[v]", "-map", "2:a",
                     "-r", str(FPS), "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-t", str(dur), part])
            elif "card" in seg:
                bg = os.path.join(d, f"card{i}.png")
                card_png(seg["card"], bg)
                dur = seg.get("duration", 4)
                run(["-loop", "1", "-t", str(dur), "-i", bg, "-i", cap, "-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo",
                     "-filter_complex", "[0:v][1:v]overlay=0:0,format=yuv420p[v]", "-map", "[v]", "-map", "2:a", "-r", str(FPS), "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-shortest", part])
            else:
                src = os.path.join(base, seg["src"])
                dur = seg["out"] - seg["in"]
                vf = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x141917,fps={FPS}[b];[b][1:v]overlay=0:0,format=yuv420p[v]"
                audio = ["-map", "0:a"] if has_audio(src) else []
                extra = [] if audio else ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
                amap = audio or ["-map", "2:a"]
                run(["-ss", str(seg["in"]), "-t", str(dur), "-i", src, "-i", cap, *extra, "-filter_complex", vf, "-map", "[v]", *amap, "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", part])
            parts.append(part)
        lst = os.path.join(d, "list.txt")
        open(lst, "w").write("\n".join(f"file '{p}'" for p in parts))
        run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out])
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True)
    total = float(r.stdout.strip() or 0)
    print(json.dumps({"output": out, "seconds": round(total, 1), "under_3_min": total <= 180}))


if __name__ == "__main__":
    main(sys.argv[1])
