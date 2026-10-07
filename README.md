# AI Content Factory

A local TH/EN short-story production workspace. V1 moves from a brief to ten ideas,
one selected story, bibles/scenes, English Google Flow prompts, imported clips and MP4.
This repository starts with a functional validation shell; approved Antigravity design
and creative acceptance of real Google Flow clips remain separate release gates.

Current checkpoint: local verification passes. Live OpenAI generation with the authorized
existing key is blocked by insufficient_quota until the Owner resolves the API project's
credits/access. This does not prevent setup, project management or local clip editing.

## Requirements

- Node.js 24.12+ (24.x) and npm 11+.
- FFmpeg and FFprobe on PATH for clip import/editing. Both already exist on this machine.
- OPENAI_API_KEY in the server process environment for live text generation.
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
ACF_SECURE_COOKIES, OPENAI_API_KEY, OPENAI_IDEAS_MODEL, OPENAI_EXPAND_MODEL.
Defaults and operation boundaries are in docs/OPERATIONS.md. No env file is required or
created. Never put keys in VITE_* variables or tracked files. Do not print the environment.

## Project documents

- [Scope and acceptance](docs/PRD.md)
- [Architecture](docs/SYSTEM_ARCHITECTURE.md) and [API contract](docs/API_CONTRACT.md)
- [Task dependencies](TASKS.md) and [current status](PROJECT_STATUS.md)
- [Antigravity handoff](ANTIGRAVITY_HANDOFF.md)
- [Security](docs/SECURITY.md), [i18n](docs/I18N.md) and [AI pipeline](docs/AI_PIPELINE.md)

Secondary factories are registry boundaries only. No cloud deployment, investment advice,
external publishing or remote repository was created at this checkpoint.
