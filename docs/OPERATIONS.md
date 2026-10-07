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
| OPENAI_API_KEY | existing authorized environment | Server-side text generation credential |
| OPENAI_IDEAS_MODEL | gpt-6-luna | Scoped ten-idea generation |
| OPENAI_EXPAND_MODEL | gpt-6.1-sol | Selected story expansion |

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
