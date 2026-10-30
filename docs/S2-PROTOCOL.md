# S2 — monitor detection on real phone photos (test protocol)

S2 checks one thing: on photos taken by a real phone propped beside a real monitor, does SAM 3.1 find the screen? The approved plan's bar: at least 18 of 20 photos correct, within 2 seconds. The plan does not say whether "2 seconds" means each photo or a median, so this protocol reports every photo's time (with p50, p90 and max) and passes only if every photo is within 2 seconds.

This is **not** the S1/S3 benchmark. S1/S3 keep 20 *device-cropped* frames to score reading and latency. S2 needs 20 *whole camera views*, because finding the screen is what the crop is for. It is also not the normal setup: in normal use, "Find my screen for me" sends one disclosed photo and keeps nothing. That stays as it is; this test is a separate, explicit run.

## Before taking photos (consent and scope)

- The person whose desk is photographed agrees to the test and knows what happens to the photos: they are taken with the phone's own camera, moved to the tester's computer, sent one by one through the deployed Coevo app to Meta's SAM 3.1 (a Standard model, under the app's budget), and deleted after scoring (see below).
- No people in the frame. No personal papers, notifications, names or account details on the screen or desk. The monitor shows a test AI chat (for example the scripted café poster chat).
- Meta's free-credit terms may let Meta use content sent while credits are in use. Treat every photo as shareable test material.

## Taking the 20 photos

One phone, propped as in real use (50–70 cm from the monitor), the phone's normal camera app, rear camera. Each photo is a separate shot of a different condition. Never burst shots, never the same photo twice, never screenshots or fixtures. A spread such as:

| # | Distance | Angle | Light | Screen |
| --- | --- | --- | --- | --- |
| 1–4 | 50 / 60 / 70 / 60 cm | straight | room light on | light mode |
| 5–8 | 60 cm | 15° left, 15° right, from slightly below, phone tilted | room light on | light mode |
| 9–12 | 60 cm | straight, 15° left | lamp off / daylight only | light and dark mode |
| 13–16 | 50–70 cm | mixed | glare on the screen, busy desk behind | dark mode |
| 17–20 | as in daily use | landscape and portrait phone | evening light | a chat with a poster image |

Note the conditions for each photo in the prep page (the "Conditions" field).

## Ground truth, before any model sees the photos

Open `scripts/s2/prepare.html` in a desktop browser (it works offline and sends nothing). Load the 20 photos. For each, drag a box around the **lit display area** (not the bezel, stand or room). The page:

- redraws each photo upright, at most 1280 px wide, without photo metadata (the size the app sends);
- refuses exact duplicates and flags near-duplicates (remove or replace them);
- exports `s2-prepared.json` only when there are 20 distinct photos, each with a box.

Keep that file private (for example `private/spikes/s2/`). The boxes are drawn by a person before the run, so the score does not depend on the model's own answer.

## Run and score

This route calls SAM directly; it does not depend on Muse Spark or its token counting. The first photo also shows whether SAM's live output is read correctly; a failure there is kept and reported as it is, not retried around.

```bash
node scripts/spike.mjs https://coevo-caddie.coevo-meta-hackathon.workers.dev s2 private/spikes/s2/s2-prepared.json
```

- 20 SAM calls through the deployment's lifetime budget (about $0.05 at $0.0025 per image).
- A photo is **correct** when the suggested box covers at least 95% of the person's screen box and is no more than 1.5× its area (the whole screen is kept, little of the room). IoU is reported too.
- Time: SAM time as measured by the server for each photo (p50, p90 and max reported; pass only if every photo is within 2 s), plus the round trip from the tester's computer. The phone's own network time is not part of this measure.
- The script writes scores and timings only (no images, no generated text) to `private/checks/`.

## Deletion

After the result is saved: delete the 20 originals from the phone (and its recently-deleted album) and from the computer, and delete `s2-prepared.json`. The app's `/calibrate` route keeps nothing. Keep only the score file.

## What the result does and does not show

It shows SAM's screen finding on these 20 real conditions, on one phone and one monitor. It does not show reading accuracy (S1), phone latency to a card (S3), or other phones and monitors.
