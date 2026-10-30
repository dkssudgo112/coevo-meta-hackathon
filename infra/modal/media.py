"""Coevo Caddie media service on Modal: open-source TTS (Kokoro-82M, Apache-2.0) + ffmpeg.

Deploy only after credits are confirmed:
  uv run modal deploy --profile coevo-hackathon --env main infra/modal/media.py
Needs a Modal Secret named `coevo-media-token` with COEVO_MEDIA_TOKEN set to a random bearer token.

API (Bearer auth):
  POST /jobs            {"kind": "podcast" | "short", ...} -> {"job_id": "..."}
  GET  /jobs/{job_id}   -> 202 while running; 200 {"status": "done", mime, duration, timings, data_b64}

Note: no `from __future__ import annotations` here. FastAPI must see the real
`Request` class on route parameters; with postponed annotations the locally
imported `Request` becomes an unresolvable string and FastAPI treats `req` as a
required query parameter (HTTP 422).
"""
import hmac
import os
from pathlib import Path

import modal

HERE = Path(__file__).parent

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "espeak-ng", "fonts-dejavu-core", "fonts-inter")
    .pip_install("torch==2.6.0", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("kokoro==0.9.4", "misaki[en]==0.9.4", "soundfile==0.13.1", "numpy==2.2.6", "pillow==11.3.0", "fastapi[standard]==0.115.12")
    .run_commands("python -m spacy download en_core_web_sm")
    .run_commands("python -c \"from kokoro import KPipeline; p = KPipeline(lang_code='a', device='cpu'); list(p('Ready.', voice='af_heart')); list(p('Ready.', voice='am_michael'))\"")
    .add_local_file(HERE / "compose.py", "/root/compose.py")
)

app = modal.App("coevo-media", image=image)
token_secret = modal.Secret.from_name("coevo-media-token")

MAX_REQUEST_BYTES = 12_000_000


# Explicit (request, limit) tuples: Modal bills the higher of requested and actual
# usage, and a scalar request is NOT a maximum. Hard memory limit, one container,
# no warm pool, no automatic retries, bounded startup and run time.
@app.cls(cpu=(1.0, 2.0), memory=(2048, 3072), timeout=300, startup_timeout=180, retries=0, scaledown_window=5, min_containers=0, max_containers=1)
class Renderer:
    @modal.enter()
    def load(self) -> None:
        from kokoro import KPipeline

        self.pipe = KPipeline(lang_code="a", device="cpu")

    def speak(self, text: str, voice: str):
        import numpy as np

        chunks = [r.audio.numpy() if hasattr(r.audio, "numpy") else np.asarray(r.audio) for r in self.pipe(text, voice=voice or "af_heart")]
        return (np.concatenate(chunks) if chunks else np.zeros(2400, np.float32)), 24000

    @modal.method()
    def render(self, job: dict) -> dict:
        import sys

        sys.path.insert(0, "/root")
        import compose

        if job.get("kind") == "podcast":
            return compose.render_podcast(job["lines"], job.get("voices", {}), self.speak)
        if job.get("kind") == "short":
            return compose.render_short(job.get("title", ""), job.get("voice", "af_heart"), job["scenes"], self.speak)
        raise ValueError("unknown job kind")


@app.function(secrets=[token_secret], cpu=(0.125, 0.25), memory=(128, 256), timeout=60, startup_timeout=60, scaledown_window=5, min_containers=0, max_containers=1)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import JSONResponse

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    expected = os.environ["COEVO_MEDIA_TOKEN"]

    def check(req: Request) -> None:
        got = req.headers.get("authorization", "")
        if not hmac.compare_digest(got, f"Bearer {expected}"):
            raise HTTPException(status_code=401, detail="unauthorized")

    @api.post("/jobs")
    async def create(req: Request):
        check(req)
        body = await req.body()
        if len(body) > MAX_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="too large")
        job = await req.json()
        if job.get("kind") not in ("podcast", "short"):
            raise HTTPException(status_code=400, detail="kind must be podcast or short")
        call = Renderer().render.spawn(job)
        return {"job_id": call.object_id}

    @api.get("/jobs/{job_id}")
    async def status(job_id: str, req: Request):
        check(req)
        try:
            result = modal.FunctionCall.from_id(job_id).get(timeout=0)
        except TimeoutError:
            return JSONResponse({"status": "running"}, status_code=202)
        except Exception as e:  # noqa: BLE001 — report a clean failure to the caller
            return JSONResponse({"status": "failed", "error": f"Rendering failed: {type(e).__name__}"}, status_code=500)
        return result

    return api
