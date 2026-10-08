# AI Content Factory

A TH/EN short-story production workspace with a working local lane and prepared cloud adapters. V1 moves from a brief to ten ideas,
one selected story, bibles/scenes, English Google Flow prompts, imported clips and MP4.
The running application is a functional validation shell. The reviewed studio design packet
is now DESIGN_READY_FOR_CODEX; implementation visual QA and real Flow creative acceptance
remain separate release gates.

Current backend checkpoint adds labelled Mock AI, private Drive/OAuth preparation and an
opt-in Supabase cloud project/queue API. Antigravity owns UX/UI in a separate worktree.
See [core integration handoff](docs/CORE_INTEGRATION_HANDOFF.md). Live OpenAI generation with the authorized
existing key is blocked by insufficient_quota until the Owner resolves the API project's
credits/access. This does not prevent setup, project management or local clip editing.

The [design packet](ANTIGRAVITY_HANDOFF.md) includes an interactive synthetic reference.
Run `node scripts/preview-design.mjs` and open http://127.0.0.1:3003 to inspect its15 screens.
See [reference screenshots and measured QA](docs/design/README.md). The real application
on port3001 retains its Phase1 visual shell until Antigravity's implementation is safely integrated.

## Requirements

- Node.js 24.12+ (24.x) and npm 11+.
- FFmpeg and FFprobe on PATH for clip import/editing. Both already exist on this machine.
- OPENAI_API_KEY in the server process environment for live text generation.
- Set ACF_AI_MODE=mock for labelled synthetic generation without API credits.
- The creator's own Google Flow access for video generation. No Flow API/account automation.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173. The API listens on 127.0.0.1:3001. Choose your username and
password on first launch; there are no default credentials. Setup signs you in immediately.
Runtime files live in ignored storage/. Keep the server bound to loopback for this checkpoint.
The XAMPP directory is only the workspace location; Apache/PHP does not run the Node app.
The root .htaccess blocks Apache access to source and private runtime files under htdocs.

For a built local application:

```powershell
npm.cmd run build
npm.cmd start
```

Open http://127.0.0.1:3001. PWA registration is production-only. The public shell is available
offline after a first visit; login, private projects, AI, uploads and exports require connection.

## Verify

```powershell
npm.cmd run validate:docs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run validate:pwa
npm.cmd run validate:secrets
```

Automated tests inject AI responses and do not use live credits. Runtime/media test data
is isolated under .tmp/. See PROJECT_STATUS.md for commands actually executed, results,
live smoke checks and remaining limits; a command shown here is not proof it has passed.

## Configuration

Server-only environment: ACF_DATA_DIR, ACF_HOST, ACF_PORT, ACF_ALLOWED_ORIGINS,
ACF_SECURE_COOKIES, ACF_AI_MODE, OPENAI_API_KEY, OPENAI_IDEAS_MODEL, OPENAI_EXPAND_MODEL.
Defaults and operation boundaries are in docs/OPERATIONS.md. No env file is required or
created. Never put keys in VITE_* variables or tracked files. Do not print the environment.
Optional Drive/Supabase settings and verification gates are documented in
[Drive storage](docs/DRIVE_STORAGE.md) and [Cloud Control Plane](docs/CLOUD_CONTROL_PLANE.md).
Credentials alone do not establish deployment: laptop-offline cloud execution remains
unverified until an approved always-on host, database and worker pairing are tested.

## Project documents

- [Scope and acceptance](docs/PRD.md)
- [Architecture](docs/SYSTEM_ARCHITECTURE.md) and [API contract](docs/API_CONTRACT.md)
- [Task dependencies](TASKS.md) and [current status](PROJECT_STATUS.md)
- [Antigravity handoff](ANTIGRAVITY_HANDOFF.md)
- [Security](docs/SECURITY.md), [i18n](docs/I18N.md) and [AI pipeline](docs/AI_PIPELINE.md)

Secondary factories are registry boundaries only. No cloud deployment, investment advice,
external publishing or remote repository was created at this checkpoint.
