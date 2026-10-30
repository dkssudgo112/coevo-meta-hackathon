# Coevo contributor instructions

This is a **public GitHub repository** for the 2026 Meta Global AI Developer Hackathon. Treat every tracked file, commit message, author field, screenshot, and generated artifact as potentially public.

Read `README.md`, `docs/STATUS.md`, and `docs/PRODUCT.md` before making changes. Clearly distinguish implemented behavior from plans.

## Language

- Default to English for README files, public documentation, UI copy, accessibility labels, errors, demo material, and generated service content.
- Follow the user's preferred language in conversation; Korean conversation does not change the English product default.

## Scope and provenance

- Build new event-period code in this repository. Do not import pre-existing application code, employer code or history, private work records, or material without redistribution rights.
- Keep all five content formats: notes, manuals, flashcards, two-person podcasts, and vertical shorts. Change implementation order without silently removing product scope.
- Preserve project/session/work scope, exact source references, speaker attribution, and the distinction between AI claims and observed tool results.
- Distinguish independent, coached, AI-produced, and unobserved performance. Lack of evidence is not evidence of inability.
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

- Start in mock mode with `COEVO_ALLOW_LIVE_CALLS=false`. Check credit and billing status before intentionally enabling live model calls. Spend-alert emails are not a hard usage cap.
- Credential setup alone does not authorize cloud deployments, paid compute, additional subscriptions, or a final competition submission.
- Preserve other projects' browser tabs, settings, credentials, and development servers.

## Verification and handoff

- `npm run verify`: type checks, build, Worker dry-run, and local configuration checks.
- `npm run check:release`: public-file checks; `--staged` checks the exact index.
- Update `docs/STATUS.md` and `docs/DECISIONS.md` when implementation or decisions change.
- Start with the retry/idempotency journey in `docs/BUILD-PLAN.md`. A health endpoint or a configured key is not a completed product integration.
