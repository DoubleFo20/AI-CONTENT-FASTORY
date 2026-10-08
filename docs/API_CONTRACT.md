# API contract — compatible local API and opt-in core integrations

All endpoints are same-origin under /api; success is JSON unless stated; errors are
`{error:{code:string}}`. Protected mutations require `X-CSRF-Token` from AuthState.
Shared source: shared/contracts.ts. Timestamps are ISO UTC. User/project/job/media IDs
are UUID strings; idea/character/location/scene IDs are unique bounded package-local codes.

| Method/path | Input | Output |
| --- | --- | --- |
| GET /health | — | {ok:true,aiConfigured:boolean} (no secrets) |
| GET /auth/status | cookie | AuthState {user,csrfToken,setupRequired} |
| POST /auth/setup | {username,password} | AuthState + session cookie + CSRF token, first owner only/loopback |
| POST /auth/login | {username,password} | AuthState + session cookie |
| POST /auth/logout | CSRF | {ok:true} + cleared cookie |
| GET /dashboard | session | Dashboard |
| GET /projects | session | {projects:ProjectSummary[]} |
| POST /projects | ProjectInput | {project:Project} |
| GET /projects/:id | session | {project:Project} |
| POST /projects/:id/ideas | CSRF | 202 {job:Job}; no active job/selection |
| POST /projects/:id/select | {ideaId} | {project:Project}; exactly one existing idea |
| POST /projects/:id/expand | CSRF | 202 {job:Job}; stored selection required |
| GET /projects/:id/prompt-pack | session | downloadable JSON project+bibles+scenes |
| POST /projects/:id/clips | multipart fields clip,sceneId | 201 {clip:Clip} |
| POST /projects/:id/export | CSRF | 202 {job:Job}; all scenes have clips |
| GET /jobs | session | {jobs:Job[]} |
| POST /jobs/:id/retry | CSRF | 202 {job:Job}; failed job + still-valid prerequisites |
| GET /clips/:id/file | session | authenticated media stream (Range allowed) |
| GET /exports/:id/file | session | authenticated MP4 stream/download |

Successful setup signs the new owner in immediately with the same cookie flags and
12-hour session lifetime as login. AuthState returns that owner and session CSRF token;
the client proceeds directly to dashboard. No separate login is needed after setup.

Production stage: draft → ideas_ready → selected → expanded → clips_ready → exported.
Queued/running operation is tracked separately from last valid stage. Failures do not
overwrite valid content. Selecting a different story after expansion is a conflict.
An active-operation uniqueness rule prevents duplicate clicks and concurrent state changes.
Export metadata is returned in Project.export, otherwise null; latest current clip per scene
is returned among Project.clips. Queue polling does not trigger generation.

## Implementation seams

Core exports createApplication(options) → {app,store,worker,close}. Options includes dataDir,
provider: AiProvider, optional allowedOrigins:string[], secureCookies:boolean and startWorker:boolean.
AiProvider is defined in server/ai/types.ts. Tests inject it; startup uses createConfiguredAiProvider().
Store/worker additional public seams are documented by Core for QA; no test is permitted
to call live AI. Core implements HTTP, persistence and FFmpeg; Root implements server/ai/.
Client wraps fetch with credentials and CSRF, derives schemas/types from shared/ and maps
safe errors to localized messages. No API base key/client credential variables.

## Backend additions — 2026-10-09

The preceding local endpoints and shared/contracts.ts remain compatible. New types are in
[shared/integrations.ts](../shared/integrations.ts). Integration routes are registered in
[server/integrations.ts](../server/integrations.ts). All require the existing owner session;
mutations require allowed Origin and CSRF. The OAuth callback is the sole exception to
cookie authentication: its one-time state binds an original, still-live owner session.
No access/refresh token, server key, local path or lease proof is returned to frontend clients.

| Method/path | Input | Output/behavior |
| --- | --- | --- |
| GET /integrations/capabilities | session | {capabilities:RuntimeCapabilities}; factual modes/configuration, no live-service/deployment claim |
| GET /integrations/drive/status | session | {storage:DriveStatus}; local grant metadata, no network health claim |
| POST /integrations/drive/authorize | empty object or empty body | {authorizationUrl}; owner explicitly opens Google's consent flow |
| GET /integrations/drive/callback | state + code or error | validates original session before/after exchange; 303 to / on success |
| POST /integrations/drive/backups | {kind:clips or exports,mediaId:UUID} | 201 {file:{id,name,mimeType,size,createdTime?}}; one owned private local item |
| GET /integrations/drive/files/:id | session, managed Drive file ID | no-store attachment; matching app owner marker, private My Drive only, <=128MiB |
| GET /cloud/projects | session | {projects:CloudProjectSnapshot[]}; newest100, owner-filtered |
| POST /cloud/projects | ProjectInput | 201 {project:CloudProjectSnapshot}; server-derived owner, revision1 |
| GET /cloud/projects/:id | session | {project:CloudProjectSnapshot}; foreign/missing ID is404 |
| POST /cloud/projects/:id/select | {ideaId,revision} | {project}; revision CAS, exactly one persisted idea, no expanded/active project changes |
| POST /cloud/projects/:id/ideas | empty object or empty body | 202 {job:CloudJob}; cloud executor target |
| POST /cloud/projects/:id/expand | empty object or empty body | 202 {job:CloudJob}; persisted selection only |
| GET /cloud/projects/:id/jobs | session | {jobs:CloudJob[]}; owner/project-filtered, <=1000 |
| POST /cloud/projects/:id/jobs/:jobId/retry | empty object or empty body | 202 new job; failed-only, current prerequisites, deliberate retry |
| POST /cloud/projects/:id/export | empty object or empty body | 409 CLIPS_REQUIRED until private cloud media catalog and paired local worker exist |

Cloud projects are a separate opt-in namespace. No SQLite project is silently migrated or
mirrored. Missing Supabase/Drive configuration yields safe409 CONFLICT for dependent actions;
the capabilities/status endpoints expose the unavailable state. Cloud export retry has the
same CLIPS_REQUIRED gate. Existing local imports/FFmpeg export continue through /projects.
CloudRunner and CloudRepository are trusted server-only interfaces; no worker credential or
service-role key is exposed through these routes.

Drive operations map closed internal errors onto the existing TH/EN error catalog:
configuration/reauthorization/access → CONFLICT; invalid OAuth state/input → INVALID_INPUT;
missing file → NOT_FOUND; throttling → RATE_LIMITED; deadline → INTERRUPTED; oversize →
FILE_TOO_LARGE; other upstream/vault errors → INTERNAL_ERROR. Raw provider bodies are discarded.
Per-owner transfers are exclusive in this process; separate sequential requests can create
separate backups. There is no background sync, remote publish/share/delete or automatic replay.

ACF_AI_MODE is openai by default, mock for visibly labelled synthetic output, or explicit auto
for missing-configuration/quota/access fallback. Refusal, invalid output, rate-limit, timeout
and ambiguous network failures do not fall back or retry. Auto remains mock after a safe
fallback for the process lifetime. /health.aiConfigured retains its legacy key-presence meaning;
it does not prove credits or live generation. Use authenticated capabilities for provider mode.

Frontend integration and deployment prerequisites are in
[CORE_INTEGRATION_HANDOFF](CORE_INTEGRATION_HANDOFF.md),
[Drive operating guide](DRIVE_STORAGE.md) and [cloud architecture](CLOUD_CONTROL_PLANE.md).
