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


class _Call:
    object_id = "fc-test"


class _Spawn:
    async def aio(self, job):
        spawned.append(job)
        return _Call()


class _Render:
    spawn = _Spawn()


class _OkRenderer:
    render = _Render()


ALLOW_SPAWN = {"on": False}
# Any accidental render attempt fails the test instead of reaching Modal; spawns are
# only stubbed (never sent) for the async-path check.
media.Renderer = lambda: _OkRenderer() if ALLOW_SPAWN["on"] else _NoSpawn()  # type: ignore[assignment]


class _Get:
    def __init__(self, outcome):
        self.outcome = outcome

    async def aio(self, timeout=0):
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome


class _FC:
    outcome = TimeoutError()

    @classmethod
    def from_id(cls, job_id):
        return type("C", (), {"get": _Get(cls.outcome)})()


media.modal.FunctionCall = _FC  # type: ignore[attr-defined]

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

ALLOW_SPAWN["on"] = True
r = client.post("/jobs", json={"kind": "podcast", "lines": [{"speaker": "caddie", "text": "hi"}]}, headers=GOOD)
check("valid job uses the async spawn path and returns a job id", r.status_code == 200 and r.json().get("job_id") == "fc-test" and len(spawned) == 1, f"{r.status_code} {r.text[:60]}")
ALLOW_SPAWN["on"] = False
_FC.outcome = TimeoutError()
r = client.get("/jobs/fc-test", headers=GOOD)
check("running job → 202 via async get", r.status_code == 202, str(r.status_code))
_FC.outcome = ValueError("short narration runs 52.0 s; the short must end by 45 s")
r = client.get("/jobs/fc-test", headers=GOOD)
check("length-policy failure surfaces its message", r.status_code == 500 and "45 s" in r.json().get("error", ""), r.text[:80])
_FC.outcome = {"status": "done", "duration": 31.0}
r = client.get("/jobs/fc-test", headers=GOOD)
check("finished job → 200 with the result", r.status_code == 200 and r.json().get("duration") == 31.0, r.text[:60])

print(f"\n{sum(checks)}/{len(checks)} ingress checks passed (no Modal call, no render)")
sys.exit(0 if all(checks) else 1)
