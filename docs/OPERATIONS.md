# Local operations and recovery

## Start and first-run setup

Install dependencies with npm, then run the discovered scripts in README.md. The API
defaults to loopback port3001, and Vite proxies /api on port5173. A production build is
served by the same Node API process. First-run owner setup is loopback only and available
only when the database has zero users; choose a password of at least12 characters.
The first account receives a12-hour cookie session and CSRF token. Logout revokes it.
Never log real password/key values or ship a seed credential.

## Runtime configuration

| Environment name | Default | Meaning |
| --- | --- | --- |
| ACF_DATA_DIR | storage under repository root | Private SQLite/media/work data |
| ACF_HOST | 127.0.0.1 | Local server bind |
| ACF_PORT | 3001 | API/built-web port |
| ACF_ALLOWED_ORIGINS | localhost/127.0.0.1 ports5173 and3001 | Origin allowlist for mutations |
| ACF_SECURE_COOKIES | false for loopback HTTP | true only when using HTTPS |
| ACF_AI_MODE | openai | openai, labelled mock, or explicit auto fallback; malformed values fail closed |
| OPENAI_API_KEY | existing authorized environment | Server-side text generation credential |
| OPENAI_IDEAS_MODEL | gpt-6-luna | Scoped ten-idea generation |
| OPENAI_EXPAND_MODEL | gpt-6.1-sol | Selected story expansion |
| SUPABASE_URL | absent | Canonical app project URL for optional cloud snapshots/queue |
| SUPABASE_SECRET_KEY | absent | Preferred server-only elevated key; never expose to clients/workers |
| SUPABASE_SERVICE_ROLE_KEY | absent | Legacy server-only fallback when secret key is absent |
| ACF_CLOUD_WORKER | false | true starts the opt-in cloud AI executor only after approved setup |

Use one API/worker process against a data directory. SQLite is local, not a shared cloud
worker fleet. No automatic migration is allowed for an existing unexpected schema.
For tests/smoke sessions use an ignored workspace-contained .tmp data directory; do not
populate the actual first-run database with a test account. Do not change pre-existing env
files or silently persist an environment key. Never expose the app beyond loopback as a
production system without the SECURITY.md deployment review.

This workspace is below XAMPP's Apache document root. The root .htaccess denies all
Apache access to the repository, including source, storage, .tmp and .worktrees; the
configured Apache AllowOverride All/authz_core support this guard. Use the Node URL on
port3001/5173. Preserve this file when working under htdocs and review the server's
override policy before moving private data to any other web-served directory.

## Production journey and error recovery

Create a brief, generate ten ideas, choose one, then expand. Inspect four bibles and
scenes; copy/download English prompts; create and review clips in your own Google Flow
account; import a clip for every scene; enqueue automatic editing; preview and export.
Google account eligibility and paid credits are the creator's responsibility, not something
this application automatically provisions. The app never simulates successful Flow output.

The existing authorized OpenAI key currently returns insufficient_quota on generation.
Model discovery succeeded but does not prove generation credits. Resolve the API project's
credits/access or explicitly choose a new secure key/project; avoid repeated retry clicks
until resolved. Codex account usage and API project quota are separate indicators.

For local synthetic work, set ACF_AI_MODE=mock in that launch's process environment.
Output explicitly says MOCK in TH/EN. Explicit auto falls back for absent configuration,
quota or access rejection and then stays on mock until restart; refusal, invalid output,
timeouts, rate limits and ambiguous network errors do not fall back. Neither mode changes
billing or replaces the approved API key. Invalid mode settings stop startup before calls.

See [Drive preparation](DRIVE_STORAGE.md) for OAuth variables and owner consent;
[Cloud Control Plane](CLOUD_CONTROL_PLANE.md) for SQL/host/worker gates. These integrations
remain opt-in and unconnected on this machine. Cloud projects are separate from local ones.
New namespace export stays CLIPS_REQUIRED until a real private media catalog/paired worker
exists. The existing local import/edit/export pipeline remains available.

The optional SQL check uses a temporary development runtime inside ignored .tmp, adding
no application dependency or lockfile change:

```powershell
npm.cmd install --prefix .tmp/cloud-sql-qa --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8
node --import tsx scripts/check-cloud-sql.mjs
```

It creates an empty in-memory PostgreSQL engine and executes only the prepared draft and
synthetic assertions. It does not connect to Supabase or migrate user data. Its single
connection cannot prove multi-host lock contention; hosted PostgreSQL/PostgREST/advisors
and actual POSIX/Windows permissions need separate deployment verification.

Worker operations persist in SQLite. Duplicate active jobs and state changes during work
are rejected. A restarted running job becomes INTERRUPTED/failed; retry manually after
reviewing its prerequisites and potential credit cost. A failed provider never replaces
valid project data. File imports reject invalid media; final export metadata appears only
when rendering succeeded. Automatic editing normalizes clip order/ratio/duration/audio,
not creative transitions or generated video. A newer clip import invalidates the latest
export so re-edit before sharing. Keep earlier imports available for recovery.

## Data and backup boundaries

storage contains private SQLite and local media. It is ignored by Git and cannot be served
as static files. Backup decisions require Owner approval and should stop the app or use a
proper SQLite backup method; never copy only the main DB while ignoring active WAL data.
No reset/delete/migration script is provided. A password reset, populated schema change,
database removal, remote connection or cloud deployment needs an explicit Owner decision.
