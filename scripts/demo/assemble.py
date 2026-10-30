"""Assemble the three-minute demo from recorded clips and title cards, with burned-in English captions.

Usage: python3 scripts/demo/assemble.py edl.json
edl.json:
{
  "output": "out/demo.mp4",
  "segments": [
    {"card": {"title": "Coevo Caddie", "sub": "Built during the hackathon"}, "duration": 4, "caption": null},
    {"src": "clips/desk.mov", "in": 2.0, "out": 10.0, "crop": [0, 0, 1920, 1080], "caption": "A café owner makes a poster with Meta AI. The phone beside the monitor is the Caddie."}
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


def caption_png(text, path, tag=None, bottom=70):
    """Caption box near the bottom; an optional small tag (top left) names which run a scene comes from."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if text:
        f = font(44)
        lines = wrap(d, text, f, W - 360)[:3]
        h = len(lines) * 58 + 40
        y = H - bottom - h
        d.rounded_rectangle([140, y, W - 140, y + h], radius=24, fill=(18, 24, 21, 215))
        for i, ln in enumerate(lines):
            d.text((W // 2, y + 20 + i * 58 + 29), ln, font=f, fill=(246, 243, 236), anchor="mm")
    if tag:
        tf = font(28)
        w = d.textlength(tag, font=tf)
        d.rounded_rectangle([24, 14, 24 + w + 36, 58], radius=20, fill=(31, 90, 68, 230))
        d.text((24 + 18, 36), tag, font=tf, fill=(246, 243, 236), anchor="lm")
    img.save(path)


PHONE_TOP, PHONE_H = 70, 830


def rounded(im, r):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=r, fill=255)
    return mask


def phone_png(seg, base, path):
    """The actual AI screen on a monitor (left) beside the actual phone screen (right), or one or two
    phone screens alone. Images are pasted as captured; only scaling and an optional crop are applied."""
    img = Image.new("RGB", (W, H), (20, 25, 23))
    d = ImageDraw.Draw(img)
    ph = seg.get("height", PHONE_H)

    def load(spec):
        spec = spec if isinstance(spec, dict) else {"src": spec}
        im = Image.open(os.path.join(base, spec["src"])).convert("RGB")
        if spec.get("crop"):
            im = im.crop(tuple(spec["crop"]))
        h = spec.get("height", ph)  # a cropped screen keeps the same scale by giving its own height
        s = h / im.height
        return im.resize((round(im.width * s), h), Image.LANCZOS)

    def paste_phone(im, x):
        y = PHONE_TOP + (PHONE_H - im.height) // 2
        d.rounded_rectangle([x - 12, y - 12, x + im.width + 12, y + im.height + 12], radius=40, fill=(6, 6, 6))
        img.paste(im, (x, y), rounded(im, 30))

    phones = [load(p) for p in (seg["phones"] if "phones" in seg else [seg["phone"]])]
    if seg.get("screen"):
        sw, sh = 1160, 725  # 16:10 monitor screen
        mx, my = 90, PHONE_TOP + 10
        d.rounded_rectangle([mx - 18, my - 18, mx + sw + 18, my + sh + 18], radius=14, fill=(12, 12, 12))
        d.rectangle([mx + sw // 2 - 70, my + sh + 18, mx + sw // 2 + 70, my + sh + 70], fill=(40, 40, 40))
        shot = Image.open(os.path.join(base, seg["screen"])).convert("RGB")
        fill = shot.getpixel((2, shot.height // 2))
        d.rectangle([mx, my, mx + sw, my + sh], fill=fill)
        s = min(sw / shot.width, sh / shot.height)
        shot = shot.resize((round(shot.width * s), round(shot.height * s)), Image.LANCZOS)
        img.paste(shot, (mx + (sw - shot.width) // 2, my + (sh - shot.height) // 2))
        paste_phone(phones[0], W - 100 - phones[0].width)
    else:
        gap = 90
        total = sum(p.width for p in phones) + gap * (len(phones) - 1)
        x = (W - total) // 2
        for p in phones:
            paste_phone(p, x)
            x += p.width + gap
    img.save(path)


def card_png(card, path):
    """Title and subtitle wrap to the frame; a long title steps down in size instead of running off the edge."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    size = 96
    while True:
        tf = font(size, serif=True)
        title = wrap(d, card.get("title", ""), tf, W - 240)
        if len(title) <= 2 or size <= 56:
            break
        size -= 8
    sf = font(44 if card.get("lines") else 40)
    # "lines": short lines shown one per row (easier to read than one long wrapped sentence).
    sub = [ln for x in card["lines"] for ln in wrap(d, x, sf, W - 360)] if card.get("lines") else (wrap(d, card.get("sub", ""), sf, W - 360)[:3] if card.get("sub") else [])
    th, sh, gap = int(size * 1.2), (62 if card.get("lines") else 54), 40
    total = len(title) * th + (gap + len(sub) * sh if sub else 0)
    y = (H - total) // 2
    for ln in title:
        d.text((W // 2, y + th // 2), ln, font=tf, fill=INK, anchor="mm")
        y += th
    y += gap
    for ln in sub:
        d.text((W // 2, y + sh // 2), ln, font=sf, fill=ACCENT, anchor="mm")
        y += sh
    img.save(path)


def run(args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def has_audio(src):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", src], capture_output=True, text=True)
    return bool(r.stdout.strip())


def preflight(edl, base):
    """Refuse to render a cut with unfilled clip slots, missing files, placeholder captions or a plan over 3 minutes."""
    problems, planned = [], 0.0
    for i, seg in enumerate(edl["segments"]):
        label = seg.get("mark") or seg.get("src") or seg.get("still") or seg.get("phone") or "card"
        files = [seg[k] for k in ("src", "still", "audio", "screen") if seg.get(k)]
        files += [p if isinstance(p, str) else p["src"] for p in (seg.get("phones") or ([seg["phone"]] if seg.get("phone") else []))]
        for f in files:
            if not os.path.exists(os.path.join(base, f)):
                problems.append(f"segment {i} ({label}): missing file {f}")
        if "src" in seg:
            if not isinstance(seg.get("in"), (int, float)) or not isinstance(seg.get("out"), (int, float)) or seg["out"] <= seg["in"]:
                problems.append(f"segment {i} ({label}): in/out not set")
            else:
                planned += seg["out"] - seg["in"]
        else:
            planned += seg.get("duration", 4 if "card" in seg else 5)
        if (seg.get("caption") or "").startswith("TODO"):
            problems.append(f"segment {i} ({label}): caption still a placeholder")
    if planned > 180:
        problems.append(f"planned length {planned:.1f} s is over 180 s")
    if problems:
        sys.exit("Not rendering:\n- " + "\n- ".join(problems))


def main(edl_path):
    edl = json.load(open(edl_path))
    base = os.path.dirname(os.path.abspath(edl_path))
    preflight(edl, base)
    out = os.path.join(base, edl["output"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        parts = []
        for i, seg in enumerate(edl["segments"]):
            cap = os.path.join(d, f"cap{i}.png")
            is_phone = "phone" in seg or "phones" in seg
            caption_png(seg.get("caption"), cap, seg.get("tag"), bottom=16 if is_phone else 70)
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
            elif "still" in seg or is_phone:
                # An image held on screen, optionally over an audio excerpt (e.g. the podcast or a spoken answer).
                if is_phone:
                    img = os.path.join(d, f"phone{i}.png")
                    phone_png(seg, base, img)
                else:
                    img = os.path.join(base, seg["still"])
                dur = seg.get("duration", 5)
                # Optional crop [x0, y0, x1, y1] in source pixels, so small UI text fills the frame.
                crop = ""
                if seg.get("crop") and not is_phone:
                    x0, y0, x1, y1 = seg["crop"]
                    crop = f"crop={x1 - x0}:{y1 - y0}:{x0}:{y0},"
                vf = f"[0:v]{crop}scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x141917,fps={FPS}[b];[b][1:v]overlay=0:0,format=yuv420p[v]"
                if seg.get("audio"):
                    aud = ["-ss", str(seg.get("audio_in", 0)), "-t", str(dur), "-i", os.path.join(base, seg["audio"])]
                else:
                    aud = ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
                # Optional start delay; audio shorter than the scene is padded with silence so parts stay in sync.
                delay = int(seg.get("audio_delay", 0) * 1000)
                vf += f";[2:a]aresample=48000,aformat=channel_layouts=stereo,adelay={delay}|{delay},apad,atrim=0:{dur}[a]"
                run(["-loop", "1", "-t", str(dur), "-i", img, "-i", cap, *aud, "-filter_complex", vf, "-map", "[v]", "-map", "[a]",
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
                crop = ""
                if seg.get("crop"):
                    x0, y0, x1, y1 = seg["crop"]
                    crop = f"crop={x1 - x0}:{y1 - y0}:{x0}:{y0},"
                vf = f"[0:v]{crop}scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x141917,fps={FPS}[b];[b][1:v]overlay=0:0,format=yuv420p[v]"
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
