# Product

Coevo Caddie coaches **how a person directs their AI tool**, not the AI's output. It lives on a phone propped beside the monitor, sees the screen through the camera, and steps in only when it matters. The person learns to give their AI better material; their AI learns, through an approved Caddie card, to ask for it; and the Caddie steps back.

## User and moment

- **Who:** anyone who works with AI tools — not only developers. Demo persona (fixture): a first-time café owner making a promotional poster for a new menu item.
- **When:** while working at the PC with the phone beside it, the same habit people already have. Not a separate study app.
- **Problem:** when results disappoint, people repeat vague requests ("more premium"). The missing piece is the person's own material — who it's for, price, a concrete feeling, a real photo. General AI tools fix the output inside one chat; the habit stays, and the AI starts from zero next time.

## What the Caddie decides, what the person decides

| The Caddie decides | The person decides |
| --- | --- |
| Whether to speak now, or stay quiet, always with a reason | Their answers and their own brief |
| The ladder step: watch → question → ingredients → example | Approve, edit, reject or turn off a Caddie card |
| Which content formats are worth making, and when | Later, deleting frames, pausing, correcting a misread |
| When to suggest the Practice Range | |

Rules that change the person's AI always need the person's approval.

## Journey

1. **Pair (no setup questions):** open `/desk` on the PC, open `/caddie` on the phone, point it at the QR. Aim: drag a box over the screen, or let SAM 3.1 find it from one disclosed setup photo. From then on only the boxed screen area is sent.
2. **Watch:** on-device change detection sends a frame when the screen changed and settled. Muse Spark reads it (tool, latest request verbatim, vague words, ingredients present, whether the AI asked first). The first reading produces a short model-written acknowledgement.
3. **Step in:** after repeated vague requests the phone buzzes. The NOW card quotes the person's words and asks one question. They answer by voice; the Caddie replies without writing the brief for them. "Show me an example" is available only after the ingredients step and anything copied from it is labeled *AI wrote it*.
4. **Observe the change:** the next frame shows new ingredients → labeled *with the Caddie* (or *on your own* if no intervention happened).
5. **Wrap:** the session ends by button or after 10 idle minutes. One shared learning design decides each format, with a reason.
6. **AI grows:** the playbook's rule becomes a proposed Caddie card. Approved cards go to the Desk inbox with tool-specific instructions (Meta AI: send as the first message of a chat; Memory did not persist in our check).
7. **Value check:** in a later session, if the AI asks the clarifying questions first, the card becomes *seen working* and the Caddie stays quiet.

## Five formats, five moments

| Format | Role | Arrives |
| --- | --- | --- |
| Note | What changed the result, quoting the person's words; decided vs AI-produced; open conditions | Right after the session |
| Manual (My playbook) | Next-time steps, each with what it checks; pitfalls; "for your AI" vs "you decide"; the card rule | Right after the session |
| Flashcards | Apply the rule to a changed situation; never pure recall; reviews at 10 min, 1, 3, 7, 14 days | Idle moments on the phone |
| Two-voice podcast | Caddie and a skeptical guest argue the trade-off; ≥ 60 s; pause to ask, resume at the same line | Prep or commute time |
| 9:16 short | One mechanism in 4–6 scenes (hook → own before/after evidence → cause diagram → rule → question), 30–45 s | Reviewing or sharing |

The Caddie makes a format only when the session earned it; a skipped format shows why and can still be requested. A failed format never blocks the others.

## Practice Range

A one-sentence request with a changed condition (new item, season or audience). The person briefs the AI out loud; Muse Image draws what those words produce; the brief is checked for ingredients. Viewing the hint, or an exercise opened by the Caddie, makes the attempt *with the Caddie*.

## Evidence rules

- Labels: `independent` (on your own), `coached` (with the Caddie), `ai-produced` (AI wrote it), `unobserved` (not seen yet). Strength: transfer to later real work > practice > in-task.
- The Caddie's reading is an interpretation; the frame is the observation. Misreads can be corrected and are removed from evidence.
- Quotes must appear in the source (normalized for quotes and markdown); ungrounded quotes are dropped.
- No levels or scores. 4D observations: description, delegation, discernment, diligence.
- Fixture data and simulated persona tests are always labeled and never presented as real users.

## Privacy and cost

- Only the device-cropped screen area is uploaded; the setup photo for SAM is disclosed and never stored. Raw frames are discarded after reading unless they are evidence for a moment; kept frames can be deleted.
- Standard Meta models only; contributor variants are never used for user data.
- One spend authority: the deployed Worker's Budget object keeps a **lifetime** ledger for every paid call (Meta and Modal), capped at $3.00 and never reset by day, deployment or workspace. Also $0.60/day per workspace and $0.15 per sample session. Paid calls are enabled only on the deployment; local and test runs cannot spend.
