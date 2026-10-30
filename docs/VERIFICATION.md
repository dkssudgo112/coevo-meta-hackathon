# Requirement and verification matrix

This matrix tracks every approved requirement through three depth levels and records **what kind of evidence** supports each claim. It is updated as work lands. A green unit test is never enough on its own.

**Levels**
- **L1 (through):** the real path runs end to end with the minimum behavior, with no stand-in for the live step.
- **L2 (real use):** waiting, empty, failure, partial-success, and recovery states all work, and labels are correct.
- **L3 (finished):** copy, visuals, and performance are at demo quality.

**Evidence types**
- `unit`: deterministic test, mocks allowed
- `local`: local Worker + browser integration
- `live`: real Meta/Modal call
- `device`: real phone camera / real monitor
- `deployed`: public URL
- `fixture`: synthetic data, labeled
- `sim`: simulated persona test, never real-user evidence

**Status:** ☐ not started · ◐ in progress · ☑ done (with evidence) · ⚠ blocked (reason in notes)

**Local fake-model journey** (`npm run test:e2e-fake`, TEST ONLY): with a scripted fake model server on 127.0.0.1 the whole server path passes 35/35 checks — frames → readings → quiet/intervene decisions with grounded quotes → voice answer → frameless reply → coached change → wrap with a reason per format → all five formats ready (123.8 s podcast, 40.8 s short, both downloadable) → card edit/approve/apply → next session "AI asked first" → card observed-working → practice labels (independent; coached after hint) → podcast Ask → flashcard interval → misread → frame deletion → revoke history → spend under cap. All of it is labeled `fixture`; it proves the server logic, not real model quality, camera legibility or deployment.

Last updated: 2026-10-30 (late KST).

## A. Observation

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Phone rear camera capture over HTTPS | ☐ | ☐ | ☐ | | Needs `device` evidence (R3) |
| A2 | Device-side crop to the screen before upload; setup frame disclosed | ◐ | ☐ | ☐ | code: `FrameSampler` crops on device; aim screen discloses the one setup photo | Needs `device` |
| A3 | On-device change detection (send only after a settled change) | ◐ | ☐ | ☐ | unit: `packages/core/test` | Thresholds need `device` tuning |
| A4 | SAM 3.1 finds the screen on the disclosed setup frame → crop suggestion | ☐ | ☐ | ☐ | | S2 |
| A5 | Spark reads a frame → validated `Reading` | ☑ | ◐ | ☐ | live: real Meta AI screen capture read correctly (request word-set 1.0, tool 1.0) in 1 + 3 + 3 runs; live sample screens read in order | Phone-camera frames pending (S1) |
| A6 | Photo fallback (single photo) | ◐ | ☐ | ☐ | code: phone photo + crop, Desk screenshot upload | |
| A7 | Desk screen-share fallback (`getDisplayMedia`) | ◐ | ☐ | ☐ | code: Desk sampler | |
| A8 | Raw frames discarded after reading; evidence frames kept and deletable | ◐ | ☐ | ☐ | integration: unreadable/disabled frame deleted; code: retention rule + delete API | |

## B. Caddie

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Every decision has a reason, quiet included (live model) | ☑ | ◐ | ☐ | live sample: quiet notes ("Two vague tries, not stuck yet.") and an intervention reason ("Three requests added no concrete details…") | |
| B2 | Ladder question → ingredients → example; no skipping | ◐ | ☐ | ☐ | unit: guardrails; live: first intervention at the question step, quoting the user | Ingredients/example steps pending live |
| B3 | NOW card + session flow, one primary action | ☐ | ☐ | ☐ | | |
| B4 | Voice answer: record → 16 kHz WAV → Voice Transcribe | ◐ | ☐ | ☐ | unit: WAV encoder | S6 |
| B5 | Haptic nudge (`navigator.vibrate`), visual pulse fallback | ☐ | ☐ | ☐ | | iOS Safari has no vibrate API |
| B6 | Later defers with a longer cooldown; card stays in flow | ◐ | ☐ | ☐ | unit: later-cooldown | |
| B7 | "That's not what I asked" marks a misread and drops its evidence | ☐ | ☐ | ☐ | | |
| B8 | No interrupt while typing; praise removed; quotes must be grounded | ◐ | ☐ | ☐ | unit | |
| B9 | First-sighting acknowledgement written by the model | ☐ | ☐ | ☐ | | |

