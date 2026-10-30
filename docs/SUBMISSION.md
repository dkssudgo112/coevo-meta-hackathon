# Submission and three-minute demo

Submit through the [event platform](https://cerebralvalley.ai/e/meta-ai-developer-hackathon). Deadline: **November 5, 2026, 11:00 KST**. The maintainer presses the final submit button; nothing has been submitted.

## Form checklist

- [ ] Team name and all approved contributors.
- [ ] Track: Indie Developer / Build for Your World.
- [ ] English project description (draft below once features are verified).
- [ ] Public GitHub repository URL, checked while signed out.
- [ ] Accessible three-minute demo video, checked while signed out.
- [ ] Which Meta models the project uses, and why they matter.
- [ ] Live product URL with the sample-session entrance and a stated budget cap.
- [ ] Optional feedback and public post URL.
- [ ] Review the usage, sharing and promotion consent language at submission time.

## Before publication

- [ ] Only event-period code and properly licensed dependencies/assets (Kokoro-82M Apache-2.0; fonts via Google Fonts OFL).
- [ ] `npm run verify` and `npm run check:release -- --staged` pass; the exact staged diff and commit metadata reviewed.
- [ ] No secrets, private notes, account screenshots, raw sessions or personal frames.
- [ ] Project license decided by the maintainer.
- [ ] README explains the earlier concept and the new implementation; demo opening says the same.
- [ ] Claims match evidence: real model output, fixture data and simulated persona tests are labeled.

## Three-minute storyboard

Composition: a real desk shot first (phone propped beside the monitor), then a split screen — PC capture on the left, phone mirror on the right. Every Caddie line on screen is live model output; the persona and screens are labeled sample data; the "next week" scene is a second recorded session and says so.

| Time | Scene | Shows |
| --- | --- | --- |
| 0:00–0:12 | Desk shot | Café owner, AI tool, phone beside the monitor. "Built during the hackathon, from my earlier Coevo concept." |
| 0:12–0:40 | Split screen | "more premium" again and again; the flow shows *Quiet — on track*; then the buzz and the NOW card: "You've asked for 'more premium' 4×. Who is this dessert for?" |
| 0:40–1:05 | Voice answer | Owner speaks, then types it in their own words; the poster changes; Desk row labeled *with the Caddie*. |
| 1:05–1:30 | Wrap | Note quoting the owner; My playbook split; Caddie card approved → Desk inbox → sent as the first message of a dedicated, pinned poster chat. |
| 1:30–1:55 | Five moments | Flashcard, podcast (two voices, pause-to-ask), short built on the owner's own screens — each with "why now". |
| 1:55–2:15 | Practice Range | Spoken brief → Muse Image → ingredient check → *on your own (practice)*. |
| 2:15–2:45 | **Climax** | A week later, in the pinned poster chat that starts with the card: "Make a poster for our new drink." The AI asks first. Phone: "Your AI asked first. I'll stay quiet." "You learned. Your AI learned. Your Caddie stepped back." |
| 2:45–2:55 | Cameo | A cover letter in another AI tool: "Smooth, but anyone could write this. What's one thing only you did?" |
| 2:55–3:00 | Close | The four Meta models and their roles; live output; one-line limitation. |

## Draft texts (finalize only with verified numbers)

**One-liner.** Coevo Caddie is a coach on the phone beside your screen: it watches how you work with any AI, steps in only when it matters, and helps both you and your AI get better.

**Description.** People stuck with an AI tool repeat vague requests — "make it more premium" — because nobody shows them what the AI is missing. Coevo Caddie turns the phone you already keep beside your monitor into a caddie. Its camera reads your screen only when it changes and sends only the screen area. Muse Spark decides whether to step in, always with a reason, and staying quiet is a decision too. When it does step in, it asks one question in your own words, and you answer out loud. Afterwards it makes only the learning that session earned: a note, a playbook, applied flashcards, a two-voice podcast you can interrupt, and a 9:16 short built on your own before/after screens. It then proposes a Caddie card for your AI. Approve it and start a pinned chat with it, and next time your AI asks the right questions first while the Caddie stays quiet. Evidence is labeled honestly: on your own, with the Caddie, AI wrote it, or not seen yet.

**Meta models and why they matter.**
- Muse Spark 1.3 reads any AI tool's screen from a phone photo, which makes every tool supported with no integration. It also makes the intervention decision with deterministic guardrails, and writes one learning design that becomes five formats.
- SAM 3.1 locates the monitor on one disclosed setup photo, so the phone can crop on-device and keep the room out of every later frame.
- Muse Voice Transcribe lets a busy owner answer by voice, and those spoken details become the brief.
- Muse Image is the Practice Range: it draws exactly what your spoken brief would produce.

**Built during the hackathon.** Everything in the repository: contracts and guardrails, Worker and Durable Objects, adapters, phone and Desk apps, media pipeline, tests. The concept continues the author's earlier Coevo work, used as a design reference only.

**Verified results (fill in):** S1 reading accuracy [ ], S3 p50 latency [ ], S5 podcast/short lengths [ ], S8 cost per session [ ], persona simulations [labeled simulated].
