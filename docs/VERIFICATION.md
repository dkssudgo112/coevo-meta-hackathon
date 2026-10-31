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

**Local fake-model journey** (`npm run test:e2e-fake`, TEST ONLY): with a scripted fake model server on 127.0.0.1 the whole server path passes 64/64 checks (incl. deletion during slow model calls and slow storage writes, a media job dispatched during a slow poll, revoking a retained card, a skipped ladder step regenerated or refused, SAM pointers kept inside the poster, and moments interrupted by a restart) — frames → readings → quiet/intervene decisions with grounded quotes → voice answer → frameless reply → coached change → wrap with a reason per format → all five formats ready (123.8 s podcast, 40.8 s short, both downloadable) → card edit/approve/apply → next session "AI asked first" → card observed-working → practice labels (independent; coached after hint) → podcast Ask → flashcard interval → misread → frame deletion → revoke history → spend under cap. All of it is labeled `fixture`; it proves the server logic, not real model quality, camera legibility or deployment.

**Live end-to-end session** (deployed app, real models, scripted fictional café on five screenshots of actual Meta AI replies, synthetic voice): quiet notes → intervention at the question step quoting the person → spoken answer transcribed → Caddie reply → specific brief labeled coached → all five formats (note, My playbook, flashcards, 93 s podcast, 38.9 s 1080×1920 short) → card approved. Meta $0.163 + $0.08 media reservation. Not real-user or learning evidence.

Last updated: 2026-10-31 (KST).

**Scope decision (maintainer, Oct 31):** the phone is assumed to stand beside the monitor, as in the earlier Coevo project. The flow is verified in a phone-sized browser with controlled camera and microphone input and screenshots of actual AI replies. Physical-device measurements (camera-frame reading accuracy and latency, SAM on phone photos, haptics, camera indicator, a human voice) are marked **assumed setup, not measured** — they are not claimed and no longer block completion.

**Final assumed-setup run (deployed, real models, Oct 31):** the deployed phone screen at 390×844 with a controlled camera (a drawn monitor showing screenshots 1, 2, 3 and 5 of actual Meta AI replies to the scripted café owner) and a controlled microphone playing a synthetic voice. Quiet twice, each with a reason → at the third vague request the question "What exactly is your new dessert — flavor and what makes it special?" → an 8.8 s synthetic spoken answer, transcribed → the ingredients step: "You named matcha, but the poster still shows berry. Tell AI your price, your real matcha photo, and who it's for." → the specific brief labeled *with the Caddie*, with SAM 3.1's price pointer → session ended: note, playbook, flashcards and short made, podcast skipped ("No real objection or trade-off was stated"), the new card left proposed. Meta $0.1465. It also found that the camera kept running after End session; fixed (the camera now stops; checked with a controlled camera). Kept as still captures of the live screens (the screen recorder failed); not real-user evidence.

