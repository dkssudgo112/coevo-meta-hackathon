# Current status

Updated: October 31, 2026 (KST). For per-requirement evidence see [VERIFICATION.md](VERIFICATION.md).

## Deployed with real model calls

https://coevo-caddie.coevo-meta-hackathon.workers.dev — Cloudflare Worker, Durable Objects, private R2 and static assets; Kokoro speech and video composition on Modal. Real Meta model calls are on behind an **application-enforced budget**: the deployment's Budget object stops at a US$100 lifetime total for Meta usage, including earlier spend (never reset), reserves the exact maximum before every call from counted input tokens, keeps reservations for ambiguous outcomes and settles each durable ticket once. Media rendering has its own, separate ceiling.

## Verified with real models (scripted, fictional café scenario)

These runs use screenshots of **actual Meta AI replies** to a scripted café-owner scenario and a synthetic voice for spoken answers. They prove the real path works; they are not real-user or learning evidence.

- **Reading real screens.** Muse Spark read actual Meta AI screens correctly (latest request word-set match 1.0, tool 1.0). Reading and deciding in one combined call cut the median from 11.5 s to 5.9 s (3 runs on one screen capture, not phone photos).
- **A full session through the deployed app.** Five Meta AI screens → quiet notes for the first two → an intervention at the question step that quoted the person ("You keep saying "more premium" — what one mood should it give, calm minimal or dark luxury?") → a spoken answer transcribed by Voice Transcribe → the Caddie's reply → the specific brief labeled **with the Caddie** (coached). The wrap made all five formats: note, My playbook, flashcards, a 93 s two-voice podcast and a 38.9 s 1080×1920 short. Cost of that session: Meta $0.163, plus a $0.08 media reservation.
- **The card in the real AI, end to end.** The app-generated card "Before you make a poster, ask me who it is for, what it is, the price, one feeling, and whether a real photo exists." was sent as the first message of a dedicated, pinned Meta AI chat. Asked for a new drink poster, Meta AI asked those five questions first. The Caddie read that screen (Meta AI asked for all five details the card names), stayed quiet with "AI asked first as card says", and marked the card *observed working*. This proves a rule scoped to one pinned chat, not Meta AI memory across chats (that did not carry over in our check). A card only counts as working when it was applied, the tool and task match, and the AI asked for every detail it names.
- **Practice Range.** A spoken brief was transcribed (word-set similarity 0.86 to the script, synthetic voice), rendered by Muse Image as a 2:3 portrait, and checked for ingredients.
- **Practice scenes (Oct 31).** On the deployed app, in a sample session with typed, scripted input: Muse Spark wrote a scene (a co-owner, three lines, five notes with consequences); Muse Image drew the first brief's draft; Muse Spark's reading of it found the price missing and could not tell who it was for; the scripted call ("one detail needs fixing: the price") was stored before feedback; the one revision's draft showed the price and the audience in that reading, and the real photo stayed with the person by rule. Every attempt and note was stored as sample input with live-model output. 8 Meta calls, $0.0675.
- **Speech and video.** Kokoro-82M (Apache-2.0) two-voice audio was judged distinguishable and listenable by the maintainer (a listening judgment, not a professional audio review). A 61.6 s two-voice benchmark rendered in 58 s end to end; a 76.8 s podcast took 75–77 s, and the 93 s podcast from the full session spent 41 s in speech synthesis. Shorts land in 30–45 s with captions, the person's own before screen and a diagram.
- **Phone pairing.** A real phone paired with the Desk by scanning its QR code.
- **The full flow on the phone screen (assumed setup).** The deployed phone screen at phone size, with a controlled camera showing actual Meta AI replies and a synthetic voice, went quiet twice with reasons, asked "What exactly is your new dessert — flavor and what makes it special?", turned the spoken answer into the ingredients step ("Tell AI your price, your real matcha photo, and who it's for."), labeled the specific brief *with the Caddie* with SAM 3.1's price pointer, and at the end made a note, playbook, flashcards and a short while skipping the podcast with a reason ($0.1465). The new card stayed proposed.
- **The public sample.** A full live run of /sample produced all five formats ($0.2034 Meta usage plus a $0.08 media reservation). A labeled *recorded live run* of it is now the default preview, replayed with no model calls so judges never exhaust the shared budget; its JSON, podcast and short were published at exactly the reviewed bytes, with reviewer notes for one invented poster detail, and the live sample stays one click away.

