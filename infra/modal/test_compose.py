"""Local checks for media composition with a synthetic tone instead of TTS (no Modal, no models).

Run: python3 infra/modal/test_compose.py
"""
import base64
import io
import os
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import compose  # noqa: E402


def tone_speak(text: str, voice: str):
    # ~155 words per minute, like real narration, so durations are realistic.
    seconds = max(0.6, len(text.split()) / 155 * 60)
    t = np.linspace(0, seconds, int(seconds * 24000), endpoint=False)
    freq = 220 if voice.startswith("a") else 330
    return (0.1 * np.sin(2 * np.pi * freq * t)).astype(np.float32), 24000


def png_b64(color, size=(1024, 1536)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def main():
    lines = [{"speaker": "caddie" if i % 2 == 0 else "guest", "text": " ".join(["word"] * 30)} for i in range(10)]
    p = compose.render_podcast(lines, {"caddie": "af_heart", "guest": "am_michael"}, tone_speak)
    assert p["duration"] >= 60, p["duration"]
    assert len(p["timings"]) == 10 and all(t["end"] > t["start"] for t in p["timings"])
    assert all(p["timings"][i]["end"] <= p["timings"][i + 1]["start"] for i in range(9))
    print(f"podcast ok: {p['duration']} s, {len(base64.b64decode(p['data_b64'])) // 1024} KB")

    scenes = [
        {"role": "hook", "narration": "Why did four requests for more premium never get better?", "imageB64": png_b64((40, 60, 50)), "diagram": None, "label": None},
        {"role": "evidence", "narration": "Here is the screen when the owner asked for more premium again.", "imageB64": png_b64((230, 230, 230), (1280, 800)), "diagram": None, "label": "Before · your screen"},
        {"role": "cause", "narration": "Vague words leave the AI guessing. Who it is for and the price give it something to aim at.", "imageB64": None, "diagram": {"nodes": ["More premium", "AI guesses", "Same poster"]}, "label": None},
        {"role": "rule", "narration": "So before a poster, give the audience, the price, one feeling and a real photo.", "imageB64": png_b64((60, 50, 40)), "diagram": None, "label": None},
        {"role": "question", "narration": "Next time a customer says make it cuter, what will you ask first?", "imageB64": png_b64((30, 40, 60)), "diagram": None, "label": None},
    ]
    s = compose.render_short("Four ingredients", "af_heart", scenes, tone_speak)
    assert 20 <= s["duration"] <= 60, s["duration"]
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(base64.b64decode(s["data_b64"]))
        path = f.name
    info = compose.probe(path)
    v = next(x for x in info["streams"] if x["codec_type"] == "video")
    assert (v["width"], v["height"]) == (1080, 1920), v
    assert any(x["codec_type"] == "audio" for x in info["streams"])
    print(f"short ok: {s['duration']} s, 1080x1920, {os.path.getsize(path) // 1024} KB, scene starts {[t['start'] for t in s['timings']]}")
    os.unlink(path)
    print(f"timing: podcast {p['timing_s']}, short {s['timing_s']}")

    # Length policy: 25 s of speech becomes a 30 s short with a reflection pause; too long or too short fails.
    assert compose.short_plan(25.0) == 30.0
    assert compose.short_plan(40.0) == 40.8
    for bad in (44.5, 12.0):
        try:
            compose.short_plan(bad)
            raise AssertionError(f"short_plan({bad}) should fail")
        except ValueError:
            pass
    short_scenes = [dict(sc, narration=" ".join(["word"] * 16)) for sc in scenes]  # ≈ 31 s of speech at 155 wpm minus gaps
    s2 = compose.render_short("Pause test", "af_heart", short_scenes[:4], tone_speak)
    assert 30.0 <= s2["duration"] <= 45.0, s2["duration"]
    print(f"length policy ok: {s2['duration']} s, pause {s2['timing_s']['reflection_pause']} s")
    try:
        compose.render_podcast(lines[:2], {"caddie": "af_heart", "guest": "am_michael"}, tone_speak)
        raise AssertionError("a 2-line podcast should be under 60 s and fail")
    except ValueError as e:
        print(f"podcast minimum ok: {e}")


if __name__ == "__main__":
    main()
