# APIs and local configuration

Credentials are local to each developer and are not part of this public repository. Do not paste credentials into chat, commits, screenshots, or public logs.

## Meta Model API

- Base URL: `https://api.meta.ai/v1`
- Text and synthesis: `muse-spark-1.3`
- Images: `muse-image-1.0`
- Speech-to-text: `muse-voice-transcribe-1.0`
- Server-side credential: `MODEL_API_KEY`

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

## Muse Code

Follow the [official quickstart](https://dev.meta.ai/docs/quickstart) and [authentication guide](https://dev.meta.ai/docs/muse-code/auth). The project launcher expects the standard installation at `~/.local/bin/muse`.

```bash
npm run muse -- --version
npm run muse -- --help
# Only start a live session after checking credits and billing:
COEVO_ALLOW_LIVE_CALLS=true npm run muse
```

The launcher maps `.dev.vars`'s `MODEL_API_KEY` to `META_API_KEY` only in the Muse child process. It does not put the key into command arguments or global shell configuration. Live sessions are disabled by default.

A Muse Code subscription is not a prerequisite for using this repository. Validate actual session, hook, and export formats before implementing the input adapter. Authentication alone is not proof of successful inference.

## Deployment and other services

Workers currently runs locally. `wrangler deploy --dry-run` builds without deploying. A deployable service still needs a deliberate account setup, persistence design, access controls, and reviewed public artifacts.

| Service | Purpose | Next integration step |
| --- | --- | --- |
| Meta Model API | Coaching, content, and synthesis | Bounded real-model checks and feature implementation |
| Modal | Open models and code checks | Validate required endpoints or sandboxes and costs |
| Muse Code | Session-event input | Implement and test the adapter |
| TTS | Podcast and short-form speech | Select a provider and verify usage rights |
| Cloudflare | Shared deployment and storage | Configure persistence and deploy intentionally |
| GitHub | Public submission source | Review every commit and dependency license |

Use credentials created for this project. Do not reuse employer credentials or unrelated projects' credentials.