## Fixed after live runs

Live runs and reviews found problems that mocks had not: a lost media job when two renders overlapped, a coached change mislabeled as independent, a voice-answer rejection caused by multi-word keyword hints, a podcast script cut off by the output limit, work lost when the server restarted, UTC clock times in generated text, a card written in the wrong voice, a short title running off the frame, deletion races, answers from a deleted session reaching later prompts, a player crash when content arrived while it was open, a rule parser that read "do not ask" backwards, a microphone left on when a recording was cancelled before permission arrived, a skipped ladder step relabelled instead of refused, and a new question replacing an answer the person was still recording or typing. Each fix has a regression test; the expanded local fake-model journey passed 87/87, including the scene-practice checks (test mode only). A real local process restart (fake models) recovered interrupted content and practice items with a retry; moments interrupted while being read, decided or answered are now closed honestly too ("The Caddie restarted and missed this look."), checked with a real local process restart including data left by the older build.

## Checks with limited live evidence

These were checked in the test build in a browser, with scripted fake models and recorded vibration and speech calls. Individual live checks are identified below; physical phone behavior remains unmeasured.

- **Visual coaching with SAM 3.1 — now also checked live once.** When the person's request names a price, a real photo or the product and a poster is on screen, SAM 3.1 points at that part on the kept frame; if the reading says it is missing, the poster is boxed with "The price isn't visible." On an actual Meta AI screenshot SAM boxed the poster's price (IoU 0.92 with a reviewer's region) and title, and ignored the same price in the chat. SAM does not recognise "poster" itself, so the poster outline is Muse Spark's estimate, and the caption says so.
- **Caddie voice through earphones.** Off by default. The person turns it on and confirms "My earphones are in"; new questions are then read by a voice that runs on the phone itself (never an online voice). It turns itself off when the audio devices change. Vibration can be turned off in the menu.
- **The camera stops when a session ends.** Ending a session (by button or after 10 idle minutes) stops the camera itself, as a pause does; nothing is sent until the person taps "Start watching again". Checked in the test build with a controlled camera input: after End the camera tracks are stopped and no frame is sent when the screen changes; the button starts a new session and the camera again; pause and resume are unchanged.
- **Unreadable screens and lost connections.** An unreadable camera frame is retried quietly; after three in a row the phone asks to tilt it or take one photo. A model or network failure shows "Caddie paused — connection." without an empty card.
- **Judging and checking habits.** Besides describing and delegating, the habits list can now record judging the AI's output (the person tells the AI to fix a wrong or invented detail) and checking (the person tells the AI not to invent details), only from what the request explicitly says. This one has also run live once: an actual Meta AI screen where the scripted owner rejects the invented opening hours was read correctly and both habits were recorded.

## Resolved deployment issues

- **Workspaces placed in Hong Kong could not reach Meta's API (found and fixed Oct 31).** What looked like intermittent provider outages was where each workspace's server object was created. Meta calls are made from that object, which stays where it was first created; objects placed in Hong Kong got 404 `model_not_found` for every model, while the same calls from the US or the maintainer's computer worked (a free diagnostic probe showed both in the same minute). New workspaces are now created in Cloudflare's US jurisdiction, which fixes where they run. An older workspace that finds itself in a restricted region copies its data and token hashes to a new US workspace, and the paired phone and Desk switch to it on their next request with no re-pairing. After the copy is verified, the old object retains only its routing record. The recorded sample is unaffected.

