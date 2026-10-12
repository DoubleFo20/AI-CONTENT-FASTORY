# System architecture

STATUS: LOCAL_V1_RELEASE_CANDIDATE

The Owner's current app remains on the reviewed RC with original SQLite/media and
explicit Mock text; that RC has no Gemini adapter and receives no OpenAI credential.
This branch prepares Gemini and worker helpers separately. It does not activate them
in the Owner app, migrate data or deploy a cloud service.

## Local release amendment — 2026-10-10

The active release keeps React/Vite + Express/SQLite and Premium Cinematic V2. No FastAPI
rewrite or populated database migration is attempted. SQLite remains authoritative for
owner/session/project/clip/export/job records. Additive private per-project JSON sidecars
store scene production/reference settings, owner-verified Flow rates, editor/audio/image
catalogs and a Drive media index. API serializers omit filenames, tokens and private paths.

Text jobs use persisted explicit Mock/Real mode and result provenance. Startup interrupts
pending paid jobs; manual retry/cancel, deadlines, monotonic progress and fenced completion
preserve previous valid content. Only the saved idea is expanded. Variable duration is12–180s.
Flow stays an assisted primary engine; prompts carry scene/ref/character/location continuity,
TH explanations and EN generation instructions. No Flow API or automatic credit spending.

FFmpeg uses saved ordering/ratio/quality/audio/subtitle settings and is a deterministic
local worker task. Drive preparation/uploads are owner-requested, with six private categories,
durable preallocated IDs, verified MD5/SHA256/size and explicit retry. Missing local cache
can be restored only from an owned verified index entry; existing local files are not deleted
or overwritten. Drive-primary activation still requires live OAuth/round-trip verification.

Shutdown stops API admission, aborts probes/background work, tracks actual handler promises
and guards all resumed SQLite/catalog commits. Late Multer completion cleans its own file.
HTTP drain10s and handler drain5s are separate bounded phases; a noncompliant late callback
stays fenced and performs cleanup when it returns. Production Supabase RPCs have their own
deadline; no unbounded custom repository is promised a fixed total shutdown duration.

Cloud adapters/SQL are prepared and opt-in, with no hosted deployment or approved migration.
Paired worker enrollment/heartbeat/media bridge and cloud WAITING_FOR_WORKER rendering are
not implemented. The PWA persists public shell/preferences only; notebook-offline mobile
cloud operation remains blocked on hosting/database/pairing and actual end-to-end proof.
Phase2 adds pure worker presence/reconnect transitions as PREPARED code; these have no
authenticated broker, durable presence CAS, deployment or active waiting-state UI.
See [readiness matrix](release/V1_READINESS.md) and [API contract](API_CONTRACT.md).

## Engineering amendment — 2026-10-09

The Owner now requests a cloud control plane with Supabase PostgreSQL structured data,
Google Drive primary media, and a local editing worker. This supersedes the local-only
deployment target while retaining the verified Express/TypeScript stack and existing APIs.
Antigravity exclusively owns src/, public/, design references and UX/UI specifications in
its separate worktree; engineering owns backend, additive contracts, tests and core docs.

Implementation is incremental. Existing SQLite/auth/session/queue/FFmpeg remains the
working local lane; no populated schema is migrated or copied automatically. New Drive,
provider-selection and Supabase/cloud queue adapters are dependency-injected and opt-in.
Absent credentials use explicitly labelled mock AI/test repositories, never a fake connected
Drive or real cloud success. No Supabase project for this app is configured at this checkpoint.

The cloud target is an always-on same-origin Express host plus Supabase structured project/
job records and Google Drive private media. Cloud AI jobs may run while a laptop is offline;
local FFmpeg jobs must remain queued until an authorized laptop worker is online. A public
PWA shell alone cannot execute cloud work offline without that deployed control plane.
No private data or offline submissions enter the public service-worker cache.

This checkpoint prepares adapters and contracts before remote activation. PostgreSQL DDL
is reviewable SQL only, never applied to an existing project. Production cutover requires
chosen project, owner-approved schema application, verified persistence/session migration,
Drive OAuth authorization, HTTPS/origins and worker credential enrollment. Cloud deployment
and billing are external gates, not simulated acceptance.

Provider policy (Owner update 2026-10-10): Gemini is primary for text, using only
`gemini-3.5-flash-lite` for ten ideas and selected-only expansion. Requests require a
server-only key and explicit Free Tier confirmation after the Owner verifies the API
project has no paid billing. A key alone does not prove the billing tier. Quota exhaustion
stops the job without retry, paid upgrade or another provider. OpenAI is a prepared backup
and cannot be invoked until new explicit Owner approval enables its server-side gate.
Mock mode remains explicit, with saved provenance; existing Mock output is never relabelled
as live AI. Legacy auto routing is gated by OpenAI approval and is not the Gemini path.
Google Flow remains user-operated primary video generation; Meta AI supporting work is
manual/unconfigured until an official supported integration is selected. Remotion is an
optional future editing adapter; the verified FFmpeg implementation stays active.

