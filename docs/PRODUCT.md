# Product scope

This document preserves the full intended scope. It is an implementation plan, not a list of completed features.

## User and problem

The first user is a developer who works with coding agents every day. Completing an artifact and being able to explain, verify, or adapt the underlying decision are different outcomes. Coevo connects coaching, learning, and evidence within the same work context, with a clear route back to the task being read.

## One complete journey

1. Import a real, permissioned or synthetic coding session about retries.
2. Identify evidence of duplicate processing when an external operation succeeds but its response is lost.
3. Let the user choose an idempotency or deduplication approach, revise the implementation, and verify it. Separate an AI completion claim from an observed tool result.
4. Build all five content formats from one shared learning design for that decision.
5. Present a changed situation for a first attempt, keeping independent answers separate from assisted answers.
6. Apply a user-approved, scoped rule to later work and inspect the actual difference.
7. Return to the original task.

## Feature groups to preserve

| Group | Included scope |
| --- | --- |
| Work and review | Requests, code changes, tool results, user decisions, revisions, and verification |
| Coaching | Interventions grounded in observable failure, correction, or changed conditions, including reasons not to intervene |
| Content | **Notes, manuals, flashcards, two-person podcasts, and 9:16 vertical shorts** |
| Visual and spoken practice | Visual scenes, spoken explanations, meeting or role rehearsal; bounded inputs for the first demo |
| Evidence ledger | First attempts, assistance level, source references, rubric versions, transfer, and retention observations |
| Human and agent improvement | Approved rules, explicit application scope, later application, and replay checks |
| Weekly synthesis | Evidence-linked patterns, automation opportunities, and learning recommendations |

## Planned model responsibilities

- **Muse Spark:** work coaching and structured shared learning design.
- **Muse Image:** visual scenes. Render factual text, numbers, and state diagrams in application code.
- **Muse Voice Transcribe:** speech-to-text. It does not replace text-to-speech for podcasts; a separate TTS provider is needed.
- **Cross-session synthesis:** start with the configured Spark model. Evaluate Wonder only if available to the deployment account; retain synthesis when substituting an available Meta model.
- **Modal:** Meta open-model inference and bounded code checks in Sandboxes. Validate GPU access and billing separately.
- **Muse Code:** a session-event input adapter. Verify the actual hooks, execution, and export interfaces. Begin with a JSONL fixture import to stabilize the contract.

## Evidence boundaries

- Validating an exact source anchor and validating its interpretation are separate checks.
- Preserve `projectId/sessionId/workId` across input, generation, playback, persistence, replay, and recovery.
- Never conflate `independent`, `coached`, `ai-produced`, and `unobserved`.
- Do not score an unobserved action as a failure or lack of understanding.
- Deterministic scoring can make a calculation reproducible; it does not validate a professional certification.
- Clearly label synthetic demo data. Do not present it as real user performance or measured long-term learning impact.
- English is the default service language. Additional language support must not silently change this default.
