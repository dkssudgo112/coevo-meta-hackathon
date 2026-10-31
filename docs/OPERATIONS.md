# Operating the judging deployment

The public app runs on Cloudflare Workers, SQLite-backed Durable Objects and private R2. Audio and short-video rendering runs in the deployed Modal app. The maintainer's Mac, local development servers, film editor and terminal do not need to stay open.

## Paths for reviewers

| Path | What it needs |
| --- | --- |
| `/demo` | Published video and English captions; no login, model call or media-rendering job |
| `/practice-preview` | Reviewed static scene and two images; choices stay in the page |
| `/sample` | Recorded live work session, podcast and short; no model call by default |
| `/desk` and `/caddie` | Workspace storage and pairing; live work also needs Meta access |
| Live sample, podcast and short generation | Meta access and the separate Modal rendering allowance |

Recorded outputs stay labeled as recorded. They remain useful when a provider is unavailable; they are not substituted for a failed live call.

## Capacity and recovery

- Live updates use hibernatable WebSockets. Authentication is the first socket message, never a URL parameter; runtime heartbeats leave an idle workspace asleep. Old pages using the retired `/events` stream must reload once, with their pairing kept.
- Cloudflare Free has daily account-wide request, duration and storage-operation limits. Exceeding a limit can stop live workspace operations until the reset at 00:00 UTC (09:00 KST). A paid plan changes the allowances and billing; no app change automatically upgrades an account.
- Meta and Modal have separate, persistent reservation ledgers. A Meta credit balance does not increase the Modal allowance. Check both before inviting reviewers. Unknown provider outcomes keep their reservations; do not erase the ledger to regain headroom.
- The live demo's Modal allowance is limited. Reaching it stops new audio/video renders, while the Caddie, text formats and published recordings remain available subject to their own limits. Provider credit shown in a dashboard and the app's reserved amount are different measures.
- Modal scales to zero when idle. Its first render may queue or start a container; tracked rendering jobs are polled from durable alarms. Jobs that exceed the timeout show a failure and a retry, rather than remaining pending indefinitely.
- Workspace data and media do not depend on a browser tab staying open. A deployment can interrupt in-flight model work: the app retains completed evidence and reports interrupted steps honestly. Complete checks before judging and avoid nonessential deployments during review.
- The local Modal CLI token and Wrangler login are management credentials. Their expiry affects diagnosis or redeployment, not the already deployed runtime. Refresh management access before its expiry if support during judging is needed.
- Pairing codes expire. Show a new code from the Desk if the phone has not paired in time. This does not expire an already paired device.

## Before and during review

1. Check `/api/health`, then exercise one real workspace operation. Health reports configuration and the Meta ledger; it does not itself call Meta or Modal.
2. Open `/demo`, `/practice-preview` and `/sample` without a login. Confirm video seek, captions, images and the complete walkthrough.
3. Check current provider quotas, credit validity, deployed app status and the private reservation ledger. Keep account identifiers and billing screenshots out of the repository.
4. If a live step fails, preserve its error and identify which service failed. Do not retry a charged or ambiguous operation repeatedly, reset budgets, or present the recorded path as a fresh run.

This is an operational checklist, not an uptime guarantee or an installed monitoring service.

References: [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [Modal deployed apps](https://modal.com/docs/guide/apps).
