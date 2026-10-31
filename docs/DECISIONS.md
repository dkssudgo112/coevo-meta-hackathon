# Design decisions

## October 30, 2026 — Fresh event implementation

Use a new repository containing event-period code. Do not import previous application code, employer material, or previous Git history. The concept predates the event; the implementation in this repository starts with a new scaffold.

## October 30, 2026 — Development foundation

Use React, TypeScript, Vite, and Cloudflare Workers. Isolate the Modal Python SDK in the project virtual environment. Connect D1/R2 and external TTS after the data flow is established. The initial UI reports readiness and does not imply that product features are implemented.

## October 30, 2026 — Models and costs

Start with `muse-spark-1.3` for text and synthesis, `muse-image-1.0` for images, and `muse-voice-transcribe-1.0` for transcription. Validate model existence, account access, region support, and inference success independently. Keep mock mode and explicit live-call opt-in as defaults. Model-list authentication does not establish promotional credit availability.

## October 30, 2026 — Preserve the complete scope

Keep all five content formats, visual and spoken practice, evidence, approved rules, and weekly synthesis. Implement one complete work journey before expanding its coverage. Do not silently delete requirements to simplify delivery.

## October 30, 2026 — Public repository and English defaults

The maintainer authorized a public GitHub repository and initial push. English is the default for README files, public documentation, product UI, accessibility labels, demo material, and generated content. Conversation can remain in the user's preferred language.

Keep private agent instructions, account records, raw application references, screenshots, and credentials outside Git. Preserve the earlier local documentation privately while publishing a portable, reviewed version. Use a GitHub noreply identity for commit metadata. A project license still requires a maintainer decision.

## October 30, 2026 — Coevo Caddie replaces the retry/idempotency plan

After a structured product interview the maintainer approved a new plan. Coevo becomes **Coevo Caddie**: a phone beside the screen that coaches how a person directs any AI tool, for workers in general (demo persona: a first-time café owner making a poster). The developer-only retry/idempotency journey is retired. The five content formats stay, each mapped to a different moment of use.

## October 30, 2026 — The earlier Coevo is a design reference

The author's earlier Coevo product is used for design rules (coach intervention, evidence labels, format roles, UX principles). All code here is newly written during the event; no earlier code, text, history or private material is copied.

## October 30, 2026 — Caddie decides, the person approves rules

The Caddie decides whether and how to intervene (watch → question → ingredients → example) and which content to make, always with a reason. Deterministic guardrails block interrupting while typing, skipping ladder steps, nagging, praise and ungrounded quotes. Only rules that change the person's AI need approval.

## October 30, 2026 — Camera first, with disclosed setup and on-device crop

The phone camera watches the monitor so any AI tool works without integration. SAM 3.1 runs only on one disclosed setup photo to find the screen; afterwards the phone crops on-device and uploads only the screen area, and only after a settled change. Fallbacks: a single photo, or Desk screen sharing.

## October 30, 2026 — Models, speech and costs

Muse Spark 1.3 (reading, decisions, learning design, content), SAM 3.1 (screen location), Muse Voice Transcribe (spoken answers), Muse Image (Practice Range, short scenes). Standard models only — never contributor variants for user data. Meta's API has no text-to-speech, so Kokoro-82M (Apache-2.0) runs on Modal for the podcast and short. Server-side caps: $0.60/day per workspace and $0.30 per sample session (raised from $0.15 after a full sample-sized run measured $0.25 with media), under a global lifetime cap (see below). The Open Weight bonus is not pursued.

## October 30, 2026 — Meta AI card fallback

In a Korean Meta AI account, image generation worked, but a "Remember that…" rule was not applied in a new chat and no Memory setting was found. Caddie cards for Meta AI are therefore sent as the first message of a dedicated chat that the user pins and keeps using for posters; in that chat Meta AI asked for audience, price, mood and a photo before generating. This is within-conversation instruction following, not persistent Memory. The Caddie verifies the effect by observing whether the AI asks first.

## October 30, 2026 — One lifetime spend authority

