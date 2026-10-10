# Cloud control-plane foundation — opt-in and not deployed

STATUS: REVIEW_ONLY_CLOUD_FOUNDATION

Phase2 readiness audit2026-10-10: no approved active app-specific Supabase/host selected; no deployment/schema applied. Runtime provider switching is fail-closed with AI_MODE_LOCKED whenever this repository is configured, pending a frozen provider per durable job. The current claim(workerId,target) belongs to a trusted server executor and must not become a public paired-worker endpoint; owner-scoped atomic claim and scoped credentials are prerequisites. Worker presence/reconnect/WAITING_FOR_WORKER protocol and disconnected-device acceptance gates are in [Phase2 operations](PHASE2_OPERATIONS.md).

This adds a Supabase repository seam and a bounded leased worker without replacing the
working SQLite database, cookie authentication, local queue or local files. No database,
project, credentials, cloud host or migration was created/configured by this work. The
connected Supabase projects are not this application. A laptop going offline does **not**
mean this foundation will keep executing: that requires a separately approved, deployed,
verified always-on host, its provider credentials, monitoring and recovery policy.

## Owned implementation and contracts

- [Worker presence](../server/cloud/presence.ts) and [contract](../shared/worker.ts) are
  PREPARED pure transitions: authenticated-broker principal prerequisite, server-issued
  connection epoch, monotonic heartbeat sequence, server timestamps, revocation and
  90-second TTL. A first accepted heartbeat is required before eligibility. Derived
  WAITING_FOR_WORKER applies only to queued local exports without an eligible same-owner
  worker. Running/cloud/terminal jobs stay unchanged; presence never renews a job lease
  or replays generation. Ten injected tests passed, including repository lease expiry.
  There is no broker/enrollment/route, durable atomic presence CAS or active waiting UI.
- [Supabase adapter](../server/cloud/supabase.ts): `SupabaseCloudRepository` implements
  the frozen `CloudRepository` in [integrations](../shared/integrations.ts). Injectable
  fetch is the test seam; no SDK/dependency is added.
- [In-memory repository](../server/cloud/memory.ts): deterministic clock injection,
  atomic in-process operations, defensive clones, and the same job/lease prerequisites.
  It is a test implementation, not durable storage or a production cloud fallback.
- [Runner](../server/cloud/runner.ts): `CloudRunner({repository, workerId, target?,
  execute, maxRunMs?, heartbeatMs?})`. `runNext()` coalesces concurrent calls,
  `drain(maxJobs=10)` is capped at 100, and `stop()` interrupts outstanding execution.
  It does not start a deployment or an automatic paid retry loop.
- [SQL draft](sql/supabase-core.sql): review-only, intentionally not a migration filename.
  Root compiled and exercised it only in an empty in-memory PGlite PostgreSQL engine.
  It has not been applied to Supabase, an existing database or a deployed service.
- [Tests](../tests/cloud.test.ts): injected gateways/providers and in-memory state only.
  No live Supabase/OpenAI/Flow call is made by these tests.

Factory: `createSupabaseRepository({url?, secretKey?, serviceRoleKey?, fetchImpl?,
timeoutMs?})` returns `null` if URL/key is missing. Complete but invalid configuration
fails closed with a safe `AppError`. Root owns environment loading and API wiring.
Use `SUPABASE_SECRET_KEY` as the preferred server secret, falling back to legacy
`SUPABASE_SERVICE_ROLE_KEY` only when the new secret is absent. The factory takes
`secretKey` preferentially. Never expose either through the browser or a public env prefix.
`sb_secret_*` sends the key through `apikey` only. A legacy JWT must declare
`role: service_role` and sends `apikey` plus `Authorization: Bearer`; the gateway is
responsible for authenticating the signature. Publishable/anon keys are rejected.

The URL is restricted to a canonical `https://<20-character-project-ref>.supabase.co`
origin without a custom port, userinfo, path, query or fragment. Fetch refuses redirects
and checks the returned URL/redirect flag. Requests are bounded at 10 seconds by default
(configurable up to 60 seconds); streamed response bodies, including errors, are limited
to 8 MiB and cancelled on timeout/oversize. No retries occur. Only an exact closed catalog
of SQL error messages becomes a safe application code; arbitrary gateway/network bodies,
credentials and tracing details are discarded.

## Operations, state and fencing

`projects(owner)` returns at most the newest 100 snapshots. `project(owner,id)` uses
explicit owner/id REST filters. Lists/mutations use fixed RPC paths and the
`factory_cloud` profile. Job lists return at most 1,000 oldest-first records and recheck
the owner/project of every response. Snapshot lists recheck every owner. The body size
bound may reject an unusually large full-snapshot list; pagination/summary contracts
are a later integration concern, rather than silently returning unvalidated partial data.

New projects start at revision 1. An update requires exactly `current + 1`; an identical
same-revision snapshot is an idempotent no-op. Active jobs prohibit changes. Existing
valid ideas cannot be erased/replaced, and an expanded package, selected idea and its
brief cannot be changed. Ownership is immutable. Root's separate authenticated cloud
routes may create/read/select these projects; they must derive the owner from the cookie
session, enforce CSRF on mutations and require the caller's explicit selection revision.
There is no automatic SQLite migration, mirror or two-database transaction.

