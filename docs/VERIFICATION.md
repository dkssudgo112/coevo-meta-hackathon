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

**Local fake-model journey** (`npm run test:e2e-fake`, TEST ONLY): with a scripted fake model server on 127.0.0.1 the whole server path passes 48/48 checks (incl. deletion during slow model calls and slow storage writes, a media job dispatched during a slow poll, and revoking a retained card) — frames → readings → quiet/intervene decisions with grounded quotes → voice answer → frameless reply → coached change → wrap with a reason per format → all five formats ready (123.8 s podcast, 40.8 s short, both downloadable) → card edit/approve/apply → next session "AI asked first" → card observed-working → practice labels (independent; coached after hint) → podcast Ask → flashcard interval → misread → frame deletion → revoke history → spend under cap. All of it is labeled `fixture`; it proves the server logic, not real model quality, camera legibility or deployment.

**Live end-to-end session** (deployed app, real models, scripted fictional café on five screenshots of actual Meta AI replies, synthetic voice): quiet notes → intervention at the question step quoting the person → spoken answer transcribed → Caddie reply → specific brief labeled coached → all five formats (note, My playbook, flashcards, 93 s podcast, 38.9 s 1080×1920 short) → card approved. Meta $0.163 + $0.08 media reservation. Not real-user or learning evidence.

Last updated: 2026-10-30 (night KST).

## A. Observation

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Phone rear camera capture over HTTPS | ☐ | ☐ | ☐ | | Needs `device` evidence (R3) |
| A2 | Device-side crop to the screen before upload; setup frame disclosed | ◐ | ☐ | ☐ | code: `FrameSampler` crops on device; aim screen discloses the one setup photo | Needs `device` |
| A3 | On-device change detection (send only after a settled change) | ◐ | ☐ | ☐ | unit: `packages/core/test` | Thresholds need `device` tuning |
| A4 | SAM 3.1 finds the screen on the disclosed setup frame → crop suggestion | ☐ | ☐ | ☐ | | S2 |
| A5 | Spark reads a frame → validated `Reading` | ☑ | ◐ | ☐ | live: actual Meta AI screens read correctly (request word-set 1.0, tool 1.0); live session read 5 screens in order, 6–9 s per turn | Phone-camera frames pending (S1) |
| A6 | Photo fallback (single photo) | ◐ | ☐ | ☐ | code: phone photo + crop, Desk screenshot upload | |
| A7 | Desk screen-share fallback (`getDisplayMedia`) | ◐ | ☐ | ☐ | code: Desk sampler | |
| A8 | Raw frames discarded after reading; evidence frames kept and deletable | ◐ | ☐ | ☐ | integration: unreadable/disabled frame deleted; code: retention rule + delete API | |

## B. Caddie

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Every decision has a reason, quiet included (live model) | ☑ | ◐ | ☐ | live session: quiet notes ("Second premium request, still converging, staying quiet."), cooldown note, intervention reason | |
| B2 | Ladder question → ingredients → example; no skipping | ◐ | ☐ | ☐ | unit: guardrails; live: intervention at the question step quoting "more premium"; reply after the answer | Ingredients/example steps pending live |
| B3 | NOW card + session flow, one primary action | ☐ | ☐ | ☐ | | |
| B4 | Voice answer: record → 16 kHz WAV → Voice Transcribe | ☑ | ◐ | ☐ | live: 10 s synthetic answer transcribed (one place name misheard) → Caddie reply; keyword-hint 400 found and fixed (single words, retry without hints) | Browser microphone + human voice pending |
| B5 | Haptic nudge (`navigator.vibrate`), visual pulse fallback | ◐ | ☐ | ☐ | code: buzz + pulse on every new question, including the first of a quiet session; history on reopen does not buzz (bug found in review, fixed) | Device check pending; iOS Safari has no vibrate API |
| B6 | Later defers with a longer cooldown; card stays in flow | ◐ | ☐ | ☐ | unit: later-cooldown | |
| B7 | "That's not what I asked" marks a misread and drops its evidence | ☐ | ☐ | ☐ | | |
| B8 | No interrupt while typing; praise removed; quotes must be grounded | ◐ | ☐ | ☐ | unit | |
| B9 | First-sighting acknowledgement written by the model | ☑ | ☐ | ☐ | live: "See Meta AI making cafe poster; will speak only when helpful." | |