- **Idle connections exhausted the Cloudflare Free duration allowance (Oct 31).** Open SSE streams and their heartbeat timer kept workspace objects awake. Live updates now use hibernatable WebSockets with authenticated attachments and runtime heartbeats. Local tests observed the object leave memory while the socket stayed connected; production authentication, pairing, push updates, heartbeat and reconnect were checked after deployment. Existing pages from before this change need one reload; their pairing is kept. The account still has finite provider quotas. Static video ranges are streamed, using build metadata when the asset binding omits the file length; concurrent range checks and anonymous playback passed.

## Verified in the assumed setup (browser, controlled camera)

The deployed phone screen at phone size, with a controlled camera (a canvas showing a monitor with screenshots of actual Meta AI replies), started the camera, cropped on the device, sent each screen change once and got live readings from Muse Spark. This run found and fixed two camera-path bugs: the camera never started if the Live screen first showed "Connecting…", and the change threshold (3.5%) missed real chat updates, which measured only 1.6–6.9% at the detector's resolution (now 1.5%).

## Known limitation: prices said in Korean won

Voice Transcribe heard "six thousand won" as "6,001" and "five thousand won" as "5001" in scripted synthetic-voice briefs ("won" taken as "one"); the rest of each brief was transcribed well (58 of 61 words). The Practice Range shows the transcript before the check, and a brief can be typed instead.

## Assumed setup, not measured (accepted by the maintainer on Oct 31)

The maintainer decided that, as in the earlier Coevo project, the phone is assumed to stand beside the monitor: the flow is checked in a phone-sized browser with controlled camera and microphone input and screenshots of actual AI replies, not on a physical phone. These physical characteristics are therefore **not measured**, and are not claimed:

- Reading accuracy and latency on real phone-camera frames (S1, S3) and SAM screen finding on real phone photos (S2; the protocol is ready).
- Haptics, the camera-in-use indicator on pause, and a real human voice (speech so far is synthetic).

## First use (Oct 31)

The landing page now starts the real service: *Start on this computer* opens the Desk, then four short steps (scan the code with the phone, aim at the screen, tap Start watching, keep working in the usual AI tool), with a labeled setup illustration. The Desk shows the same steps with the current one marked and a *phone connected* state; the phone's setup screens say which step they are. The demo and the recorded session stay available as secondary ways to look first. The README leads with the product and real screens of this flow.

## Public walkthrough (Oct 31)

`/practice-preview` is the secondary, no-phone entrance to the latest Practice scene. Visitors inspect the saved first draft, explore three judgments against Muse Spark's recorded reading, and compare the recorded revision. The fictional scene and two original image outputs were reviewed before publication; account and workspace fields were excluded. Choices remain only in page memory and never become performance evidence. Local browser checks covered all three branches, restart and 320/390/1280px layouts; 57 observed requests were GETs and none reached the app API. The existing `/sample` work-session replay and real Desk/phone onboarding remain available. The deployed walkthrough, its images and the landing/sample entry links were also checked.

## Demo film (Oct 31)

/demo now plays a 2:52 film made with video-shotcraft and Remotion from real captures of the deployed app, with English captions. It follows one live run (scripted café owner, actual Meta AI replies, assumed phone setup with a controlled camera and a synthetic voice whose audio is not played), then an earlier recorded run's podcast and short, a separate Practice live sample showing the person’s judgment and before/after revision, and a separate pinned-chat check with a card approved in an earlier run; a tag on each scene names its run. The closing scene states that the app was newly implemented during this hackathon, based on the earlier Coevo concept. The published bytes are listed in `scripts/reviewed-assets.json`; public MP4/VTT hashes, Range 206, browser playback/seek and visible captions were checked after deployment.

## Still to do

- Confirm sufficient shared Modal rendering allowance for additional live reviewers. It is separate from Meta credits; reaching it stops new audio/video renders, not the already published recordings. See [Operations](OPERATIONS.md).
- The final submission is the maintainer's.

## Publication

Public repository: https://github.com/dkssudgo112/coevo-meta-hackathon. No competition submission has been made. Account records, coordination notes and private checks stay in ignored local files. Published screenshots are listed with their exact SHA-256 in `scripts/reviewed-assets.json`.
