# Submission and demo

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
| 15–22 | Optional recommendation and product-feedback questions | Added to the platform by October 31; left blank unless the maintainer chooses to answer |
| 23 | Submit | The maintainer only |

## Before publication

- [x] Only event-period code and properly licensed dependencies/assets (Kokoro-82M Apache-2.0; fonts via Google Fonts OFL).
- [x] `npm run verify` and `npm run check:release -- --staged` pass; the exact staged diff and commit metadata reviewed.
- [x] No secrets, private notes, account screenshots, raw sessions or personal frames.
- Optional: a project license is the maintainer's choice. The competition requires a public repository, not a license.
- [x] README explains the earlier concept and the new implementation; the demo's closing scene says the same ("Coevo Caddie app: newly implemented during this hackathon. Based on my earlier Coevo concept.").
- [x] Claims match evidence: real model output, fixture data and simulated persona tests are labeled.

## Demo storyboard (2:52)

The film at /demo was made with [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) and Remotion from real captures of the deployed app. One persona and one live run carry the story: a scripted, fictional café owner and actual Meta AI replies. The phone is **assumed** to stand beside the monitor, as in the earlier Coevo project: the phone screens come from a live run in a phone-sized browser with a controlled camera, and the spoken answer was a synthetic voice, whose audio the film does not play (it shows a waveform and the transcript exactly as stored). A tag on each scene names its run. The opening setup picture is a labeled illustration; the narration is a synthetic voice (Kokoro-82M), and English captions ship with the player. No development budget or cost figures appear in the film.

| Time | Scene | What is shown |
| --- | --- | --- |
| 0:00–0:06 | Title | "Coevo Caddie. A coach on the phone beside your screen." |
| 0:06–0:19 | The problem | Actual Meta AI screens; the owner's three requests stack up: "make it more premium", again and again. |
| 0:19–0:34 | Setup in four steps | The labeled illustration, then real app screens (camera view simulated, pairing code blurred): open the Desk, scan the code, aim at the screen and tap Start watching, keep working. |
| 0:34–0:48 | Quiet, then one question | The Caddie stays quiet with its reasons, then asks: "What exactly is your new dessert — flavor and what makes it special?" |
| 0:48–1:02 | The answer, out loud | The stored transcript of the synthetic spoken answer; the Caddie names what is missing: "Tell AI your price, your real matcha photo, and who it's for." |
| 1:02–1:13 | The brief changes | Before and after Meta AI screens (berry poster → matcha poster with its price), labeled *with the Caddie*; SAM 3.1's price marker. |
| 1:13–1:27 | What the session leaves | The Desk's five rows: note, playbook, flashcards, short, and no podcast, with the reason it gave. |
| 1:27–1:49 | Earlier recorded run | An excerpt of its two-voice podcast and the opening of its vertical short. |
| 1:49–2:13 | Practice Range | One separate live sample: Maya’s request and price notes → a scripted brief without the price → first draft without a price → a price-fix choice saved before feedback → the Caddie’s answer from Muse Spark’s reading → one coached revision → both drafts and their comparison. Prices and audience are now visible in that reading; the real photo is still the person’s to add. |
| 2:13–2:33 | Your AI learns too | This run's card stays proposed. A separate pinned Meta AI chat that began with a card approved in an earlier run: asked for a new drink poster, Meta AI asks five questions first, and the Caddie stays quiet. |
| 2:33–2:45 | Four Meta models | Muse Spark reads and decides, SAM 3.1 points, Muse Voice Transcribe listens, Muse Image draws. |
| 2:45–2:52 | Close | "Keep your AI. Add a caddie beside it." The app URL and the notice: "Coevo Caddie app: newly implemented during this hackathon. Based on my earlier Coevo concept." |

## Draft texts (finalize only with verified numbers)

**6 · Project description**

Coevo Caddie is a coach on the phone beside your screen. It watches how you work with any AI tool, steps in only when it matters, and helps both you and your AI get better. It is a new implementation written during the event, built from the concept of my earlier Coevo project.

People stuck with an AI tool often repeat vague requests like "make it more premium", because nothing shows them what the AI is missing. Coevo Caddie turns the phone you already keep beside your monitor into a caddie:

- **It watches quietly.** The camera reads your screen only when it changes, and only the boxed screen area leaves the phone (plus one disclosed setup photo if you ask it to find your screen).
- **It decides when to speak.** Muse Spark decides whether to step in, always with a reason, and staying quiet is a decision too. When it steps in, it asks one question in your own words, and you answer out loud.
- **It makes only what the session earned.** Afterwards you get a note, a playbook, applied flashcards, a two-voice podcast you can interrupt, and a 9:16 short built on your own before/after screens.
- **You rehearse the next decision.** A fictional colleague brings a changed request in the Practice Range. You brief the AI, judge its draft before feedback, and revise once. Muse Spark checks the words and reads the image separately; the before-and-after view keeps what you said distinct from what the AI actually drew. The first attempt stays intact and the revision is labeled with the Caddie.
- **Your AI learns too.** It proposes a Caddie card for your AI. Approve it and start a pinned chat with it, and next time in that chat your AI asks the right questions first while the Caddie stays quiet.

Evidence is labeled honestly: on your own, with the Caddie, AI wrote it, or not seen yet.

