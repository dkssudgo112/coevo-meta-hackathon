# Submission and three-minute demo

Submit through the [event platform](https://cerebralvalley.ai/e/meta-ai-developer-hackathon). Deadline: **November 5, 2026, 11:00 KST**. The maintainer presses the final submit button; nothing has been submitted.

## Form fields (in the platform's order)

| # | Field | Plan |
| --- | --- | --- |
| 1 | Team name | Maintainer |
| 2 | Team members | Only actual collaborators |
| 3 | Track | Indie Developer |
| 4 | Problem statement | Build for Your World |
| 5 | Most Viral X post (optional) | Optional |
| 6 | Project description | Draft below; includes the live app URL (the form has no separate field) |
| 7 | Public GitHub repository | https://github.com/dkssudgo112/coevo-meta-hackathon (check while signed out) |
| 8 | 3-minute demo video | https://coevo-caddie.coevo-meta-hackathon.workers.dev/demo (the app's own watch page; the official guide allows any public link; check playback while signed out and the exact published bytes) |
| 9 | Use of Meta products | Draft below |
| 10 | Why Meta's models matter | Draft below |
| 11 | Partner technology feedback | Draft below |
| 12–13 | Likelihood and opinion surveys | The maintainer's own answers (recorded privately) |
| 14 | Consent checkbox | The maintainer decides at final submission |
| 15 | Submit | The maintainer only |

## Before publication

- [ ] Only event-period code and properly licensed dependencies/assets (Kokoro-82M Apache-2.0; fonts via Google Fonts OFL).
- [ ] `npm run verify` and `npm run check:release -- --staged` pass; the exact staged diff and commit metadata reviewed.
- [ ] No secrets, private notes, account screenshots, raw sessions or personal frames.
- Optional: a project license is the maintainer's choice. The competition requires a public repository, not a license.
- [x] README explains the earlier concept and the new implementation; demo opening says the same.
- [ ] Claims match evidence: real model output, fixture data and simulated persona tests are labeled.

## Three-minute storyboard

Composition (maintainer's decision, Oct 31): the phone is **assumed** to stand beside the monitor, as in the earlier Coevo project. The opening card says so. The run scenes are still captures of the deployed app at phone size, taken during one live run with a controlled camera (a monitor showing screenshots of actual Meta AI replies) and a synthetic voice; each is shown beside the Meta AI screen the camera saw at that moment. Every Caddie line on screen is real model output; the café owner is a scripted, fictional persona. A tag on each scene names its run: this run, an earlier recorded live run (replay, podcast, short), a separate Practice sample session, a separate pinned-chat check with an earlier card, and a separate ChatGPT run. The Practice scene is a screen recording of the stored result (no new model calls). The full cut is 2:41.

| Time | Scene | What is shown |
| --- | --- | --- |
| 0:00–0:08 | Title | A new implementation built during the hackathon from the earlier Coevo concept; "Assumed setup: phone beside the monitor, controlled camera, synthetic voice." |
| 0:08–0:28 | This run | Phone setup (only the boxed area is sent); "Make it more premium." → quiet, with the reason; the third vague request → "What exactly is your new dessert — flavor and what makes it special?" |
| 0:28–0:46 | Answer | The synthetic spoken answer plays ("It is matcha Basque cheesecake…"), then: "You named matcha, but the poster still shows berry. Tell AI your price, your real matcha photo, and who it's for." |
| 0:46–1:03 | Brief and wrap | The full brief, labeled *with the Caddie*, SAM 3.1's price marker; session end: note, playbook, flashcards and a short; no podcast: "No real objection or trade-off was stated." |
| 1:03–1:48 | Earlier recorded run | The /sample replay (no new model calls); its podcast, made on request (guest objection, advice narrowed); its vertical short. |
| 1:48–2:00 | Practice Range | "Please design a window poster for our cafe's new honey oat latte for morning commuters." → a typed scripted brief → a Muse Image poster drawn from the brief → all five ingredients found in the brief (sample-labeled). |
| 2:00–2:14 | Pinned-chat check | A separate pinned Meta AI chat that began with an earlier card: Meta AI asks five questions first; the Caddie: "AI asked first as card says, staying quiet." This run's new card stays proposed. |
| 2:14–2:28 | Cameo | Actual ChatGPT replies to a scripted, fictional cover letter; the Caddie stayed quiet twice, then asked: "What is one real project you coordinated that you want in this letter?" |
| 2:28–2:41 | Close | The four Meta models and their jobs; live model output with scripted personas; physical camera accuracy not measured. |

## Draft texts (finalize only with verified numbers)

**6 · Project description**

Coevo Caddie is a coach on the phone beside your screen. It watches how you work with any AI tool, steps in only when it matters, and helps both you and your AI get better. It is a new implementation written during the event, built from the concept of my earlier Coevo project.

People stuck with an AI tool often repeat vague requests like "make it more premium", because nothing shows them what the AI is missing. Coevo Caddie turns the phone you already keep beside your monitor into a caddie:

- **It watches quietly.** The camera reads your screen only when it changes, and only the boxed screen area leaves the phone (plus one disclosed setup photo if you ask it to find your screen).
- **It decides when to speak.** Muse Spark decides whether to step in, always with a reason, and staying quiet is a decision too. When it steps in, it asks one question in your own words, and you answer out loud.
- **It makes only what the session earned.** Afterwards you get a note, a playbook, applied flashcards, a two-voice podcast you can interrupt, and a 9:16 short built on your own before/after screens.
- **Your AI learns too.** It proposes a Caddie card for your AI. Approve it and start a pinned chat with it, and next time your AI asks the right questions first while the Caddie stays quiet.

Evidence is labeled honestly: on your own, with the Caddie, AI wrote it, or not seen yet.

What is real: every Caddie line, every note, playbook, flashcard, podcast script and short script, and every practice image is written or drawn live by Meta's models through the deployed app; the podcast and short voices are Kokoro-82M text-to-speech on Modal. The café owner and job applicant are scripted, fictional personas; the AI screens are actual replies to those scripts. As in our earlier Coevo work, the phone is assumed to stand beside the monitor: the phone screen is verified in a phone-sized browser with a controlled camera and a synthetic voice, so physical camera accuracy and a human voice were not measured.

Demo: https://coevo-caddie.coevo-meta-hackathon.workers.dev/demo

Live app: https://coevo-caddie.coevo-meta-hackathon.workers.dev. Open /desk on a computer and /caddie on a phone, or /sample with no phone. The sample replays a labeled recorded live run on screenshots of actual Meta AI replies to a scripted, fictional café scenario — the Caddie's real output, five formats, podcast and short — with no new model calls; "Run it live" makes fresh calls. Model spend is capped by the app.

**9 · Use of Meta products**

- **Muse Spark 1.3** reads phone photos of any AI tool's screen into structured moments. It decides each intervention, or each silence, with deterministic guardrails. It writes one learning design per session and the five formats from it. It also writes and checks Practice Range requests.
- **SAM 3.1** finds the monitor on one disclosed setup photo, so the phone crops on-device afterwards. It also points at a poster's price, title or product photo on a kept frame for visual coaching ("The price isn't visible."); on a real Meta AI screenshot it boxed the poster's price and title and ignored the same price in the chat.
- **Muse Voice Transcribe** turns spoken answers and practice briefs into text.
- **Muse Image** draws what a spoken or typed practice brief produces, and the background scenes of the short.
- **Meta AI** (consumer) is the demo's work tool. Its poster image generation and in-chat rule following were checked in a real account.

All model calls are server-side with Standard models, strict JSON schemas, and an application-enforced lifetime budget.

**10 · Why Meta's models matter**

Seeing the screen is what makes the Caddie work with every AI tool without integrations. Muse Spark's image understanding turns a phone photo of ChatGPT, Gemini or Meta AI into the same structured moment. SAM 3.1 keeps the room out of every later frame. Voice Transcribe lets a busy café owner answer while working, and those spoken details become the brief. Muse Image closes the loop in practice: you hear your own words, then see what they produce.

**11 · Partner technology feedback**

Modal runs the open-source Kokoro-82M text-to-speech and the ffmpeg composition for the podcast and the short. Meta's API has no text-to-speech. We used explicit CPU and memory limits, one container, no warm pool, a memory snapshot and async spawn/poll from the Worker; a 61.6-second two-voice episode rendered in 58 seconds end to end. One gotcha worth documenting: `from __future__ import annotations` in the web endpoint module made FastAPI treat the injected request as a query parameter (HTTP 422) until it was removed.

**Verified results so far (never estimate; see docs/VERIFICATION.md):**
- Reading actual Meta AI screens: latest request word-set match 1.0 and tool 1.0 on screen captures. Physical phone-camera accuracy (S1) not measured: the phone is an assumed setup.
- Latency: combined read-and-decide turn, median 5.9 s at the client / 4.9 s on the server on a screen capture (3 runs); 6–9 s per turn in full sessions. Phone screen-change-to-card time (S3) not measured (assumed setup); in the browser a camera frame took about 10 s on the server.
- S5: a 61.6 s two-voice episode rendered in 58 s end to end (one bounded run); product podcasts 93–141 s; shorts 38.9–44.3 s at 1080×1920.
- S8: one full session (5 screens, a spoken answer, five formats including 3 images) cost $0.163 in Meta usage plus a $0.08 media reservation.
- The card in Meta AI: sent as the first message of a pinned chat, it made Meta AI ask for audience, product, price and mood first; memory across new chats did not carry the rule.
- Judging and checking habits: on an actual Meta AI screen where the scripted owner rejects invented opening hours and forbids invented claims, the reading recorded the correction and the no-invention request, and both habits were stored ($0.0091).
- A server restart in the middle of reading, deciding or replying never leaves the phone stuck: the moment is marked interrupted and nothing is invented (checked with a real local process restart, test models).
- The full flow at phone size (assumed setup: controlled camera on actual Meta AI screens, synthetic voice): quiet twice → a question → the spoken answer transcribed → the ingredients step → the brief labeled with the Caddie, with SAM 3.1's price pointer → a wrap that skipped the podcast for a stated reason; $0.1465.
- Another tool: on four actual ChatGPT screens (scripted, fictional cover letter) the live Caddie read the tool and each request, stayed quiet twice, then asked one question; $0.038.
- Persona simulations: see the labeled simulation section (never real-user evidence).
