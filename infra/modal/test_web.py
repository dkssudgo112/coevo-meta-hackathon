"""Local checks for the media HTTP ingress without running Modal or rendering.

Run: uv run --with fastapi==0.115.12 --with httpx python infra/modal/test_web.py
Builds the FastAPI app from the raw `web` function and verifies auth and
validation paths that return BEFORE any render is spawned.
"""
import importlib.util
import os
import sys

os.environ["COEVO_MEDIA_TOKEN"] = "test-token-for-local-checks-only"
spec = importlib.util.spec_from_file_location("media", os.path.join(os.path.dirname(__file__), "media.py"))
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)

spawned = []


class _NoSpawn:
    def __getattr__(self, name):
        raise AssertionError("render must not start")


# Any accidental render attempt fails the test instead of reaching Modal.
media.Renderer = lambda: _NoSpawn()  # type: ignore[assignment]

from fastapi.testclient import TestClient  # noqa: E402

raw = getattr(media.web, '_raw_f', None) or getattr(media.web, '_raw_f_', None)
api = raw() if callable(raw) else media.web.local()
client = TestClient(api)
GOOD = {"Authorization": "Bearer test-token-for-local-checks-only"}

checks = []


def check(name, ok, detail=""):
    checks.append(ok)
    print(("✔ " if ok else "✖ ") + name + (f" — {detail}" if detail else ""))


r = client.post("/jobs", json={"kind": "podcast", "lines": []})
check("POST /jobs without auth → 401 (not 422)", r.status_code == 401, f"{r.status_code} {r.text[:80]}")
r = client.post("/jobs", json={"kind": "podcast"}, headers={"Authorization": "Bearer wrong"})
check("POST /jobs with a wrong token → 401", r.status_code == 401, str(r.status_code))
r = client.post("/jobs", json={"kind": "video"}, headers=GOOD)
check("valid auth + unknown kind → 400 without starting a render", r.status_code == 400, f"{r.status_code} {r.text[:80]}")
r = client.post("/jobs", content=b"x" * (media.MAX_REQUEST_BYTES + 1), headers={**GOOD, "Content-Type": "application/json"})
check("oversized body → 413 without starting a render", r.status_code == 413, str(r.status_code))
r = client.get("/jobs/fc-123")
check("GET /jobs/{id} without auth → 401 (not 422)", r.status_code == 401, str(r.status_code))
r = client.get("/docs")
check("no public API docs", r.status_code == 404, str(r.status_code))

print(f"\n{sum(checks)}/{len(checks)} ingress checks passed (no Modal call, no render)")
sys.exit(0 if all(checks) else 1)
