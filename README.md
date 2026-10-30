# Coevo Caddie

**A caddie on the phone beside your screen.** It watches how you work with any AI tool, steps in only when it matters, and helps both you and your AI get better.

Built for the 2026 Meta Global AI Developer Hackathon (Indie Developer / Build for Your World). The product concept continues the author's earlier Coevo work; all code in this repository was written during the event.

> **Status:** deployed at https://coevo-caddie.coevo-meta-hackathon.workers.dev with real Meta model calls behind an application-enforced budget (US$2.50 lifetime ceiling inside an approved US$3 total). Real-screen readings, interventions, Practice Range and Modal speech/video have run live; the real-phone camera benchmark and the full card-in-Meta-AI loop are still open. See [Current status](docs/STATUS.md) and the [verification matrix](docs/VERIFICATION.md). What the Caddie says is never pre-written: its readings, decisions and content are live model output, and when a model call is off, refused or fails, the app says so instead of inventing output. The sample's screens are a scripted, fictional scenario, and the test build labels its fake model.

## The idea in one scene

A café owner is making a poster for a new dessert with an AI. They type "make it more premium" four times. The phone propped beside the monitor buzzes:

> You've asked for "more premium" 4×. Who is this dessert for?

They answer out loud — office workers near the station, 6,500 won, a calm morning feel — then type it in their own words. The poster finally changes. After the session the Caddie proposes a **Caddie card** for their AI: *Before making a poster, ask me who it's for, the price, one feeling, and whether I have a real photo.* They start a dedicated poster chat with that card as its first message and pin it. A week later, when they ask that chat for a new drink poster, the AI asks those questions first. (Meta AI did not carry the rule into other new chats in our check, so the Caddie recommends one pinned poster chat.) The Caddie notices and stays quiet: *Your AI asked first.*

## How it works

| Part | What it does |
| --- | --- |
| **Phone · Caddie** (`/caddie`) | Points its camera at your monitor. On-device change detection sends a frame only when the screen changed and settled. Only the boxed screen area is uploaded (plus one disclosed setup photo if you ask it to find the screen). A NOW card and haptic nudge when the Caddie steps in; you answer by voice or type. |
| **PC · Desk** (`/desk`) | A thin tab: QR pairing, a copy inbox for what the Caddie sends, and evidence rows per moment (frame · what you said · what the Caddie did · what changed). |
| **Sample** (`/sample`) | No phone needed. A scripted, fictional café scenario on screenshots of actual Meta AI replies. By default it replays a labeled recorded live run: the Caddie's real output, five formats, podcast and short, with no new model calls. "Run it live" makes fresh model calls on the shared demo budget. |

**Meta models in the product**

- **Muse Spark 1.3** — reads each camera frame into a structured moment, decides whether to intervene (and why it stays quiet), plans one shared learning design per session, and writes the five formats.
- **SAM 3.1** — finds the monitor in the one disclosed setup photo so the phone can crop on-device from then on.
- **Muse Voice Transcribe** — your spoken answers and practice briefs.
- **Muse Image** — Practice Range renders your spoken brief, and scenes for the short.

Speech for the podcast and short uses the open-source **Kokoro-82M** model (Apache-2.0) on Modal, because Meta's API has no text-to-speech.

**After a session — five formats, five moments** (the Caddie decides which are worth making, with a one-line reason):
note (right after) · **My playbook** manual split into "for your AI" and "you decide" (source of the Caddie card) · flashcards that apply the rule to new situations (10 min, then 1, 3, 7, 14 days) · a two-voice podcast with an objecting guest, where you can pause to ask and resume at the same line · a 30–45 s 9:16 short built on your own before/after screens.

**Honest evidence:** every observation is labeled *on your own*, *with the Caddie*, *AI wrote it*, or *not seen yet*. Not seen yet never means you can't. Practice that the Caddie opened, or that you did after viewing a hint, never counts as on your own.

## Run locally

Requirements: Node.js 22.12+ and npm. Python 3.12+ with ffmpeg, numpy and Pillow for the optional media checks.

```bash
git clone https://github.com/dkssudgo112/coevo-meta-hackathon.git
cd coevo-meta-hackathon
npm ci
npm run setup
npm run build
npx wrangler dev --local --ip 127.0.0.1 --port 8788
```

- Open http://127.0.0.1:8788 — the Worker serves the app, API, Durable Objects and local R2.
- `npm run dev` runs Vite with hot reload on :5178 against the API on :8788.
- Phone cameras require HTTPS; use the deployed URL or an HTTPS tunnel to test with a real phone.
- Live model calls are **off** by default. Set your own `MODEL_API_KEY` and `COEVO_ALLOW_LIVE_CALLS="true"` in `.dev.vars` only after checking billing. See [API setup](docs/API-SETUP.md).

## Check the project

```bash
npm run verify             # type checks, unit tests, build, Worker dry-run, release checks
npm run test:integration   # HTTP checks against a running server (default http://127.0.0.1:8788)
npm run test:media         # media composition with a synthetic tone (no TTS, no Modal)
npm run check:release -- --staged
```

## Structure

| Path | Purpose |
| --- | --- |
| `apps/web` | React + TypeScript app: phone Caddie, PC Desk, sample session |
| `apps/api` | Cloudflare Worker, `Workspace` and `Budget` Durable Objects, Meta and media adapters |
| `packages/contracts` | Shared types: moments, decisions, evidence labels, cards, content |
| `packages/core` | Model task prompts and schemas, ladder guardrails, labeling rules, change detection, spaced repetition, budget |
| `infra/modal` | Media service: Kokoro TTS + ffmpeg composition |
| `scripts` | Setup, integration checks, sample-screen generator, release checks |
| `docs` | Product, verification, build plan, decisions, submission |

## Documentation

[Status](docs/STATUS.md) · [Product](docs/PRODUCT.md) · [Verification matrix](docs/VERIFICATION.md) · [Build plan](docs/BUILD-PLAN.md) · [Decisions](docs/DECISIONS.md) · [API setup](docs/API-SETUP.md) · [Hackathon](docs/HACKATHON.md) · [Submission](docs/SUBMISSION.md) · [Sources](docs/SOURCES.md)

Submission deadline: **November 4, 2026, 21:00 EST / November 5, 2026, 11:00 KST**. A project license has not been selected yet; public visibility alone does not grant an open-source license.
