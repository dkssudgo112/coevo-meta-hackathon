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