Enqueue freezes the project revision and operation input. `ideas`/`expand` target cloud;
`export` targets local. Ideas are allowed only on an unselected project without existing
ideas/package. Expansion requires the exact persisted selected idea and brief. Export
requires the ordered package scene IDs and ratio. One partial unique index permits only
one queued/running job per project, across both targets.

Claim uses `FOR UPDATE SKIP LOCKED`, a worker identity and a fresh random UUID fencing
token. SQL leases last 30 seconds; runner heartbeat defaults to 5 seconds and is capped
at 10 seconds. Heartbeats extend the stored expiry and keep progress monotonic, below
100 until completion. Completion, failure and heartbeat require the stored operation,
input, owner/project, worker, token, unexpired lease and unchanged project revision.
Stale/wrong/expired leases cannot alter content. Lease expiry produces `INTERRUPTED`,
not a new queued job. Expiry is observed by job listing, claims and mutation RPCs; a
verified deployed host/sweeper is required for ongoing unattended observation.

Completion validates results and atomically applies content plus the job transition.
The runner's executor may return ideas as `Idea[10]` or `{ideas: Idea[10]}`; these are
normalized to `{ideas}`. Exactly ten unique IDs are required. Expansion returns a
`StoryPackage`, validated for IDs/references, ordered scenes and total duration. Only
the frozen selected story is passed to the executor. Failures preserve prior valid
content and revisions. A deliberate new enqueue after failure is the recovery seam;
there is no implicit paid replay.

The local export result is a foundation-only `{exportId: UUID}` receipt stored on the
job. It is **not** a media access grant, proof that a file exists, Google Drive sync or
automatic local/cloud pairing. A future authenticated local worker must verify actual
private media ownership, file existence and checksum before issuing that receipt and
serving an export. Cloud project snapshots do not expose local paths or export files.
No live export worker pairing is implemented here.

The runner races execution/completion against a hard deadline and stop/lease-loss signal.
Executors must honor `AbortSignal` to stop transport/processing promptly. JavaScript
cannot forcibly cancel an arbitrary injected promise that ignores the signal; a late
result is discarded. If failure reporting cannot reach the gateway, stored lease expiry
is the safe recovery path. Repository errors during claim surface to the caller; a host
must supervise them without automatically replaying paid provider calls.

## SQL access and deployment gates

The Phase2 audit leaves three gates before activation: atomic owner-filtered claims
behind hashed/scoped/revocable worker credentials; actual media receipt verification
and receipt lookup on reconnect; durable provider/model/provenance frozen per AI job
across restart. Current service claim is a trusted executor seam, exportId is only a
foundation receipt and process-local mode locking does not prove cross-restart routing.
These are preparation gaps, not deployed capabilities. No schema was changed/applied.

The draft creates only the custom `factory_cloud` schema. Tables enable and force RLS,
and no policies/grants permit `public`, `anon` or `authenticated` access. All RPC/helper
functions are `SECURITY INVOKER`, use `search_path = pg_catalog`, qualify private tables
and revoke default/public execute. Trusted `service_role` receives schema usage,
SELECT/INSERT/UPDATE on these two tables and EXECUTE on this schema's RPC/helpers only.
It receives no DELETE/DDL or unrelated-schema grants. Helper EXECUTE is necessary
because invoker RPCs call them. There is no `SECURITY DEFINER` privilege escalation.

Service access bypasses RLS, so server-side owner checks and RPC predicates are required.
The service key is a privileged trust boundary; direct access with that key must not be
offered to clients/workers without a reviewed server envelope. A future stronger design
may use separately scoped worker credentials and authenticated pairing, but this draft
does not invent those credentials or weaken current owner authentication.

Before deployment, obtain authorization for the intended app Supabase project, review
this SQL independently, exercise it on an isolated approved PostgreSQL instance with
concurrency/privilege tests, run Supabase advisors, then authorize a migration and custom
Data API exposure. Provision server-only secrets through the approved deployment system,
wire owner-authenticated APIs, deploy/supervise the cloud host and verify execution after
the laptop disconnects. Local media pairing and any existing populated schema change
need separate approval. Until then, report cloud deployment as unverified.

## Verification and documentation evidence

Executed against injected/in-memory adapters: `node --import tsx --test tests/cloud.test.ts`
passed 14/14; `tsc --noEmit -p tsconfig.server.json`, `tsc --noEmit -p tsconfig.tests.json`
and scoped ESLint passed. Root's optional `node --import tsx scripts/check-cloud-sql.mjs`
passed6 groups on the final SQL: DDL; schema/table/function grants and actual denied client
roles; owner/CAS; active uniqueness/target/token fencing; selected-only atomic results;
lease expiry/retained content. PGlite has one connection. True multi-host contention,
hosted PostgreSQL/PostgREST/advisors and deployment remain unverified.

The Supabase changelog was fetched on 2026-10-09. Its PostgreSQL 15.19/17.11 breaking
change was reviewed; this draft uses none of the affected legacy ciphers, ltree,
btree_gist float indexes or custom operators. References consulted through official docs:
[changelog](https://supabase.com/changelog.md),
[PostgreSQL update](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes),
[custom schema API profiles](https://supabase.com/docs/guides/api/using-custom-schemas),
[API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api),
[database functions](https://supabase.com/docs/guides/database/functions),
[API keys](https://supabase.com/docs/guides/getting-started/api-keys), and
[PostgreSQL locking clauses](https://www.postgresql.org/docs/current/sql-select.html).
