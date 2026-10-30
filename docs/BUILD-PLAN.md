# Build plan

Plan date: October 30, 2026. Deadline: **November 5, 2026, 11:00 KST**. Dates are targets, not completion claims. Progress and evidence live in [VERIFICATION.md](VERIFICATION.md).

## Method: every area at the same depth

Areas: **A** observation · **B** Caddie · **C** connection · **D** evidence · **E** AI growth · **F** five formats · **G** Practice Range · **H** deployment and judging.

- **L1 through:** the real path runs end to end with minimum behavior.
- **L2 real use:** waiting, empty, failure, partial-success and recovery states; correct labels.
- **L3 finished:** copy, visuals, performance at demo quality.

All areas reach each level together. Every evening the full demo runs end to end; whatever breaks is the next morning's first task.

## Schedule (KST)

| Date | Target |
| --- | --- |
| Oct 30 | Contracts, core rules, Worker + Durable Objects, Meta and media adapters, phone/Desk/sample UI, local integration checks. Credit checks (external). |
| Oct 31 | All areas L1 with live calls once credits are confirmed: camera → card → voice → card approval → five formats → Practice Range. Deploy to Cloudflare (live calls off until approved). |
| Nov 1 | Toward L2: states, labels, misreads, partial success, real podcast and short lengths. |
| Nov 2 | All areas L2. Calm Caddie polish. Deployed build with caps. Simulated persona tests (labeled). |
| Nov 3 | All areas L3: copy, latency (p50 ≤ 6 s), sample session, recorded demo sessions. |
| Nov 4 | Demo video edit (desk shot → split screen, English captions), docs, release checks, submission form review. |
| Nov 5 | Submit before 11:00 KST (by the maintainer) and verify receipt. |

## Gates that need external access

| Gate | Needed for |
| --- | --- |
| Meta Model API credit/billing confirmed | Every live reading, decision and content item; S1–S3, S6–S8 |
| Modal credit for the media service | Podcast audio and short video (S5) |
| Cloudflare R2 enabled | Evidence frames and media storage in the deployed app |
| A real phone and monitor | Camera legibility (S1, S2), haptics, real latency |
| The maintainer's Meta AI account | S4: image generation (passed) and the card's effect in a dedicated pinned chat (passed; cross-chat Memory failed) |

## Rule

Do not delete agreed scope to save time. If a dependency fails, apply the approved fallback (photo or screen share instead of camera; card as the first message of a dedicated pinned chat instead of Meta AI Memory) and record the evidence and the limit.
