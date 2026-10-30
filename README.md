# Coevo

**Turn AI-assisted development work into better decisions and evidence of what you can do yourself.**

Coevo is being built for the 2026 Meta Global AI Developer Hackathon, in the Indie Developer / Build for Your World track. It connects a real development task to coaching, learning content, practice, and scoped improvements that can be applied to later work.

> **Status: workspace bootstrap.** The repository currently contains a React/TypeScript starting screen, a local Workers health endpoint, shared contracts, and development tooling. Coaching, content generation, practice, and the evidence ledger are planned, not implemented.

This is a fresh implementation created during the event. The product concept predates the event; no pre-existing application code, employer code, private work records, or previous repository history is included.

## The first complete journey

1. Import a development session about retries.
2. Find evidence that an operation may succeed even when its response is lost, creating a duplicate-processing risk.
3. Choose an idempotency design, revise the implementation, and verify the result.
4. Turn the same decision into **notes, manuals, flashcards, two-person podcasts, and vertical shorts**.
5. Practice a changed scenario, distinguishing independent work from coached or AI-produced answers.
6. Approve a rule for a specific scope, evaluate its use in later work, and return to the original task.

Visual and spoken practice, an evidence ledger, approved rules, and weekly synthesis remain part of the full product scope. See [Product scope](docs/PRODUCT.md).

## Run locally

Requirements: Node.js 22.12+ and npm. Python 3.12+ with [uv](https://docs.astral.sh/uv/) is needed for the optional Modal tooling.

```bash
git clone https://github.com/dkssudgo112/coevo-meta-hackathon.git
cd coevo-meta-hackathon
npm ci
npm run setup
npm run dev
```

- Web: http://127.0.0.1:5178
- Health endpoint: http://127.0.0.1:8788/api/health
- Stop both servers with Ctrl+C.
- The starting screen works without API credentials. Mock mode is the default, and live calls are disabled.
- Public documentation, interface text, accessibility labels, and default generated content use **English**.

Optional Modal tooling:

```bash
uv sync
```

Configure your own credentials using [API setup](docs/API-SETUP.md). Credentials are not included in this repository.

## Check the project

```bash
npm run verify             # Type checks, production build, Worker dry-run, local checks
npm run check:release      # Inspect publishable working-tree files
npm run check:release -- --staged  # Inspect the exact Git index before a commit
npm run meta:models        # Optional: authenticate and list models, without inference
```

Live inference and remote compute require a separate, deliberate opt-in after checking billing. A successful model-list request does not establish that inference or promotional credits are available.

## Structure

| Path | Purpose |
| --- | --- |
| `apps/web` | React + TypeScript + Vite bootstrap UI |
| `apps/api` | Cloudflare Workers health endpoint |
| `packages/contracts` | Work scope, evidence, and assistance types |
| `infra/modal` | Opt-in CPU connection check |
| `docs` | Product, development, event, and submission documentation |
| `scripts` | Local setup, credential entry, and validation |
| `.env.example` | Public configuration template with no credentials |

Local secrets, agent notes, private references, screenshots, dependency folders, and build output are excluded from Git. A local pre-commit hook runs the exact-index check in this checkout. After cloning, enable it with `git config core.hooksPath .githooks`. Review the exact staged diff before every publication; a scanner does not establish ownership or guarantee that all sensitive information has been found.

## Documentation

- [Current implementation status](docs/STATUS.md)
- [Hackathon requirements and schedule](docs/HACKATHON.md)
- [Full product scope](docs/PRODUCT.md)
- [API and local configuration](docs/API-SETUP.md)
- [Build plan](docs/BUILD-PLAN.md)
- [Submission checklist and three-minute demo](docs/SUBMISSION.md)
- [Design decisions](docs/DECISIONS.md)
- [Public references](docs/SOURCES.md)

Submission deadline recorded from the participant guide: **November 4, 2026, 21:00 EST / November 5, 2026, 11:00 KST**. Check the official guide for changes.

No cloud deployment or final hackathon submission has been completed. A project license has not yet been selected; public visibility alone does not grant an open-source license.
