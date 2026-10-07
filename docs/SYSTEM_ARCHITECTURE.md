# System architecture

STATUS: STABLE_FOR_PHASE_0A

## Local V1 architecture

```mermaid
flowchart LR
  Web[React TH/EN PWA shell] -->|same-origin cookie + CSRF| API[Express API]
  API --> DB[(SQLite)]
  API --> Files[Private local files]
  Worker[Single persistent queue worker] --> DB
  Worker -->|structured text| OpenAI[OpenAI Responses API]
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
