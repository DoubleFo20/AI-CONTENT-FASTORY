# API contract — frozen Phase 1 boundary

All endpoints are same-origin under /api; success is JSON unless stated; errors are
`{error:{code:string}}`. Protected mutations require `X-CSRF-Token` from AuthState.
Shared source: shared/contracts.ts. Timestamps are ISO UTC. IDs are UUID strings.

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
AiProvider is defined in server/ai/types.ts. Tests inject it; startup passes createOpenAiProvider().
Store/worker additional public seams are documented by Core for QA; no test is permitted
to call live AI. Core implements HTTP, persistence and FFmpeg; Root implements server/ai/.
Client wraps fetch with credentials and CSRF, derives schemas/types from shared/ and maps
safe errors to localized messages. No API base key/client credential variables.