## A. Observation

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Phone rear camera capture over HTTPS | ◐ | ☐ | ☐ | browser (assumed setup): the deployed phone screen at 390×844 with a controlled camera — a canvas showing a monitor with screenshots of actual Meta AI replies — started the camera and sent frames that live Muse Spark read correctly. A bug found this way is fixed: the camera never started when the Live screen first showed "Connecting…" | Physical phone camera not measured |
| A2 | Device-side crop to the screen before upload; setup frame disclosed | ◐ | ◐ | ☐ | browser (assumed setup, live): corners dragged onto the drawn screen, frames uploaded as 772×511 device-cropped crops and read live; SAM found no monitor in the drawing and the app fell back to manual corners; code: `FrameSampler` crops on device; aim screen discloses the one setup photo | Physical phone not measured (assumed setup) |
| A3 | On-device change detection (send only after a settled change) | ◐ | ◐ | ☐ | unit: `packages/core/test` (incl. a 1.6% change sent, 0.8% noise not); browser (assumed setup): each screen change was sent once; measured on six actual AI-chat screens the steps were only 1.6–6.9% at 64 px, so the send threshold was lowered from 3.5% to 1.5% | Thresholds not tuned on a physical phone (assumed setup) |
| A4 | SAM 3.1 finds the screen on the disclosed setup frame → crop suggestion | ☐ | ☐ | ☐ | | S2 |
| A5 | Spark reads a frame → validated `Reading` | ☑ | ◐ | ☐ | live: actual Meta AI screens read correctly (request word-set 1.0, tool 1.0); live session read 5 screens in order, 6–9 s per turn; the final assumed-setup run read screens 1, 2, 3 and 5 through the controlled camera | Physical phone-camera frames not measured (assumed setup; S1) |
| A6 | Photo fallback (single photo) | ◐ | ☐ | ☐ | code: phone photo + crop, Desk screenshot upload | |
| A7 | Desk screen-share fallback (`getDisplayMedia`) | ◐ | ☐ | ☐ | code: Desk sampler | |
| A8 | Raw frames discarded after reading; evidence frames kept and deletable | ◐ | ☐ | ☐ | integration: unreadable/disabled frame deleted; code: retention rule + delete API | |
| A9 | Unreadable frames retried quietly; after three in a row "Tilt me a little, or take one photo."; model/network errors show "Caddie paused — connection." and never count as unreadable | ◐ | ◐ | ☐ | unit: run counting (errors neither count nor break the run); TEST build in the browser (photo mode): an unreadable photo shows the hint, an injected model 500 shows the paused state with one NOW card and no empty Caddie card | Camera-mode quiet retry not exercised (assumed setup, not measured) |
| A11 | A server restart never leaves a moment "Reading…": an unread frame, a decision lost after reading and a lost reply are closed as interrupted (nothing invented, no skill recorded, reservation unchanged, raw frame discarded unless benchmark); the phone says "The Caddie restarted and missed this look." and camera mode resends once | ☑ | ☑ | ☐ | real local process restart (reviewer-run, fake providers, same storage, old process verified gone): unread frame → interrupted with the raw frame discarded; a finished reading awaiting a regenerated decision → reading and change kept, quiet "decision interrupted"; a frameless reply → the typed answer kept, quiet interruption; a moment left pending by the pre-fix build also recovers; no invented skills; a new frame works; fake ledger unchanged. Also fake e2e via the TEST restart hook (the old task cannot overwrite) and the missed-look card in the TEST build | Not exercised with real models or on a phone |
| A10 | SAM 3.1 visual coaching: points at the poster's title, photo or price; a requested part that is missing is shown as "The price isn't visible." on the whole poster | ☑ | ◐ | ☐ | live (deployed, Oct 31, actual Meta AI screenshot of the scripted café poster): SAM 3.1 boxed the price at IoU 0.92 with a reviewer-annotated price region and the title on its annotated region; the same price in the chat text above was excluded because only boxes inside the poster count; SAM finds no "poster", so the outline is Muse Spark's estimate and the caption says so ($0.0175). Earlier live probes: SAM answers concrete nouns ("price", "cake") and returns a true empty answer for "poster", "image", "text"; unit: SAM finds the poster first and only part boxes inside it count (regions from a real Meta AI screenshot: a more confident price match in the chat text is ignored); only for a designed result (a cover letter never gets poster coaching); fake e2e + TEST build in the browser: dashed "Missing: price" box on the poster, labelled title/photo boxes, caption names SAM 3.1; runs once per request after the decision, never delays the NOW card | One screenshot, not camera frames; accuracy on phone photos unmeasured |

