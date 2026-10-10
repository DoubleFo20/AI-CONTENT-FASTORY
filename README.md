# AI Content Factory

Release Candidate: [Draft PR#2](https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/2) รอ Antigravity visual QA และ final integration review; main ยังไม่ merge.

A TH/EN short-story production workspace with a working local lane and prepared cloud adapters. V1 moves from a brief to ten ideas,
one selected story, bibles/scenes, English Google Flow prompts, imported clips and MP4.
The release candidate retains Premium Cinematic V2 and connects the studio UI to the
existing APIs. Antigravity visual QA of this combined application and real Flow creative
acceptance remain separate release gates.

Current release adds labelled/persisted Mock AI, safe job recovery, production/editor settings,
private audio/images and Drive project-media index with verified uploads/cache restore.
The Supabase cloud project/queue API is opt-in and prepared; hosting/pairing are unverified.
See [core integration handoff](docs/CORE_INTEGRATION_HANDOFF.md). Live OpenAI generation with the authorized
existing key is blocked by insufficient_quota until the Owner resolves the API project's
credits/access. This does not prevent setup, project management or local clip editing.

The [readiness matrix](docs/release/V1_READINESS.md) separates verified local behavior from
Mock-only content and live integration gates. The [design packet](ANTIGRAVITY_HANDOFF.md)
and [reference](docs/design/README.md) are visual references; they do not replace testing
the actual integrated release.

## Requirements

- Node.js 24.12+ (24.x) and npm 11+.
- FFmpeg and FFprobe on PATH for clip import/editing. Both already exist on this machine.
- OPENAI_API_KEY in the server process environment for live text generation.
- Set ACF_AI_MODE=mock for labelled synthetic generation without API credits.
- The creator's own Google Flow access for video generation. No Flow API/account automation.

## Run locally

Existing Owner on this machine: use [the original-data launch guide](docs/release/LOCAL_OWNER_RUN.md)
for candidate port3006. Default storage in a new worktree is not the existing Owner database.

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
Tests run with one file at a time to keep FFmpeg/FFprobe fixtures within their deadlines
on this shared Windows host. No runtime dependency or lockfile change is required.

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