## C. Connection

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Desk shows a QR; the phone camera scans it and pairs | ◐ | ☐ | ☐ | local: pairing link in a second browser tab; integration: one-time secret | Camera QR scan needs `device` |
| C2 | Real-time sync over SSE (phone ↔ Desk) | ☑ | ◐ | ☐ | local: Desk showed "Phone connected" live; integration: snapshot over SSE | Reconnect with backoff implemented |
| C3 | Send to PC + copy (inbox) | ◐ | ☐ | ☐ | code: inbox API + Desk copy | |
| C4 | Session isolation: per-workspace tokens, no cross-workspace access | ☑ | ☑ | ☐ | deployed + local integration: cross-workspace 401, one-time pair secret, unauthenticated 401 | |

## D. Evidence

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Moment = frame + reading + decision + response + observed change | ◐ | ☐ | ☐ | contracts | |
| D2 | Four assistance labels by deterministic rules | ◐ | ☐ | ☐ | unit: labels | |
| D3 | 4D observations (no levels or scores); unobserved is not failure | ◐ | ☐ | ☐ | unit: `dimensionFor` | |
| D4 | Source links from every card and content item to its moment/frame | ☐ | ☐ | ☐ | | |
| D5 | Frame deletion keeps the label and marks "source removed" | ☐ | ☐ | ☐ | | |
| D6 | Desk evidence rows: FRAME, YOU SAID, CADDIE, THEN | ☐ | ☐ | ☐ | | |

## E. AI growth

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Card proposed from the playbook's `cardRule` | ◐ | ☐ | ☐ | prompt schema | |
| E2 | Approve / edit / reject / revoke with history | ☐ | ☐ | ☐ | | |
| E3 | Tool-specific apply text (Meta AI: dedicated pinned chat) | ☑ | ◐ | ☐ | unit: apply hints; S4 fallback observed in real Meta AI | Memory did not persist across new chats |
| E4 | Next session: "AI asked first" observed → `observed-working` | ◐ | ☐ | ☐ | unit: guardrail | S4 |

## F. Content (five formats)

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Shared learning design; the Caddie decides each format with a reason | ◐ | ☐ | ☐ | prompt schema | |
| F2 | Note | ◐ | ☐ | ☐ | prompt schema | |
| F3 | Manual / My playbook | ◐ | ☐ | ☐ | prompt schema | |
| F4 | Flashcards with spaced repetition (10 min, 1, 3, 7, 14 days) | ◐ | ☐ | ☐ | unit: spaced | |
| F5 | Two-voice podcast ≥ 60 s, transcript, Ask + resume at the same line | ◐ | ☐ | ☐ | local: 120 s timeline with per-line timings (tone); UI: Ask + resume | S5 |
| F6 | 30–45 s 9:16 short: captions, TTS, mp4 | ◐ | ☐ | ☐ | local: `npm run test:media` (tone instead of TTS) → 30.8 s 1080×1920 mp4 | S5, S7 |
| F7 | A failed format never blocks the others; per-format retry | ☑ | ◐ | ☐ | fake e2e (fixture): injected short + podcast failures → other three ready, podcast script kept, retry recovers both | Real failure modes pending live |

## G. Practice Range

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Scenario written by the live model; viewing the hint marks the attempt coached | ☑ | ◐ | ☐ | live: 4 scenarios generated; unit + fake e2e: hint → coached | |
| G2 | Spoken brief → transcript | ☑ | ◐ | ☐ | live Voice Transcribe on synthetic speech (macOS voice): 31 and 19 words; word-set similarity 0.86 to the script | Real human voice pending |
| G3 | Muse Image renders the user's own words | ☑ | ◐ | ☐ | live: 3 portrait images (1024×1536) from spoken briefs, ~16 s per attempt incl. transcription and check | |
| G4 | Ingredient check + exact label | ☑ | ◐ | ☐ | live: ingredient check + "independent · practice" label; unit/fake: coached after hint | |