## B. Caddie

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Every decision has a reason, quiet included (live model) | ☑ | ◐ | ☐ | live session: quiet notes ("Second premium request, still converging, staying quiet."), cooldown note, intervention reason | |
| B2 | Ladder question → ingredients → example; no skipping | ◐ | ◐ | ☐ | unit: a skipped-ahead proposal is refused whole (never relabelled with its example text), a requested example without a brief is refused; fake e2e: the Worker asks the model once more for the allowed step (regenerated), a second skip stays quiet; the allowed step is now sent to the model; live: intervention at the question step quoting "more premium" ; final assumed-setup run: the question step, then after the spoken answer the ingredients step ("Tell AI your price, your real matcha photo, and who it's for.") | Example step not exercised live |
| B3 | NOW card + session flow, one primary action; an answer in progress is never replaced | ◐ | ◐ | ☐ | TEST build in the browser: while a typed draft or a recording is open, a newer question waits (no swap, no buzz, "newer note" line), the answer is stored on the question it was started for, then the newer question appears and buzzes once; with a content sheet open a new question waits with a quiet line and buzzes once on return (plan 3.4) | Physical phone not measured (assumed setup) |
| B4 | Voice answer: record → 16 kHz WAV → Voice Transcribe | ☑ | ◐ | ☐ | live: 10 s synthetic answer transcribed (one place name misheard) → Caddie reply; keyword-hint 400 found and fixed (single words, retry without hints); unit + browser (delayed test microphone): a repeated tap while the microphone opens is ignored, cancelling before permission stops the late stream and starts no audio context ; final assumed-setup run: an 8.8 s synthetic answer through the controlled microphone was transcribed and answered live | Human voice not measured (assumed setup; synthetic voice only) |
| B5 | Haptic nudge (`navigator.vibrate`), visual pulse fallback | ◐ | ☐ | ☐ | code: buzz + pulse on every new question, including the first of a quiet session; history on reopen does not buzz (bug found in review, fixed) | Physical haptics not measured (assumed setup); iOS Safari has no vibrate API |
| B6 | Later defers with a longer cooldown; card stays in flow | ◐ | ☐ | ☐ | unit: later-cooldown | |
| B7 | "That's not what I asked" marks a misread and drops its evidence | ◐ | ☐ | ☐ | fake e2e: the moment is marked misread; code: misread moments are skipped by change labels, memory, unreadable-run counting and the NOW card | Exclusion not yet asserted end to end |
| B8 | No interrupt while typing; praise removed; quotes must be grounded | ◐ | ☐ | ☐ | unit | |
| B9 | First-sighting acknowledgement written by the model | ☑ | ☐ | ☐ | live: "See Meta AI making cafe poster; will speak only when helpful." | |
| B10 | Live Caddie voice only with earphones (browser speech synthesis, opt-in) | ◐ | ◐ | ☐ | TEST build in the browser: off by default; turning it on needs "My earphones are in"; a new question is read once; it turns itself off when audio devices change; silent while an answer is in progress | Uses only an English voice that runs on the device (never an online browser voice); browsers cannot detect earphones reliably, so the person confirms; physical phone not measured (assumed setup) |

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
| D3 | 4D observations (no levels or scores); unobserved is not failure | ☑ | ◐ | ☐ | unit: description (added details), delegation (AI asked first, coached), discernment (the request tells the AI to fix a specific wrong or invented detail), diligence (the request tells the AI not to invent details) — each only from the request text, once per request, coached after any intervention; live (deployed, user workspace, phone photo path): an actual Meta AI screen where the scripted café owner rejects the invented opening hours and forbids invented claims was read as a correction ("remove invented opening hours") plus a no-invention request, both observations were stored and the Caddie stayed quiet because the request already said what to fix ($0.0091, reviewer-run) | The recorded sample shows neither (its invented opening hours were not corrected there) |
| D4 | Source links from every card and content item to its moment/frame | ☑ | ◐ | ☐ | TEST build in the browser: "Made from" links on content and cards (phone and Desk), note quotes open the session with the moment highlighted and its kept frame shown; Back retraces content → source → content; Desk links scroll to the evidence row | |
| D5 | Frame deletion keeps the label and marks "source removed" | ☑ | ◐ | ☐ | fake e2e: deleting a frame keeps its "with the Caddie" label and removes the stored image; Desk row shows "Source removed", the short storyboard "(frame deleted)" | Live check pending |
| D6 | Desk evidence rows: FRAME, YOU SAID, CADDIE, THEN | ◐ | ☐ | ☐ | TEST build in the browser: rows per moment with kept frame, quote, Caddie line and label; source links scroll to and flash the row; SAM pointers drawn on the row's frame with the same caption when present (TEST build, checked in a narrow browser pane) | |