The maintainer approved US$3.00 in total for Meta Model API development and validation. All paid Meta calls go through the deployed Worker's single `Budget` Durable Object, which keeps a lifetime ledger with an operating ceiling of $2.50 (configuration may lower it, never raise it), never reset by day, restart, deployment, workspace or script. Each Spark attempt counts input tokens first and reserves the exact maximum; if the count fails, the call is refused. Modal media uses a separate ledger below its separately verified free balance. This is an application-enforced budget, not a provider billing cap. Local and fake-model runs cannot spend (fake runs use a separate ledger). Spike scripts call the deployed app instead of Meta directly; out-of-app runs such as a Modal probe must first reserve their allocation through an admin-only route. Ambiguous provider failures keep their reservation; only documented unbilled rejections are refunded.

## October 30, 2026 — Recorded live run as the default sample preview

A full live run of the public sample costs about $0.20 in Meta usage plus a media reservation, and the lifetime ceiling is $2.50, so only a handful of judges could run it live before the app (correctly) refuses further calls. The maintainer approved making a clearly labeled *recorded live run* the default preview: the exact output of one verified run through the deployed app — Caddie lines, the five formats, the podcast audio and the short video — replayed with no model calls. "Run it live instead" stays one click away, and the camera, photo and Desk paths are unchanged. Recorded files are published only after an exact-byte review and are listed with their hashes.

## October 30, 2026 — When a card counts as working

A Caddie card counts as *observed working* only when it was applied (not merely approved), the screen shows the same AI tool and kind of task, and the AI asked for every detail the card names. Requirements come from the card's own words with a conservative reader: negated or unrecognized wording stays unverified rather than being guessed. What the Caddie remembers across sessions is rebuilt from records that still exist, so deleting a session or turning a card off takes effect on the next model call.

## October 31, 2026 — Meta lifetime total raised to US$100

The maintainer raised the approved Meta Model API total from US$3.00 to **US$100 in total, including what was already spent** ($1.4059 at the time). It is one lifetime total for the deployment, not per run, day or workspace, and not a reason to spend more than the work needs. The same global `Budget` object, ledger, start time, reservations and once-only settlement stay in place; only the ceiling changes, and configuration may still lower it but never raise it above $100. Per-workspace ($0.60/day) and per-sample ($0.30) limits are unchanged. Modal media keeps its separate $0.90 ceiling. This entry replaces the $3.00/$2.50 figures in the October 30 entries above.

## October 31, 2026 — A scene you judge and revise

Practice became a four-stage scenario: a fictional colleague’s changed request, the person’s brief, their judgment of an AI draft before feedback, and one coached revision. The brief check and the image reading remain separate. Unknown visual details never become success; a generated image cannot stand for an unattached real photo. The first attempt and its labels remain unchanged, and the person returns to the same session. The earlier product was a design reference only; this implementation and its original scenery were made during the event.

## October 31, 2026 — A short public Practice walkthrough

The maintainer approved aligning the final video, judge experience and submission material. `/practice-preview` uses a selected, reviewed live sample with scripted input. Visitors can explore choices against the saved reading and see the recorded revision without accounts or new model calls. Their choices are not saved or credited as performance. Only whitelisted fictional content and reviewed image bytes are published, with no workspace identity or credentials. Real service onboarding remains primary; the work-session replay remains available. This finishing pass adds no model, new content format or account requirement.


## October 31, 2026 — Idle live connections must allow hibernation

A real Cloudflare Free duration-limit alert exposed that the unbounded SSE stream and its heartbeat interval kept each open workspace awake. Live updates now use the Durable Objects WebSocket Hibernation API, with a token in the first message, authenticated socket attachments and runtime auto-response heartbeats. HTTP checks, connection setup and reconnects are bounded; stopped clients cancel pending work. The legacy stream returns a terminal response without entering a Durable Object. Existing pages need one reload to use the new client; their pairing stays intact. Local tests confirm eviction with an open socket and reconnection after a real process restart. Provider quotas remain finite.

Video range responses now stream the requested bytes and cancel the remaining read, avoiding one whole-file buffer per viewer. Media-only budget errors identify audio/video rendering separately from the Meta model budget. Recorded judging paths continue to use reviewed static assets.

## October 31, 2026 — Funded Modal allowance with zero net spend

The application now supports an explicit funded opt-in to a separate $25 lifetime Modal ceiling, keeping all previous reservations and its original ledger start time. Operators must verify sufficient compute credits and a provider net spend limit of zero before enabling it. Unconfigured deployments retain the $0.90 default; larger configured values clamp to $25 and an explicit zero refuses new reservations. The Meta lifetime ceiling is unchanged. Account verification and billing evidence remain private.