## C. Connection

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Desk shows a QR; the phone camera scans it and pairs | ☑ | ☐ | ☐ | device: a real phone scanned the deployed Desk QR and the Desk showed "Phone connected" (maintainer report) | Phone model/browser not recorded |
| C2 | Real-time sync over SSE (phone ↔ Desk) | ☑ | ◐ | ☐ | local: Desk showed "Phone connected" live; integration: snapshot over SSE | Reconnect with backoff implemented |
| C3 | Send to PC + copy (inbox) | ◐ | ☐ | ☐ | code: inbox API + Desk copy | |
| C4 | Session isolation: per-workspace tokens, no cross-workspace access | ☑ | ☑ | ☐ | deployed + local integration: cross-workspace 401, one-time pair secret, unauthenticated 401 | |

## D. Evidence

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Moment = frame + reading + decision + response + observed change | ◐ | ☐ | ☐ | contracts | |
| D2 | Four assistance labels by deterministic rules | ☑ | ◐ | ☐ | unit: labels incl. a question two frames earlier; live: specific brief after the Caddie's question → coached (mislabel found and fixed) | |
| D3 | 4D observations (no levels or scores); unobserved is not failure | ◐ | ☐ | ☐ | unit: `dimensionFor` | |
| D4 | Source links from every card and content item to its moment/frame | ☑ | ◐ | ☐ | TEST build in the browser: "Made from" links and note quotes open their session with the moment highlighted; content opened from a past session returns there | Desk evidence rows link pending |
| D5 | Frame deletion keeps the label and marks "source removed" | ☑ | ◐ | ☐ | fake e2e: deleting a frame keeps its "with the Caddie" label and removes the stored image; Desk row shows "Source removed", the short storyboard "(frame deleted)" | Live check pending |
| D6 | Desk evidence rows: FRAME, YOU SAID, CADDIE, THEN | ☐ | ☐ | ☐ | | |

## E. AI growth

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Card proposed from the playbook's `cardRule` | ☑ | ◐ | ☐ | live: "Before you make a poster, ask me who it is for, what it is, the price, one feeling, and whether a real photo exists." | |
| E2 | Approve / edit / reject / revoke with history | ☑ | ◐ | ☐ | fake e2e: edit/approve/apply/revoke history; approve → edit updates the Desk copy and the card's checked details; live: approve, apply, revoke after the source session was deleted | |
| E3 | Tool-specific apply text (Meta AI: dedicated pinned chat) | ☑ | ◐ | ☐ | unit: apply hints; S4 fallback observed in real Meta AI | Memory did not persist across new chats |
| E4 | Next session: "AI asked first" observed → `observed-working` | ☑ | ◐ | ☐ | live: card pinned in a dedicated Meta AI chat → Meta AI asked for audience, product, price, mood → Caddie quiet → observed-working; unit negatives: approved-only, other tool/task, unrelated questions | Scoped to one pinned chat, not cross-chat memory |