## E. AI growth

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Card proposed from the playbook's `cardRule` | ☑ | ◐ | ☐ | live: "Before you make a poster, ask me who it is for, what it is, the price, one feeling, and whether a real photo exists." | |
| E2 | Approve / edit / reject / revoke with history | ☑ | ◐ | ☐ | fake e2e: edit/approve/apply/revoke history; approve → edit updates the Desk copy and the card's checked details; live: approve, apply, revoke after the source session was deleted | |
| E3 | Tool-specific apply text (Meta AI: dedicated pinned chat) | ☑ | ◐ | ☐ | unit: apply hints; S4 fallback observed in real Meta AI | Memory did not persist across new chats |
| E4 | Next session: "AI asked first" observed → `observed-working` | ☑ | ☑ | ☐ | live: the app's own card pinned in a dedicated Meta AI chat → Meta AI asked all five named details → the Caddie read aiAskedFor = all five, stayed quiet ("AI asked first as card says") → card observed-working with the details in its history; unit negatives: approved-only, other tool/task, partial details, unknown task, negated or unrecognized rules | Scoped to one pinned chat, not cross-chat memory |

## F. Content (five formats)

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Shared learning design; the Caddie decides each format with a reason | ☑ | ◐ | ☐ | live: design with a reason per format (e.g. flashcards: "You supplied audience, price, and mood only after Caddie coached you…") | |
| F2 | Note | ☑ | ◐ | ☐ | live: note separating the person's decisions from what the AI produced; quote rules tightened after review | |
| F3 | Manual / My playbook | ☑ | ◐ | ☐ | live: 4 steps with checks and owners, pitfalls, "for your AI" vs "you decide", card rule | |
| F4 | Flashcards with spaced repetition (10 min, 1, 3, 7, 14 days) | ☑ | ◐ | ☐ | unit: spaced; live: 2 transfer cards (a new café product; a mismatched result) | |
| F5 | Two-voice podcast ≥ 60 s, transcript, Ask + resume at the same line | ☑ | ◐ | ☐ | live: 93.5 s Kokoro two-voice episode with an objecting guest and per-line timings; UI: Ask + resume | Live Ask not exercised on a physical phone (assumed setup) |
| F6 | 30–45 s 9:16 short: captions, TTS, mp4 | ☑ | ◐ | ☐ | live: 38.9 s 1080×1920 H.264/AAC with the person's before screen, a diagram and full captions; title overflow found and fixed | |
| F7 | A failed format never blocks the others; per-format retry | ☑ | ◐ | ☐ | fake e2e: injected failures; live: a lost short job failed alone while the other four were ready (race fixed) | |

## G. Practice Range

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Scenario written by the live model; viewing the hint marks the attempt coached | ☑ | ◐ | ☐ | live: 4 scenarios generated; unit + fake e2e: hint → coached | |
| G2 | Spoken brief → transcript | ☑ | ◐ | ☐ | live Voice Transcribe on synthetic speech (macOS voice): 31 and 19 words; word-set similarity 0.86 to the script | Human voice not measured (assumed setup) |
| G3 | Muse Image renders the user's own words | ☑ | ◐ | ☐ | live: 3 portrait images (1024×1536) from spoken briefs, ~16 s per attempt incl. transcription and check | |
| G4 | Ingredient check + exact label | ☑ | ◐ | ☐ | live: ingredient check + "independent · practice" label; unit/fake: coached after hint; input origin stored apart from model origin (live: a scripted synthetic-voice attempt in a fixture session stored as sample input with live-model output, its habit note not counted as real-user evidence, shown with a Sample tag) | Older records with no recorded origin show "origin not recorded" |
| G5 | Practice recovery and scope: 30 s cap, typed fallback marked typed, image-only redraw, session-scoped attempts deleted with their session | ☑ | ◐ | ☐ | fake e2e: 35 s recording refused (413), typed brief checked and marked typed, session deletion removes attempts/images/skill notes, practice opened from a finished session stays with it (browser); a real local process restart (fake providers) during each of the four in-flight states recovered with Retry and kept a finished check and label (independently re-run by the reviewer) | Live check pending |

