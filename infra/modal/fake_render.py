"""LOCAL TEST ONLY: render a media job with a synthetic tone instead of TTS.

Reads a job JSON on stdin and prints the same result shape as the Modal service.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import compose  # noqa: E402
from test_compose import tone_speak  # noqa: E402

job = json.load(sys.stdin)
if job["kind"] == "podcast":
    out = compose.render_podcast(job["lines"], job.get("voices", {}), tone_speak)
else:
    out = compose.render_short(job.get("title", ""), job.get("voice", "af_heart"), job["scenes"], tone_speak)
print(json.dumps(out))
