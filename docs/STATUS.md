# Current status

Updated: October 30, 2026 (evening KST). For per-requirement evidence see [VERIFICATION.md](VERIFICATION.md).

## Implemented and tested locally (live model calls off)

- **Contracts and core rules** (`packages/contracts`, `packages/core`): moments, decisions, evidence labels, cards, five formats; ladder guardrails (no interrupting typing, no step skipping, cooldowns, praise removal, grounded quotes); deterministic labeling; on-device change detection; spaced repetition; budget math; WAV encoding; model task prompts with strict JSON schemas and readers. 14 unit tests.
- **Meta adapters** (`apps/api/src/meta.ts`): Responses API with strict `json_schema`, image generation, Voice Transcribe multipart, SAM 3.1 box parsing; live-call switch, contributor-model refusal, bounded retries (429/503 with Retry-After, 500 once, never 504), cost reservation and settlement. 9 unit tests with mocked fetch.
- **Worker and Durable Objects** (`apps/api`): one `Workspace` object per paired phone + Desk (tokens, one-time QR pairing, SSE, entity store, alarms for media polling, stuck-job watchdog and idle session end), a global `Budget` object (daily cap, workspace-creation rate limit), security headers. **Local integration: 14/14 checks** — pairing, token isolation between workspaces, SSE snapshot, frame rate limit, honest `disabled` state, session deletion.
- **Web app** (`apps/web`): phone Caddie (QR pairing, aim/crop, camera sampler, NOW card, flow, voice answers, drawer with playbook, habits, past sessions, privacy), Desk (QR, copy inbox, evidence rows, screen share and screenshot upload), sample session with synthetic screens, players for all five formats, Practice Range. Calm Caddie visual system with dark mode and reduced motion.
- **Media composition** (`infra/modal/compose.py`): podcast timeline with per-line timings and loudness normalization; 9:16 short with scene images, evidence frames, diagrams and full captions. Verified locally with a synthetic tone: 120 s podcast, 30.8 s 1080×1920 short with audio.

## Not yet verified

- **Any real Meta model output.** Live calls stay off until billing/credit is confirmed. Readings, decisions and content have only been exercised with mocks in unit tests.
- **Kokoro TTS on Modal** (code written, never run) and the deployed media service.
- **Real phone camera** legibility, latency and haptics.
- **Public deployment** (waiting for Cloudflare R2 activation).
- **Meta AI as the user's tool:** confirmed in a Korean account — poster image generation works, and a Caddie-style rule sent as the first message of a dedicated (pinned) chat made Meta AI ask for audience, price, mood and a photo before generating. A "Remember that…" rule did **not** carry into other new chats, so the Desk tells Meta AI users to keep one pinned poster chat.
- **Modal:** a one-call CPU probe succeeded; the media service itself (Kokoro TTS) has not run yet.
- Demo video, simulated persona tests, submission texts.

## Publication

Public repository: https://github.com/dkssudgo112/coevo-meta-hackathon. No deployment or competition submission has been completed. Account records, coordination notes and private checks stay in ignored local files.