## H. Deployment and judging

| ID | Requirement | L1 | L2 | L3 | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Cloudflare Worker + Durable Objects + R2 + static assets | ☑ | ◐ | ☐ | deployed: https://coevo-caddie.coevo-meta-hackathon.workers.dev with live calls under the budget; new workspaces are created in Cloudflare's US jurisdiction (Meta's API is not offered in Hong Kong, where earlier workspace objects were placed); an older workspace found in a restricted region copies itself there with its data and token hashes and tells its phone and Desk to follow (fake e2e: data, both tokens and old media keep working; nothing is proxied; four simultaneous requests while a frame is still being read wait, then all get the same single destination and the frame is not lost; after a verified copy the original keeps only its routing record; deleting a session afterwards also deletes media stored under the original id). Live (Oct 31): a new workspace ran in a US colo and was served (token count 200); an older workspace placed in Hong Kong moved on its first request — the same phone and Desk tokens worked at the new id, all 9 sessions and 17 moments were there, and the copy ran in a US colo (200) | The global budget object is unchanged |
| H2 | Health/status, security headers, rate limits | ☑ | ☑ | ☐ | deployed integration 17/17: CSP, Permissions-Policy, frame 429, admin routes closed, test mode off | |
| H3 | Application-enforced budget: US$100 lifetime total including earlier spend (raised from $2.50 on Oct 31, same ledger), single authority; per workspace and per sample caps | ☑ | ☑ | ☐ | unit (36): ledger rules, exact pre-dispatch reservation from counted input tokens, refusal when unverifiable, missing usage kept, ambiguous failures kept, Retry-After honored, no-bypass guards; real Durable Object (`npm run test:budget`): a configured $1000 is clamped to $100 and a lower configured $2.50 is respected; concurrent reservations never exceed the ceiling; after a restart the ledger keeps its spend, start time and reservation count; durable tickets settle once (duplicate, unknown and 20 concurrent settles); tickets reserved before a restart settle once after it; priced model allowlist and WAV-derived audio cost; live: every real call reserved and settled through the deployment; a full session cost Meta $0.163 | |
| H4 | Three entrances: camera / photo / sample session (live model, fixture frames labeled) | ☑ | ◐ | ☐ | live: the full public sample on the deployed app (all five formats, $0.2034 Meta + $0.08 media reservation); a labeled recorded live run of it replays with no model calls as the default preview (deployed; exact reviewed bytes; reviewer fact-check notes beside the output) | Physical phone camera not measured (assumed setup); the camera path ran in a phone-sized browser with a controlled camera |
| H5 | English docs, reproducible setup | ◐ | ☐ | ☐ | | |
| H6 | Demo video under three minutes | ☑ | ☐ | ☐ | Oct 31: a 2:40 film from real captures of the deployed app, published at /demo with English captions; every scene tagged with its run; exact published bytes in `scripts/reviewed-assets.json` | Signed-out playback is checked after each deploy |
| H7 | Submission texts ready (not submitted) | ☐ | ☐ | ☐ | | R8 |
| H8 | Public repository audit (release check, signed-out access) | ☑ | ◐ | ☐ | Oct 30: signed-out requests to the repository page and raw docs return 200 and show the latest README; Gitleaks over the full history (59 commits): no leaks; no private, account, local-notes or secret paths in any commit; every commit uses the noreply address; the release check reads the staged index with an exact-hash allowlist for binaries | Re-run before submission; project license still the maintainer's decision |

## Technical spikes (approved plan §6.3)

