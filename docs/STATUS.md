# Current status

Updated: October 30, 2026 (late night, KST, second update). For per-requirement evidence see [VERIFICATION.md](VERIFICATION.md).

## Deployed with real model calls

https://coevo-caddie.coevo-meta-hackathon.workers.dev — Cloudflare Worker, Durable Objects, private R2 and static assets; Kokoro speech and video composition on Modal. Real Meta model calls are on behind an **application-enforced budget**: the maintainer approved US$3.00 in total for Meta Model API development and validation; the deployment's Budget object stops at a $2.50 lifetime ceiling (never reset), reserves the exact maximum before every call from counted input tokens, keeps reservations for ambiguous outcomes and settles each durable ticket once. Media rendering has its own, separate ceiling.

## Verified with real models (scripted, fictional café scenario)

These runs use screenshots of **actual Meta AI replies** to a scripted café-owner scenario and a synthetic voice for spoken answers. They prove the real path works; they are not real-user or learning evidence.

- **Reading real screens.** Muse Spark read actual Meta AI screens correctly (latest request word-set match 1.0, tool 1.0). Reading and deciding in one combined call cut the median from 11.5 s to 5.9 s (3 runs on one screen capture, not phone photos).
- **A full session through the deployed app.** Five Meta AI screens → quiet notes for the first two → an intervention at the question step that quoted the person ("You keep saying "more premium" — what one mood should it give, calm minimal or dark luxury?") → a spoken answer transcribed by Voice Transcribe → the Caddie's reply → the specific brief labeled **with the Caddie** (coached). The wrap made all five formats: note, My playbook, flashcards, a 93 s two-voice podcast and a 38.9 s 1080×1920 short. Cost of that session: Meta $0.163, plus a $0.08 media reservation.
- **The card in the real AI, end to end.** The app-generated card "Before you make a poster, ask me who it is for, what it is, the price, one feeling, and whether a real photo exists." was sent as the first message of a dedicated, pinned Meta AI chat. Asked for a new drink poster, Meta AI asked those five questions first. The Caddie read that screen (Meta AI asked for all five details the card names), stayed quiet with "AI asked first as card says", and marked the card *observed working*. This proves a rule scoped to one pinned chat, not Meta AI memory across chats (that did not carry over in our check). A card only counts as working when it was applied, the tool and task match, and the AI asked for every detail it names.
- **Practice Range.** A spoken brief was transcribed (word-set similarity 0.86 to the script, synthetic voice), rendered by Muse Image as a 2:3 portrait, and checked for ingredients.
- **Speech and video.** Kokoro-82M (Apache-2.0) two-voice audio was judged distinguishable and listenable by the maintainer (a listening judgment, not a professional audio review). A 61.6 s two-voice benchmark rendered in 58 s end to end; a 76.8 s podcast took 75–77 s, and the 93 s podcast from the full session spent 41 s in speech synthesis. Shorts land in 30–45 s with captions, the person's own before screen and a diagram.
- **Phone pairing.** A real phone paired with the Desk by scanning its QR code.
- **The public sample.** A full live run of /sample produced all five formats ($0.2034 Meta usage plus a $0.08 media reservation). A labeled *recorded live run* of it is now the default preview, replayed with no model calls so judges never exhaust the shared budget; its JSON, podcast and short were published at exactly the reviewed bytes, with reviewer notes for one invented poster detail, and the live sample stays one click away.

## Fixed after live runs

Live runs and reviews found problems that mocks had not: a lost media job when two renders overlapped, a coached change mislabeled as independent, a voice-answer rejection caused by multi-word keyword hints, a podcast script cut off by the output limit, work lost when the server restarted, UTC clock times in generated text, a card written in the wrong voice, a short title running off the frame, deletion races, answers from a deleted session reaching later prompts, a player crash when content arrived while it was open, a rule parser that read "do not ask" backwards, a microphone left on when a recording was cancelled before permission arrived, a skipped ladder step relabelled instead of refused, and a new question replacing an answer the person was still recording or typing. Each fix has a regression test; the local fake-model journey passes 64/64 (test mode only). A real local process restart (fake models) recovered interrupted content and practice items with a retry; moments interrupted mid-reading are now closed honestly too ("The Caddie restarted and missed this look.").

## Built, checked only with fake models so far

These run in the test build in a browser, with a scripted fake model and recorded vibration and speech calls. They are not yet checked with real models or on a phone.

- **Visual coaching with SAM 3.1.** When the person's request names a price, a real photo or the product and a poster is on screen, SAM 3.1 points at that part on the kept frame. If the reading says it is missing, the whole poster is boxed with "The price isn't visible."
- **Caddie voice through earphones.** Off by default. The person turns it on and confirms "My earphones are in"; new questions are then read by a voice that runs on the phone itself (never an online voice). It turns itself off when the audio devices change. Vibration can be turned off in the menu.
- **Unreadable screens and lost connections.** An unreadable camera frame is retried quietly; after three in a row the phone asks to tilt it or take one photo. A model or network failure shows "Caddie paused — connection." without an empty card.
- **Judging and checking habits.** Besides describing and delegating, the habits list can now record judging the AI's output (the person tells the AI to fix a wrong or invented detail) and checking (the person tells the AI not to invent details), only from what the request explicitly says. This one has also run live once: an actual Meta AI screen where the scripted owner rejects the invented opening hours was read correctly and both habits were recorded.

## Known issues

- **Provider token-count outages.** Several times on October 30 (once for 15+ minutes), Meta's `input_tokens` endpoint answered 404 `model_not_found` for Muse Spark 1.3 while the model list still showed it. The app counts tokens before every call and refuses when it cannot (no spend, a visible "could not verify what this call would cost" note); it now retries this case briefly. The recorded sample is unaffected because it makes no model calls.

## Not yet verified

- **Real phone camera:** the 20-frame benchmark (reading accuracy on camera frames, latency, SAM screen detection), haptics, and the camera-off indicator on pause.
- **A real human voice** (only synthetic speech so far).
- **SAM 3.1 pointing on posters with the real model**, and the earphone voice on a phone.
- The three-minute demo video, simulated persona tests (to be labeled as simulations), and the submission texts.

## Publication

Public repository: https://github.com/dkssudgo112/coevo-meta-hackathon. No competition submission has been made. Account records, coordination notes and private checks stay in ignored local files. Published screenshots are listed with their exact SHA-256 in `scripts/reviewed-assets.json`.
