# Backend/Core integration handoff — 2026-10-09

CORE_API_STATUS: IMPLEMENTED_FOR_LOCAL_AND_INJECTED_VERIFICATION
SUPABASE_STATUS: PREPARED_NOT_CONNECTED
DRIVE_STATUS: PREPARED_NOT_AUTHORIZED
CLOUD_DEPLOYMENT_STATUS: UNVERIFIED
LOCAL_WORKER_PAIRING_STATUS: CONTRACT_PREPARATION_ONLY

Antigravity owns src/, public/, docs/design/ and the UX/UI design documents in its separate
worktree. Root's current checkpoint changes backend/core contracts, tests and engineering
documentation. The reviewed design packet remains DESIGN_READY_FOR_CODEX; this checkpoint
does not claim that the actual UI has adopted it or passed implementation visual QA.

## Contracts ready for integration

Keep the working cookie+CSRF owner login, local projects/jobs/media and selected-story
workflow. The local API is compatible. New optional capabilities and cloud/Drive endpoints
are specified in [API_CONTRACT](API_CONTRACT.md) and
[shared/integrations.ts](../shared/integrations.ts). Do not import server adapter/worker
classes into the browser. Google Flow remains the primary user-operated video handoff;
Meta AI is an unavailable supporting capability until its separate integration is approved.

Show Drive state from the authenticated status response. `configured` means valid settings
exist; `connected` means a locally stored grant appears usable. A real controlled round trip
is required before claiming verified sync. Backup returns a private object receipt for one
existing local clip/export; it is not an indexed primary-media catalog or automatic sync.
Pending/failed UI states should follow the actual request, without inventing completed jobs.

Use the AI capability's mode/active/fallbackReason. Mock content is visibly labelled in both
languages; treat it as synthetic review content. Mode changes and credit-resolution actions
are operator-controlled; no key, price or balance is returned. Thai remains the default UI
and TH/EN requirements remain those in the approved design packet.

Cloud snapshots and CloudJob have separate types and routes. Selecting requires the last
read revision;409 CONFLICT calls for refresh/review. Active jobs freeze project changes.
Polling and failures preserve the last valid package. Cloud export is gated CLIPS_REQUIRED:
no cloud scene-media catalog or paired local editing worker is claimed. Existing local
FFmpeg rendering remains operational. Remotion is explicitly unavailable; no dependency or
rendering template was added merely to replace a working engine.

## Execution and migration plan

The target is an always-on Express control plane + Supabase PostgreSQL structured data +
private Google Drive media. Cloud ideas/expansion can then run while the laptop is offline.
A separately authenticated Local Worker will fetch verified private scene media, assemble
with FFmpeg, upload a checksum-verified private result and complete a fenced local lease.
Until that deployment/pairing exists, the loopback app and its public-shell PWA need the
laptop/API online. A cached shell is not a background cloud worker.

The code provides an opt-in Supabase snapshot/queue adapter and CloudAiWorker. Enable its
polling deliberately with ACF_CLOUD_WORKER=true only after approved schema/credential/host
verification. Auth accounts/sessions and existing local project/media records still live in
SQLite. A cloud deployment therefore needs a private persistent data volume and one API
leader until the reviewed account/session persistence migration is implemented. Do not run
two API instances against copied owner databases or treat SQLite as a shared worker fleet.

The migration must preserve owner/project IDs (Drive markers and token-vault AAD depend on
owner identity), preserve compatible scrypt hashes without exposing them, invalidate prior
sessions, stage project/media indexes and verify read-back before routing traffic. Back up
SQLite with its WAL correctly and keep recoverable local media. Do not apply schema, delete
files or switch an existing populated database without a concrete Owner-approved migration.
[SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) records this amendment before any cutover.

Local Worker enrollment is a future server-authenticated owner/worker binding, not direct
distribution of Supabase service keys or Google refresh tokens. Its future transport must
bind project/owner/target/input/revision plus an unguessable lease token, enforce heartbeat
expiry, and verify real media/checksums. The current repository's local export receipt is a
test seam; the public HTTP export gate prevents that seam from pretending to render files.
Manual recovery must consider an already-started paid request; aborting JavaScript does not
prove a provider cancelled billing. Expired jobs fail INTERRUPTED and are never auto-requeued.

## Operator gates and evidence

The actual Supabase application project and server secret are missing; the connected
AI gold-price and EV-JARVIS-DEV projects were inspected read-only and left untouched.
Google OAuth settings, encryption key and owner authorization are missing. Live OpenAI
generation with the previously authorized key remains blocked by insufficient_quota;
there were no further live AI calls in this checkpoint. No content was published.

Verification uses injected providers/gateways, isolated SQLite data and a temporary
in-memory PGlite PostgreSQL runtime under ignored .tmp. The prepared SQL was compiled and
exercised for grants/RLS, ownership/revision, unique active jobs, lease proofs, selected-only
atomic results and expiry/retained content. PGlite has one connection: real multi-host lock
contention, hosted PostgREST/advisors and an offline-laptop deployment test remain gates.
The POSIX vault permission regression is skipped on Windows; Windows ACL operation and
actual POSIX execution need their respective host verification. Final executed command
results are recorded in [PROJECT_STATUS](../PROJECT_STATUS.md).

Use [DRIVE_STORAGE](DRIVE_STORAGE.md) and [CLOUD_CONTROL_PLANE](CLOUD_CONTROL_PLANE.md) for
setup/recovery. Read and apply approved UX specifications in Antigravity's owned worktree,
then return the actual implemented UI for its VISUAL QA; synthetic reference measurements
are separate evidence. The existing origin is DoubleFo20/AI-CONTENT-FASTORY; normal main
checkpoint pushes preserve the separate design/antigravity-ui branch. Verify delivery with
origin/main and never force push.
