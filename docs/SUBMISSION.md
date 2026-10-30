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
| 8 | 3-minute demo video | Public video URL (check while signed out) |
| 9 | Use of Meta products | Draft below |
| 10 | Why Meta's models matter | Draft below |
| 11 | Partner technology feedback | Draft below |
| 12–13 | Likelihood and opinion surveys | The maintainer's own answers |
| 14 | Consent checkbox | The maintainer decides at final submission |
| 15 | Submit | The maintainer only |

## Before publication

- [ ] Only event-period code and properly licensed dependencies/assets (Kokoro-82M Apache-2.0; fonts via Google Fonts OFL).
- [ ] `npm run verify` and `npm run check:release -- --staged` pass; the exact staged diff and commit metadata reviewed.
- [ ] No secrets, private notes, account screenshots, raw sessions or personal frames.
- [ ] Project license decided by the maintainer.
- [x] README explains the earlier concept and the new implementation; demo opening says the same.
- [ ] Claims match evidence: real model output, fixture data and simulated persona tests are labeled.

## Three-minute storyboard

Composition (maintainer's decision, Oct 31): the phone is **assumed** to stand beside the monitor, as in the earlier Coevo project. The video says so on screen ("Concept setup"), then shows real browser recordings: the deployed phone screen at phone size with a controlled camera (a monitor showing screenshots of actual Meta AI replies) and the recorded live run. Every Caddie line on screen is real model output; the café owner is a scripted, fictional persona and says so; spoken input is a synthetic voice; the follow-up chat is a separate recorded session that began with the card, not an elapsed week. Lines below are quoted from verified runs.

| Time | Scene | Shows (source) |
| --- | --- | --- |
| 0:00–0:12 | Concept setup | Title card: a new implementation built during the hackathon from the earlier Coevo concept; "Concept setup: phone assumed beside the monitor; controlled camera and synthetic voice; real model output." |
| 0:12–0:40 | Split screen | Three vague requests ("Make it more premium." · "Still not premium enough. Make it more premium."); quiet notes such as "Saw premium revision with poster; holding quiet."; then the question card: "What is your new dessert — flavor, size, what makes it different?" (recorded live run) |
| 0:40–1:05 | The owner's brief | The specific brief appears in Meta AI; the Caddie: "You added who it's for, a concrete number, a concrete feeling, specific details." labeled *with the Caddie*. (A spoken answer and its transcribed reply exist from another live run.) |
| 1:05–1:30 | Wrap | "You repeated 'more premium' three times before giving audience, product, price, and mood." Note and My playbook; the proposed card. |
| 1:30–1:55 | Formats | Flashcard, the 141 s two-voice podcast (guest objection, advice narrowed), the 44 s short with the owner's before and after screens — each with its "why now"; the podcast is marked as made on request. |
| 1:55–2:15 | Practice Range | The live request "Please design a window poster for our cafe's new honey oat latte for morning commuters." → a typed scripted brief → Muse Image poster → "You supplied audience, price, mood, product detail, and real photo." (sample-labeled; a spoken synthetic-voice attempt exists too, where "six thousand won" was transcribed as "6,001"). |
| 2:15–2:45 | **Climax** | A separate pinned Meta AI chat that starts with the app's card: "Make a poster for our new drink." Meta AI asks five questions first. Phone: "AI asked first as card says, staying quiet." The card turns *observed working*. |
| 2:45–2:55 | Cameo | Another tool, another task: four screenshots of actual ChatGPT replies to a scripted, fictional cover letter ("Make it more professional." · "Still too plain. Make it more professional."). The live Caddie stayed quiet twice, then asked: "What is one real project you coordinated that you want in this letter?" |
| 2:55–3:00 | Close | The four Meta models and their roles; live output on a scripted persona; one-line limitation (the rule works inside one pinned chat). |

## Draft texts (finalize only with verified numbers)

**6 · Project description**

Coevo Caddie is a coach on the phone beside your screen. It watches how you work with any AI tool, steps in only when it matters, and helps both you and your AI get better.

People stuck with an AI tool often repeat vague requests like "make it more premium", because nothing shows them what the AI is missing. Coevo Caddie turns the phone you already keep beside your monitor into a caddie:

- **It watches quietly.** The camera reads your screen only when it changes, and only the boxed screen area leaves the phone (plus one disclosed setup photo if you ask it to find your screen).
- **It decides when to speak.** Muse Spark decides whether to step in, always with a reason, and staying quiet is a decision too. When it steps in, it asks one question in your own words, and you answer out loud.
- **It makes only what the session earned.** Afterwards you get a note, a playbook, applied flashcards, a two-voice podcast you can interrupt, and a 9:16 short built on your own before/after screens.
- **Your AI learns too.** It proposes a Caddie card for your AI. Approve it and start a pinned chat with it, and next time your AI asks the right questions first while the Caddie stays quiet.

Evidence is labeled honestly: on your own, with the Caddie, AI wrote it, or not seen yet.

Live app: https://coevo-caddie.coevo-meta-hackathon.workers.dev. Open /desk on a computer and /caddie on a phone, or /sample with no phone. The sample replays a labeled recorded live run on screenshots of actual Meta AI replies to a scripted, fictional café scenario — the Caddie's real output, five formats, podcast and short — with no new model calls; "Run it live" makes fresh calls. Model spend is capped by the app.

**9 · Use of Meta products**

- **Muse Spark 1.3** reads phone photos of any AI tool's screen into structured moments. It decides each intervention, or each silence, with deterministic guardrails. It writes one learning design per session and the five formats from it. It also writes and checks Practice Range requests.
- **SAM 3.1** finds the monitor on one disclosed setup photo, so the phone crops on-device afterwards. It also points at a poster's price, title or product photo on a kept frame for visual coaching ("The price isn't visible."); on a real Meta AI screenshot it boxed the poster's price and title and ignored the same price in the chat.
- **Muse Voice Transcribe** turns spoken answers and practice briefs into text.
- **Muse Image** draws what a spoken practice brief produces, and the background scenes of the short.
- **Meta AI** (consumer) is the demo's work tool. Its poster image generation and in-chat rule following were checked in a real account.

All model calls are server-side with Standard models, strict JSON schemas, and an application-enforced lifetime budget.

**10 · Why Meta's models matter**

Seeing the screen is what makes the Caddie work with every AI tool without integrations. Muse Spark's image understanding turns a phone photo of ChatGPT, Gemini or Meta AI into the same structured moment. SAM 3.1 keeps the room out of every later frame. Voice Transcribe lets a busy café owner answer while working, and those spoken details become the brief. Muse Image closes the loop in practice: you hear your own words, then see what they produce.

**11 · Partner technology feedback**

Modal runs the open-source Kokoro-82M text-to-speech and the ffmpeg composition for the podcast and the short. Meta's API has no text-to-speech. We used explicit CPU and memory limits, one container, no warm pool, a memory snapshot and async spawn/poll from the Worker; a 61.6-second two-voice episode rendered in 58 seconds end to end. One gotcha worth documenting: `from __future__ import annotations` in the web endpoint module made FastAPI treat the injected request as a query parameter (HTTP 422) until it was removed.

**Verified results so far (never estimate; see docs/VERIFICATION.md):**
- Reading actual Meta AI screens: latest request word-set match 1.0 and tool 1.0 on screen captures. **S1 on 20 real phone-camera frames: pending (R3).**
- Latency: combined read-and-decide turn, median 5.9 s at the client / 4.9 s on the server on a screen capture (3 runs); 6–9 s per turn in full sessions. **S3 on the phone (screen change → card): pending.**
- S5: a 61.6 s two-voice episode rendered in 58 s end to end (one bounded run); product podcasts 93–141 s; shorts 38.9–44.3 s at 1080×1920.
- S8: one full session (5 screens, a spoken answer, five formats including 3 images) cost $0.163 in Meta usage plus a $0.08 media reservation.
- The card in Meta AI: sent as the first message of a pinned chat, it made Meta AI ask for audience, product, price and mood first; memory across new chats did not carry the rule.
- Judging and checking habits: on an actual Meta AI screen where the scripted owner rejects invented opening hours and forbids invented claims, the reading recorded the correction and the no-invention request, and both habits were stored ($0.0091).
- A server restart in the middle of reading, deciding or replying never leaves the phone stuck: the moment is marked interrupted and nothing is invented (checked with a real local process restart, test models).
- Another tool: on four actual ChatGPT screens (scripted, fictional cover letter) the live Caddie read the tool and each request, stayed quiet twice, then asked one question; $0.038.
- Persona simulations: see the labeled simulation section (never real-user evidence).
