# Coevo contributor instructions

This is a **public GitHub repository** for the 2026 Meta Global AI Developer Hackathon. Treat every tracked file, commit message, author field, screenshot, and generated artifact as potentially public.

Read `README.md`, `docs/STATUS.md`, `docs/PRODUCT.md`, and `docs/VERIFICATION.md` before making changes. Clearly distinguish implemented behavior from plans.

The product is **Coevo Caddie**: a phone beside the screen watches how a person works with any AI tool, steps in only when it matters, and helps both the person and their AI improve. The PC side is a thin **Desk** tab.

## Language

- Default to English for README files, public documentation, UI copy, accessibility labels, errors, demo material, and generated service content.
- Follow the user's preferred language in conversation; Korean conversation does not change the English product default.

## Scope and provenance

- All code in this repository is written during the event. The author's earlier Coevo product is used as a **design reference only**: do not copy its code, text, Git history, private records, or material without redistribution rights.
- Keep all five content formats: notes, manuals, flashcards, two-person podcasts, and vertical shorts. Change implementation order without silently removing product scope.
- Preserve workspace/session/work scope, exact source references (moment and frame), speaker attribution, and the distinction between the Caddie's reading (model interpretation) and what was observed on screen.
- Distinguish independent, coached, AI-produced, and unobserved performance. Lack of evidence is not evidence of inability.
- Label provenance: `observed`, `live-model`, `user`, `rule`, `fixture`, `simulated-persona`. Never present fixture data, planned lines, or persona-simulation results as real model output or real-user evidence.
- Mark synthetic examples with `fixture=true`. Do not claim validated learning outcomes or professional certification.

## Publication and secrets

- Never commit `.dev.vars`, private environment files, `private/`, `artifacts/`, local `CLAUDE.md` notes, `.claude/`, credential stores, screenshots of accounts, or raw conversation logs. Never force-add an ignored file.
- Public configuration examples must contain placeholders or empty credential values.
- Keep API credentials on the server; never use a `VITE_` variable for a secret. Do not print keys or copy them into prompts, logs, docs, screenshots, test fixtures, or frontend bundles.
- Inspect `git diff --cached` and run `npm run check:release -- --staged` before committing. Inspect the commit and its metadata before pushing. Scanning does not replace a content and rights review.
- Use a GitHub noreply address for public commit metadata when configured. Do not replace it with a private email address.
- Check every third-party asset and dependency license. No project license has been selected yet; do not add a license without the maintainer's decision.
- Do not publish private participant links, application forms, billing details, account identifiers, or local machine paths in public documentation.

## External actions

- Start with `COEVO_ALLOW_LIVE_CALLS=false`. Check credit and billing status before intentionally enabling live model calls. Spend-alert emails are not a hard usage cap; the server enforces its own daily caps.
- Use Standard Meta models only. Never send user frames, audio, or text to `-contributor` model variants.
- Camera frames are cropped to the screen region on the device before upload. The one-time setup frame used to find the screen is disclosed to the user.
- Credential setup alone does not authorize cloud deployments, paid compute, additional subscriptions, or a final competition submission.
- Preserve other projects' browser tabs, settings, credentials, and development servers.

## Verification and handoff

- `npm run verify`: type checks, unit tests, build, Worker dry-run, and local configuration checks.
- Unit tests may use mocks; mocks never count as evidence that a real model, camera, or deployment path works.
- `npm run check:release`: public-file checks; `--staged` checks the exact index.
- Update `docs/STATUS.md` and `docs/DECISIONS.md` when implementation or decisions change.
- Follow `docs/BUILD-PLAN.md`: raise every area A–H through L1 → L2 → L3 together. Track each requirement in `docs/VERIFICATION.md` with the evidence type. A health endpoint or a configured key is not a completed product integration.