## H. Deployment and judging

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Cloudflare Worker + Durable Objects + R2 + static assets | ☑ | ◐ | ☐ | deployed: https://coevo-caddie.coevo-meta-hackathon.workers.dev (live calls off) | Live calls pending R1 |
| H2 | Health/status, security headers, rate limits | ☑ | ☑ | ☐ | deployed integration 17/17: CSP, Permissions-Policy, frame 429, admin routes closed, test mode off | |
| H3 | Application-enforced budget: approved $3 total, $2.50 lifetime ceiling, single authority; per workspace and per sample caps | ☑ | ☑ | ☐ | unit (36): ledger rules, exact pre-dispatch reservation from counted input tokens, refusal when unverifiable, missing usage kept, ambiguous failures kept, Retry-After honored, no-bypass guards; real Durable Object (`npm run test:budget`): concurrent reservations never exceed $2.50; durable tickets settle once (duplicate, unknown and 20 concurrent settles); tickets reserved before a restart settle once after it; priced model allowlist and WAV-derived audio cost; deployed health shows $0 of $2.50 | Live spend pending Codex review |
| H4 | Three entrances: camera / photo / sample session (live model, fixture frames labeled) | ☐ | ☐ | ☐ | | |
| H5 | English docs, reproducible setup | ◐ | ☐ | ☐ | | |
| H6 | Three-minute demo video | ☐ | ☐ | ☐ | | R7 |
| H7 | Submission texts ready (not submitted) | ☐ | ☐ | ☐ | | R8 |
| H8 | Public repository audit (release check, signed-out access) | ☐ | ☐ | ☐ | | |

## Technical spikes (approved plan §6.3)

| ID | Check | Pass criterion | Status | Evidence |
| --- | --- | --- | --- | --- |
| S1 | Spark reading of 20 real phone-camera frames | ≥ 90% request text, 100% tool | ☐ | Needs R1 + R3 |
| S2 | SAM 3.1 monitor detection | ≥ 18/20, ≤ 2 s | ☐ | Needs R1 + R3 |
| S3 | Frame → card latency | p50 ≤ 6 s | ◐ | Not yet measured on phone frames. Live, one real screen capture × 3 through the deployed app: separate read+decide p50 11.5 s (4 round trips) → combined turn p50 5.9 s client / 4.9 s server (2 round trips). Benchmark mode ready for the 20-frame phone run |
| S4 | Meta AI (KR): image generation + rule changes behavior | both reproducible | ☑ (fallback) | Image: PASS (real 1152×2048 poster, private record). Memory across new chats: FAIL. Approved fallback PASS: rule as first message of a dedicated, pinned chat → Meta AI asked audience, price, mood and photo before generating (manual check by the maintainer's account; private record) |
| S5 | Modal open TTS, two English voices, 60 s | acceptable quality, ≤ 60 s render, commercial-use license | ☐ | Needs R1 + R6 |
| S6 | Voice Transcribe on 20 s answers | key words correct | ◐ | Live on synthetic speech (8–10 s clips): similarity 0.86; human voice pending |
| S7 | Muse Image portrait / 9:16 | ratio kept (text rendered in code) | ☑ | Live: requested 1024x1536 → returned 2:3 portrait (0.667) ×3; shorts crop to 9:16 and render text in code. Meta AI consumer app also produced a 1152×2048 (9:16) poster (S4) |
| S8 | Real cost of one full session | under caps | ☐ | Needs R1 |

## Screen states

| Screen | Waiting | Empty | Failure | Partial success | Retry | Return to context | Delete / revoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phone · Pair | ☐ | ☐ | ☐ | — | ☐ | ☐ auto re-pair | — |
| Phone · Live | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ pause |
| Phone · Session wrap | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ card reject/revoke |
| Phone · Players | ☐ | — | ☐ | ☐ | ☐ | ☐ podcast resume | — |
| Phone · Practice Range | ☐ | — | ☐ | ☐ | ☐ | ☐ | — |
| Phone · Drawer | — | ☐ | — | — | — | ☐ | ☐ frames, session |
| Desk | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ frames, card revoke |

## Persona simulation (labeled `sim`)

Planned after L2: persona sub-agents (café owner, cover-letter writer, privacy-skeptical user) run scripted tasks against the deployed app. Results are reported as **simulated persona tests**. They are not real-user validation.