| ID | Check | Pass criterion | Status | Evidence |
| --- | --- | --- | --- | --- |
| S1 | Spark reading of 20 real phone-camera frames | ≥ 90% request text, 100% tool | assumed setup, not measured | Scoring ready: each frame against its own human-verified request (word/character accuracy, critical words, "nothing readable" expectations), tool on every frame. Not run: assumed setup |
| S2 | SAM 3.1 monitor detection | ≥ 18/20, ≤ 2 s | assumed setup, not measured | Protocol and tools ready ([S2-PROTOCOL.md](S2-PROTOCOL.md)): 20 distinct real phone photos with consent, a person-drawn screen box made before any model sees them, scoring by coverage/area and each photo's server SAM time (the plan's "≤ 2 s" read conservatively as every photo), deletion afterwards. Not run: assumed setup |
| S3 | Frame → card latency | p50 ≤ 6 s | ◐ | Phone-frame latency not measured (assumed setup). Live, one real screen capture × 3 through the deployed app: separate read+decide p50 11.5 s (4 round trips) → combined turn p50 5.9 s client / 4.9 s server (2 round trips). Benchmark frames now record the phone's own screen change → card time, which is the S3 measure; server time is context only |
| S4 | Meta AI (KR): image generation + rule changes behavior | both reproducible | ☑ (fallback) | Image: PASS (real 1152×2048 poster, private record). Memory across new chats: FAIL. Approved fallback PASS: rule as first message of a dedicated, pinned chat → Meta AI asked audience, price, mood and photo before generating (manual check by the maintainer's account; private record) |
| S5 | Modal open TTS, two English voices, 60 s | acceptable quality, ≤ 60 s render, commercial-use license | ☑ | Kokoro-82M (Apache-2.0); maintainer judged the two voices distinguishable and listenable; 61.6 s two-voice benchmark rendered in 58 s end to end (one bounded run) |
| S6 | Voice Transcribe on 20 s answers | key words correct | ◐ | Live on synthetic speech: similarity 0.86; a 10 s answer kept every key fact but misheard one place name; human voice not measured (assumed setup) |
| S7 | Muse Image portrait / 9:16 | ratio kept (text rendered in code) | ☑ | Live: requested 1024x1536 → returned 2:3 portrait (0.667) ×3; shorts crop to 9:16 and render text in code. Meta AI consumer app also produced a 1152×2048 (9:16) poster (S4) |
| S8 | Real cost of one full session | under caps | ☑ | Meta $0.163 for 5 screens + answer + five formats (incl. 3 images), plus a $0.08 media reservation; per-task breakdown via `scripts/cost-report.mjs` |

## Screen states

| Screen | Waiting | Empty | Failure | Partial success | Retry | Return to context | Delete / revoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phone · Pair | ☐ | ☐ | ☐ | — | ☐ | ☐ auto re-pair | — |
| Phone · Live | ◐ reading | ◐ "Work as usual" | ◐ paused — connection; can't read → tilt or photo | ☐ | ◐ quiet retry of an unreadable frame (camera, code) | ◐ answer in progress kept; newer question waits | ☐ pause |
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
| Hackathon judge (3 min, no phone) | Sample link below the fold; budget for many live runs; wording "nothing is simulated" vs scripted screens; card behind the payoff screen differs | Sample link under the headline; README wording; caption names the earlier card's details; round 3: recorded live run as the default preview | Round 2: budget not resolved. Round 3 (on the recorded preview): budget resolved on the judge's path; asked to explain labels on scripted changes, name the models not used in the replay, and mark the model-written podcast guest — all added after round 3 |

**Round 4 (simulated, phone states added on Oct 30):** the café owner, privacy-cautious worker and judge personas read the exact text of the new phone states (answer in progress kept, microphone states, reading a sheet, unreadable screen, connection pause, earphone read-aloud, SAM poster pointers, the four habits). Fixed after it: the connection pause now says "Can't reach the Caddie's AI right now" with the error as a separate detail; a blocked microphone says how to allow it or type instead; the recording timer reads m:ss; a voice answer says the audio is not kept; one word ("question") for the waiting item; habits explained in plain words with what makes each one appear; the SAM caption names the kept screen photo and where to delete it; read-aloud uses only a voice that runs on the phone (the earlier "nothing is sent" line could be untrue with an online browser voice).

Open recommendations from the simulations: on-device exclusion masks and a stated retention period (privacy persona); a cover-letter example (job-seeker persona); a way to turn vibration off and a "back to the question" button inside sheets (round 4).