## F. Content (five formats)

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Shared learning design; the Caddie decides each format with a reason | ☑ | ◐ | ☐ | live: design with a reason per format (e.g. flashcards: "You supplied audience, price, and mood only after Caddie coached you…") | |
| F2 | Note | ☑ | ◐ | ☐ | live: note separating the person's decisions from what the AI produced; quote rules tightened after review | |
| F3 | Manual / My playbook | ☑ | ◐ | ☐ | live: 4 steps with checks and owners, pitfalls, "for your AI" vs "you decide", card rule | |
| F4 | Flashcards with spaced repetition (10 min, 1, 3, 7, 14 days) | ☑ | ◐ | ☐ | unit: spaced; live: 2 transfer cards (a new café product; a mismatched result) | |
| F5 | Two-voice podcast ≥ 60 s, transcript, Ask + resume at the same line | ☑ | ◐ | ☐ | live: 93.5 s Kokoro two-voice episode with an objecting guest and per-line timings; UI: Ask + resume | Live Ask on device pending |
| F6 | 30–45 s 9:16 short: captions, TTS, mp4 | ☑ | ◐ | ☐ | live: 38.9 s 1080×1920 H.264/AAC with the person's before screen, a diagram and full captions; title overflow found and fixed | |
| F7 | A failed format never blocks the others; per-format retry | ☑ | ◐ | ☐ | fake e2e: injected failures; live: a lost short job failed alone while the other four were ready (race fixed) | |

## G. Practice Range

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Scenario written by the live model; viewing the hint marks the attempt coached | ☑ | ◐ | ☐ | live: 4 scenarios generated; unit + fake e2e: hint → coached | |
| G2 | Spoken brief → transcript | ☑ | ◐ | ☐ | live Voice Transcribe on synthetic speech (macOS voice): 31 and 19 words; word-set similarity 0.86 to the script | Real human voice pending |
| G3 | Muse Image renders the user's own words | ☑ | ◐ | ☐ | live: 3 portrait images (1024×1536) from spoken briefs, ~16 s per attempt incl. transcription and check | |
| G4 | Ingredient check + exact label | ☑ | ◐ | ☐ | live: ingredient check + "independent · practice" label; unit/fake: coached after hint | |
| G5 | Practice recovery and scope: 30 s cap, typed fallback marked typed, image-only redraw, session-scoped attempts deleted with their session | ◐ | ☐ | ☐ | fake e2e: 35 s recording refused (413), typed brief checked and marked typed, session deletion removes attempts/images/skill notes | Live check pending |

## H. Deployment and judging

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Cloudflare Worker + Durable Objects + R2 + static assets | ☑ | ◐ | ☐ | deployed: https://coevo-caddie.coevo-meta-hackathon.workers.dev with live calls under the budget | |
| H2 | Health/status, security headers, rate limits | ☑ | ☑ | ☐ | deployed integration 17/17: CSP, Permissions-Policy, frame 429, admin routes closed, test mode off | |
| H3 | Application-enforced budget: approved $3 total, $2.50 lifetime ceiling, single authority; per workspace and per sample caps | ☑ | ☑ | ☐ | unit (36): ledger rules, exact pre-dispatch reservation from counted input tokens, refusal when unverifiable, missing usage kept, ambiguous failures kept, Retry-After honored, no-bypass guards; real Durable Object (`npm run test:budget`): concurrent reservations never exceed $2.50; durable tickets settle once (duplicate, unknown and 20 concurrent settles); tickets reserved before a restart settle once after it; priced model allowlist and WAV-derived audio cost; live: every real call reserved and settled through the deployment; a full session cost Meta $0.163 | |
| H4 | Three entrances: camera / photo / sample session (live model, fixture frames labeled) | ◐ | ☐ | ☐ | sample: six reviewed screenshots of actual Meta AI replies, labeled scripted/fictional | Budget for public live runs: R10 |
| H5 | English docs, reproducible setup | ◐ | ☐ | ☐ | | |
| H6 | Three-minute demo video | ☐ | ☐ | ☐ | | R7 |
| H7 | Submission texts ready (not submitted) | ☐ | ☐ | ☐ | | R8 |
| H8 | Public repository audit (release check, signed-out access) | ☐ | ☐ | ☐ | | |

## Technical spikes (approved plan §6.3)

