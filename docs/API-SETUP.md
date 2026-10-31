# APIs and local configuration

Credentials are local to each developer and are not part of this public repository. Do not paste credentials into chat, commits, screenshots, or public logs.

## Meta Model API

- Base URL: `https://api.meta.ai/v1`
- Screen reading, decisions, content: `muse-spark-1.3` (Standard; contributor variants are refused in code)
- Images: `muse-image-1.0`
- Speech-to-text: `muse-voice-transcribe-1.0`
- Screen location on the setup photo: `sam-3.1`
- Server-side credential: `MODEL_API_KEY`; live calls also require `COEVO_ALLOW_LIVE_CALLS="true"`

Verify model availability for your own account and region. A model appearing in the catalog does not prove a successful inference request. Transcription is not text-to-speech; podcasts and shorts still need a separate speech-synthesis provider.

```bash
npm run setup
npm run secrets:set -- MODEL_API_KEY
npm run doctor
npm run meta:models
```

`setup` creates `.dev.vars` from `.env.example` only when it is absent and restricts its permissions to the local owner. The secret-entry command uses hidden input. Restart `npm run dev` after changing local environment values so the Worker loads them.

`meta:models` sends a model-list request without inference. It saves a sanitized result in the ignored `private/checks/` directory.

### Intentional inference check

1. Verify credit availability, pricing, and billing for the intended account.
2. Explicitly enable `COEVO_ALLOW_LIVE_CALLS` in the local environment only when a real request is intended.
3. Run `npm run meta:smoke`. It makes one bounded request with `store:false`, a 20-second timeout, a small output limit, and no automatic retry.
4. Review the sanitized check result. Keys and raw generated text are not recorded by the check script.
5. Turn live calls off again when finished if further calls are not intended.

The current `/api/health` reports safe configuration booleans. Changing `COEVO_AI_MODE` does not implement the planned coaching features.

## Modal

Install the SDK into the project virtual environment:

```bash
uv sync
```

Authenticate with a deliberately selected profile. Creating a token grants account access; do so only when authorized for the intended workspace and duration.

```bash
uv run modal token new --profile coevo-hackathon --no-activate --expires-in 7d
uv run modal token info --profile coevo-hackathon
```

Use `--profile coevo-hackathon` explicitly. Modal stores credentials outside the repository in its local configuration file. Do not copy that file into the repository or publish token command output. Record expiry and workspace details only in local private notes.

The optional CPU check uses remote compute and must be intentional:

```bash
COEVO_ALLOW_MODAL_COMPUTE=true uv run modal run --profile coevo-hackathon --env main infra/modal/smoke.py
```

No GPU is configured in this example. Promotional credit claims, a successful token check, and actual available compute are separate states.

### Keep media within free compute

Confirm the workspace's included compute credit in Modal before raising the application allowance. In Modal's Usage & Billing page, set a **net spend limit of $0** and a **gross usage limit below the available compute credit**. These are different controls: gross usage includes credits; net spend is what would be charged after credits.

The app defaults to a separate $0.90 Modal lifetime ceiling. A funded deployment can explicitly set server-side `COEVO_MODAL_CAP_USD="25"`, which is clamped to $25 and never resets the existing ledger. Zero disables new media reservations. Raise this allowance only after verifying sufficient compute credits and saving the provider's zero net spend limit. Keep deployment-specific configuration out of public examples. Volume charges and products not covered by compute credits require a separate review before use; this media service uses CPU functions and private R2 rather than Modal Volumes or Shared Endpoints.

## Media service (Modal)

`infra/modal/media.py` runs Kokoro-82M text-to-speech (Apache-2.0) and ffmpeg on CPU. It has no warm containers. Deploy only after checking credits:

```bash
uv run modal secret create coevo-media-token COEVO_MEDIA_TOKEN=<random value> --profile coevo-hackathon
uv run modal deploy --profile coevo-hackathon --env main infra/modal/media.py
```

Then give the Worker the endpoint URL and the same token as secrets `MODAL_MEDIA_URL` and `MODAL_MEDIA_TOKEN`. `npm run test:media` checks the composition locally with a synthetic tone instead of TTS.

## Cloudflare

`wrangler.jsonc` declares the Worker `coevo-caddie`, the `Workspace` and `Budget` Durable Objects (SQLite backend), the R2 bucket `coevo-caddie-media`, and static assets from `apps/web/dist`.

```bash
npx wrangler r2 bucket create coevo-caddie-media
npx wrangler secret put MODEL_API_KEY
npx wrangler secret put COEVO_ALLOW_LIVE_CALLS      # "true" only after billing is confirmed
npx wrangler secret put MODAL_MEDIA_URL
npx wrangler secret put MODAL_MEDIA_TOKEN
npm run build && npx wrangler deploy
node scripts/integration.mjs https://<your-worker>.workers.dev
```

## Deployment and other services

The app is deployed as one Cloudflare Worker with Durable Objects (new workspaces in the US jurisdiction), private R2 and static assets; deploy with `npm run build && npm run check:dist && npx wrangler deploy`.

| Service | Purpose |
| --- | --- |
| Meta Model API | Reading, decisions, learning design, the five formats, Practice Range (live calls only through the deployed budget) |
| Modal (Kokoro TTS + ffmpeg) | Podcast and short-form speech and video (separate budget) |
| Cloudflare | Worker, Durable Objects, R2, static assets |
| GitHub | Public submission source; every commit and dependency license reviewed |

Use credentials created for this project. Do not reuse employer credentials or unrelated projects' credentials.
