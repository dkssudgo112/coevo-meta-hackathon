# Current status

Updated: October 30, 2026 (night, KST). For per-requirement evidence see [VERIFICATION.md](VERIFICATION.md).

## Deployed with real model calls

https://coevo-caddie.coevo-meta-hackathon.workers.dev — Cloudflare Worker, Durable Objects, private R2 and static assets; Kokoro speech and video composition on Modal. Real Meta model calls are on behind an **application-enforced budget**: the maintainer approved US$3.00 in total for Meta Model API development and validation; the deployment's Budget object stops at a $2.50 lifetime ceiling (never reset), reserves the exact maximum before every call from counted input tokens, keeps reservations for ambiguous outcomes and settles each durable ticket once. Media rendering has its own, separate ceiling.

## Verified with real models (scripted, fictional café scenario)

These runs use screenshots of **actual Meta AI replies** to a scripted café-owner scenario and a synthetic voice for spoken answers. They prove the real path works; they are not real-user or learning evidence.

- **Reading real screens.** Muse Spark read actual Meta AI screens correctly (latest request word-set match 1.0, tool 1.0). Reading and deciding in one combined call cut the median from 11.5 s to 5.9 s (3 runs on one screen capture, not phone photos).
- **A full session through the deployed app.** Five Meta AI screens → quiet notes for the first two → an intervention at the question step that quoted the person ("You keep saying "more premium" — what one mood should it give, calm minimal or dark luxury?") → a spoken answer transcribed by Voice Transcribe → the Caddie's reply → the specific brief labeled **with the Caddie** (coached). The wrap made all five formats: note, My playbook, flashcards, a 93 s two-voice podcast and a 38.9 s 1080×1920 short. Cost of that session: Meta $0.163, plus a $0.08 media reservation.
- **The card in the real AI.** An app-generated Caddie card, sent as the first message of a dedicated, pinned Meta AI chat, made Meta AI ask for audience, product, price and mood before generating a new poster; the Caddie read that screen, stayed quiet and marked the card *observed working*. This proves a rule scoped to one pinned chat, not Meta AI memory across chats (that did not carry over in our check).
- **Practice Range.** A spoken brief was transcribed (word-set similarity 0.86 to the script, synthetic voice), rendered by Muse Image as a 2:3 portrait, and checked for ingredients.
- **Speech and video.** Kokoro-82M (Apache-2.0) two-voice audio was judged distinguishable and listenable by the maintainer. A 61.6 s two-voice benchmark rendered in 58 s end to end; a 76.8 s podcast took 75–77 s, and the 93 s podcast from the full session spent 41 s in speech synthesis. Shorts land in 30–45 s with captions, the person's own before screen and a diagram.
- **Phone pairing.** A real phone paired with the Desk by scanning its QR code.

## Fixed after live runs

Live runs found problems that mocks had not: a lost media job when two renders overlapped, a coached change mislabeled as independent, a voice-answer rejection caused by multi-word keyword hints, UTC clock times in generated text, a card written in the wrong voice, a short title running off the frame, and deletion races. Each fix has a regression test; the local fake-model journey passes 48/48 (test mode only).

## Not yet verified

- **Real phone camera:** the 20-frame benchmark (reading accuracy on camera frames, latency, SAM screen detection), haptics, and the camera-off indicator on pause.
- **A real human voice** (only synthetic speech so far).
- The three-minute demo video, simulated persona tests (to be labeled as simulations), and the submission texts.
- How the public sample should share the fixed budget with judges (see [DECISIONS.md](DECISIONS.md) once settled).

## Publication

Public repository: https://github.com/dkssudgo112/coevo-meta-hackathon. No competition submission has been made. Account records, coordination notes and private checks stay in ignored local files. Published screenshots are listed with their exact SHA-256 in `scripts/reviewed-assets.json`.
