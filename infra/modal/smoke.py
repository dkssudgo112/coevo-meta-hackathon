"""Opt-in CPU connection check. Does not deploy a persistent app or start a GPU."""
import os
import modal

app = modal.App("coevo-hackathon-check")

@app.function(cpu=0.25, memory=256, timeout=30)
def ping() -> dict:
    return {"project": "coevo", "status": "ready", "fixture": True}

@app.local_entrypoint()
def main():
    if os.environ.get("COEVO_ALLOW_MODAL_COMPUTE") != "true":
        raise RuntimeError("Set COEVO_ALLOW_MODAL_COMPUTE=true only when intentionally running cloud compute.")
    print(ping.remote())