| ID | Check | Pass criterion | Status | Evidence |
| --- | --- | --- | --- | --- |
| S1 | Spark reading of 20 real phone-camera frames | ≥ 90% request text, 100% tool | ☐ | Scoring ready: each frame against its own human-verified request (word/character accuracy, critical words, "nothing readable" expectations), tool on every frame. Needs the phone run (R3) |
| S2 | SAM 3.1 monitor detection | ≥ 18/20, ≤ 2 s | ☐ | Needs R1 + R3 |
| S3 | Frame → card latency | p50 ≤ 6 s | ◐ | Not yet measured on phone frames. Live, one real screen capture × 3 through the deployed app: separate read+decide p50 11.5 s (4 round trips) → combined turn p50 5.9 s client / 4.9 s server (2 round trips). Benchmark frames now record the phone's own screen change → card time, which is the S3 measure; server time is context only |
| S4 | Meta AI (KR): image generation + rule changes behavior | both reproducible | ☑ (fallback) | Image: PASS (real 1152×2048 poster, private record). Memory across new chats: FAIL. Approved fallback PASS: rule as first message of a dedicated, pinned chat → Meta AI asked audience, price, mood and photo before generating (manual check by the maintainer's account; private record) |
| S5 | Modal open TTS, two English voices, 60 s | acceptable quality, ≤ 60 s render, commercial-use license | ☑ | Kokoro-82M (Apache-2.0); maintainer judged the two voices distinguishable and listenable; 61.6 s two-voice benchmark rendered in 58 s end to end (one bounded run) |
| S6 | Voice Transcribe on 20 s answers | key words correct | ◐ | Live on synthetic speech: similarity 0.86; a 10 s answer kept every key fact but misheard one place name; human voice pending |
| S7 | Muse Image portrait / 9:16 | ratio kept (text rendered in code) | ☑ | Live: requested 1024x1536 → returned 2:3 portrait (0.667) ×3; shorts crop to 9:16 and render text in code. Meta AI consumer app also produced a 1152×2048 (9:16) poster (S4) |
| S8 | Real cost of one full session | under caps | ☑ | Meta $0.163 for 5 screens + answer + five formats (incl. 3 images), plus a $0.08 media reservation; per-task breakdown via `scripts/cost-report.mjs` |

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

**Simulated persona tests — not real-user evidence.** Four model-played personas read the exact screen text, screenshots and the real model output of one live sample run (no app access, no network), and answered a fixed structure. Round 2 re-checked after the fixes.

| Persona | Round 1 top findings | Fixed after round 1 | Round 2 |
| --- | --- | --- | --- |
| Café owner (English as a second language, busy) | Step order unclear and a long URL to type; answering only by voice; long English in podcast/flashcards; "will I pay?" | Numbered steps (computer first), shorter pairing text, "Type instead", spend shown as paid by the demo, plain-language reasons | not rerun |
| Job seeker (cover letters, accepts fluent drafts) | Sample only shows the poster case; personal data vs the free-credit notice; card steps shown for Meta AI only | — (a cover-letter scene is planned for the demo; card steps exist per tool but are not shown in the sample) | not rerun |
| Privacy-cautious office worker | What is sent, to whom, how long, how to delete; voice in an open office | Data table on the aim screen and in Privacy (recipients incl. Modal, what each delete removes, provider limits); typed answers; memory rebuilt from surviving records | Voice resolved; table partly (no retention period stated); on-device masking still missing |
| Hackathon judge (3 min, no phone) | Sample link below the fold; budget for many live runs; wording "nothing is simulated" vs scripted screens; card behind the payoff screen differs | Sample link under the headline; README wording; caption names the earlier card's details | Sample link resolved; budget not resolved (needs a recorded run, see STATUS); scripted owner moves still labeled "coached" |

Open recommendations from the simulations: a recorded live run as the default sample, on-device exclusion masks, a stated retention period, and a "scripted owner" marker in the sample.