What is real: screen readings, intervention messages, scenarios, notes, playbooks, flashcards, podcast and short scripts, and practice images were produced by Meta's models through the deployed app. Deterministic rules enforce evidence labels and compare a person's Practice judgment with the model's image reading. The podcast and short voices are Kokoro-82M text-to-speech on Modal. The café owner and job applicant are scripted, fictional personas; the AI screens are actual replies to those scripts. As in our earlier Coevo work, the phone is assumed to stand beside the monitor: the phone screen is verified in a phone-sized browser with a controlled camera and a synthetic voice, so physical camera accuracy and a human voice were not measured.

Demo: https://coevo-caddie.coevo-meta-hackathon.workers.dev/demo

Live app: https://coevo-caddie.coevo-meta-hackathon.workers.dev. Open /desk on a computer and /caddie on a phone.

No-phone walkthrough: https://coevo-caddie.coevo-meta-hackathon.workers.dev/practice-preview. Explore the new Practice scene, judge its saved first draft and compare the recorded revision. The scene, images and readings are real model outputs from a scripted sample; visitor choices are local, not saved or sent to a model.

Work-session replay: https://coevo-caddie.coevo-meta-hackathon.workers.dev/sample. This labeled recording shows actual Meta AI replies, the Caddie's output, five formats, podcast and short with no new model calls. "Run it live" makes fresh calls.

**9 · Use of Meta products**

- **Muse Spark 1.3** reads phone photos of any AI tool's screen into structured moments. It decides each intervention, or each silence, with deterministic guardrails. It writes one learning design per session and the five formats from it. In the Practice Range it writes a scene, checks the person's brief, and separately reads the generated draft against the scene's facts without seeing that brief.
- **SAM 3.1** can suggest the screen area from one disclosed setup photo; manual corners are available too. Screen finding has not been measured on real phone photos. It also points at a poster's price, title or product photo on a kept frame for visual coaching ("The price isn't visible."); on a real Meta AI screenshot it boxed the poster's price and title and ignored the same price in the chat.
- **Muse Voice Transcribe** turns spoken answers and practice briefs into text.
- **Muse Image** draws what a spoken or typed practice brief produces, and the background scenes of the short.
- **Meta AI** (consumer) is the demo's work tool. Its poster image generation and in-chat rule following were checked in a real account.

All model calls are server-side with Standard models, strict JSON schemas, and an application-enforced lifetime budget.

**10 · Why Meta's models matter**

Seeing the screen is what makes the Caddie work across AI tools without integrations. Muse Spark's image understanding turns a phone photo of ChatGPT, Gemini or Meta AI into the same structured moment. After a manual crop or SAM 3.1's screen suggestion, the phone crops later frames on-device. Voice Transcribe lets a busy café owner answer while working. In practice, Muse Image draws the person's brief, and Muse Spark reads what that draft actually shows: naming a price is different from the price appearing in the image. The person judges it and revises, with both drafts preserved.

**11 · Partner technology feedback**

Modal runs the open-source Kokoro-82M text-to-speech and the ffmpeg composition for the podcast and the short. Meta's API has no text-to-speech. We used explicit CPU and memory limits, one container, no warm pool, a memory snapshot and async spawn/poll from the Worker; a 61.6-second two-voice episode rendered in 58 seconds end to end. One gotcha worth documenting: `from __future__ import annotations` in the web endpoint module made FastAPI treat the injected request as a query parameter (HTTP 422) until it was removed.

**Verified results so far (never estimate; see docs/VERIFICATION.md):**
- Reading actual Meta AI screens: latest request word-set match 1.0 and tool 1.0 on screen captures. Physical phone-camera accuracy (S1) not measured: the phone is an assumed setup.
- Latency: combined read-and-decide turn, median 5.9 s at the client / 4.9 s on the server on a screen capture (3 runs); 6–9 s per turn in full sessions. Phone screen-change-to-card time (S3) not measured (assumed setup); in the browser a camera frame took about 10 s on the server.
- S5: a 61.6 s two-voice episode rendered in 58 s end to end (one bounded run); product podcasts 93–141 s; shorts 38.9–44.3 s at 1080×1920.
- S8: one full session (5 screens, a spoken answer, five formats including 3 images) cost $0.163 in Meta usage plus a $0.08 media reservation.
- The card in Meta AI: sent as the first message of a pinned chat, it made Meta AI ask for audience, product, price, mood and whether a real photo exists first; memory across new chats did not carry the rule.
- Judging and checking habits: on an actual Meta AI screen where the scripted owner rejects invented opening hours and forbids invented claims, the reading recorded the correction and the no-invention request, and both habits were stored ($0.0091).
- A server restart in the middle of reading, deciding or replying never leaves the phone stuck: the moment is marked interrupted and nothing is invented (checked with a real local process restart, test models).
- The full flow at phone size (assumed setup: controlled camera on actual Meta AI screens, synthetic voice): quiet twice → a question → the spoken answer transcribed → the ingredients step → the brief labeled with the Caddie, with SAM 3.1's price pointer → a wrap that skipped the podcast for a stated reason; $0.1465.
- Another tool: on four actual ChatGPT screens (scripted, fictional cover letter) the live Caddie read the tool and each request, stayed quiet twice, then asked one question; $0.038.
- Persona simulations: see the labeled simulation section (never real-user evidence).
- The current Practice scene (scripted, typed sample on the deployed app): first brief omitted price/photo; Muse Spark found the price missing and the audience unclear in the draft; a recorded price-fix choice preceded feedback; one coached revision showed prices and audience, while the unattached real photo remained missing by rule. These are functional results, not measured learning gains.