Cloud queue: service-side owner filtering, validated project snapshots and atomic enqueue;
leases use worker identity plus an unguessable fencing token. Heartbeat/progress/completion
require the current token and unexpired lease. Expired work fails interrupted; paid jobs
are not replayed automatically. Local jobs never execute on the cloud worker. Schema/adapter
and mocked concurrency tests must precede any deployment or existing-data migration.

OAuth preparation uses exact redirect URIs, one-time owner/session-bound state, PKCE,
minimal drive.file scope, fixed Google HTTPS endpoints and encrypted server-side tokens.
No browser/response/log contains OAuth credentials or refresh tokens; invalid callbacks,
missing credentials and unconnected storage fail closed. Remote Drive writes require an
owner-authorized import/export operation, never automatic sharing or publishing.

## Local V1 architecture

```mermaid
flowchart LR
  Web[React TH/EN PWA shell] -->|same-origin cookie + CSRF| API[Express API]
  API --> DB[(SQLite)]
  API --> Files[Private local files]
  Worker[Single persistent queue worker] --> DB
  Worker -->|confirmed Free Tier text| Gemini[Gemini Flash-Lite]
  Worker -->|explicit test mode| Mock[Mock provider]
  Worker --> FFmpeg[FFprobe / FFmpeg]
  FFmpeg --> Files
  Web -->|English prompt pack| Flow[User-operated Google Flow]
  Flow -->|user imports clips| API
```

React/TypeScript/Vite provides a small SPA without a second framework/server. Express 5
provides HTTP routes and middleware. Node 24 built-in SQLite avoids a compiled/native DB
dependency and external credentials for a fresh local workspace. FFmpeg was already
installed. npm is the discovered and selected package manager. Runtime dependency versions
are pinned; the required new lockfile is tracked. Built artifacts/databases/media are ignored.

Node SQLite APIs are synchronous; V1 performs short indexed operations, and only one
worker handles external AI/media operations asynchronously. WAL and busy timeout support
multiple connections. This is a local, low-concurrency architecture; cloud/multi-tenant
deployment would require a reviewed persistence/worker migration, not an automatic switch.

## Layout and dependency boundaries

`src/`: client; `shared/`: schemas, contracts, module registry; `server/ai/`: provider;
`server/`: app/auth/store/queue/media entry points; `tests/`: isolated regression tests;
`scripts/`: dev and validation tooling; `docs/`: specifications. `storage/`: ignored runtime
DB, uploads, work/output folders. `.worktrees/`: ignored isolated writer checkouts.
Client imports public types only; it cannot import server config, filesystem or key access.
Shared contracts freeze first, backend and client implement independently against them.

## Persistence schema (Root-owned)

- users: id, unique normalized username, salted password hash, creation timestamp.
- sessions: hashed opaque token, user id, CSRF token, expires timestamp.
- projects: id, owner id, brief JSON, ideas JSON, selected idea id, package JSON,
  production status, creation/update timestamps.
- clips: id, project id, scene id, internal filename, original name, probed duration, timestamp.
- jobs: id, project id, owner id, type, status, progress, safe error code, timestamps.
- exports: id, project id, internal filename, aspect ratio, timestamp.

Prepared statements and owner filters are mandatory. Schema creation applies only to a
new local database; later migrations require Owner approval. Queue claim/status updates
are transactional. One active job per project avoids races and duplicates. Restarted
running jobs become interrupted failures; paid generation is never silently replayed.

## Configuration and deployment limits

Default host 127.0.0.1, API port 3001, Vite port 5173 with /api proxy. Production local
server serves dist/web and API on one origin. Environment config is server-only and has
validated defaults. No env file is created; the authorized environment key is reused.
OPENAI_IDEAS_MODEL defaults to gpt-6-luna; OPENAI_EXPAND_MODEL to gpt-6.1-sol with low
reasoning. Owner can configure models; failures do not silently change models or retry.
HTTPS and approved origin/cookie configuration are required before non-loopback deployment.

## Official references consulted

- [Node SQLite](https://nodejs.org/api/sqlite.html): DatabaseSync and version constraints.
- [Vite guide](https://vite.dev/guide/): Node support and React/TypeScript build workflow.
- [Express security](https://expressjs.com/en/advanced/best-practice-security/): input and cookie protection.
- [OpenAI models](https://developers.openai.com/api/docs/models): configurable text model choices.
