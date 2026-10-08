# Handoff

STATUS: CORE_CHECKPOINT_COMPLETE_EXTERNAL_GATES
ANTIGRAVITY_STATUS: DESIGN_READY_FOR_CODEX
Updated: 2026-10-09 (Asia/Bangkok)
Current phase: Phase 2 core integrations; Antigravity implementation visual QA pending.

Stable decisions and Owner authorization are in MASTER_CONTEXT.md and AGENTS.md.
ANTIGRAVITY_HANDOFF.md contains the reviewed UX/UI design packet and Codex implementation order.
The current independent backend/core checkpoint is ready; live credential/host/migration
gates remain. Retained writer worktrees are inside ignored
.worktrees/. Do not invent a remote, default account/password, Google Flow API or successful
live generation. The Owner authorized existing environment-key reuse server-side.

## Delivered files and requirement evidence

Current engineering additions (no src/public/design/lock/env edits):

- server/ai/mock.ts,router.ts: labelled bilingual ten-idea/selected-only mock, openai/mock/auto
  mode, sticky safe fallback and fail-closed malformed mode. Existing environment key retained.
- server/storage/: exact owner/session-bound one-time OAuth PKCE, encrypted token vault,
  private My Drive backups up to128MiB, owner-marker downloads and bounded safe errors.
- server/cloud/: optional Supabase snapshot/leased queue adapter, injected memory test repo,
  fenced bounded runner and cloud AI composition. Review-only docs/sql/supabase-core.sql was
  verified only in empty in-memory PostgreSQL, not applied to any existing/hosted database.
- server/integrations.ts + app/index wiring: compatible authenticated capabilities/Drive/
  cloud routes. Owner comes from cookie auth, mutations require CSRF/Origin; revision CAS,
  selected-only jobs and deliberate failed-only retry. Cloud export remains CLIPS_REQUIRED
  until actual private scene media and Local Worker pairing exist.
- tests/mock-provider,drive,cloud,integrations-api: new mock/security/persistence regressions.
  scripts/check-cloud-sql.mjs and smoke-core.mjs verify prepared SQL and compiled startup.
- [CORE_INTEGRATION_HANDOFF](docs/CORE_INTEGRATION_HANDOFF.md), [DRIVE_STORAGE](docs/DRIVE_STORAGE.md),
  [CLOUD_CONTROL_PLANE](docs/CLOUD_CONTROL_PLANE.md) and updated architecture/API/operations.

Historical Phase1/design delivery:

- server/app.ts, auth.ts, store.ts, worker.ts, schema.ts: first owner/session/CSRF,
  resource ownership, persistence, prerequisites, queue and interrupted-job recovery.
- server/ai/ and shared/contracts.ts: ten ideas, one selection, selected-only expansion,
  four bibles/scenes, strict validation, safe provider failures and no automatic retry.
- server/media.ts: validated scene clips and real FFmpeg MP4 assembly; authenticated files.
- src/: functional TH/EN setup/dashboard/projects/workspace/queue/preview/export UI.
- public/, scripts/finalize-pwa.mjs and check-pwa.mjs: installable public shell only.
- .htaccess: deny Apache access to the repository and private data below XAMPP htdocs.
- tests/: auth, isolation, state, provider and synthetic-media regressions.
- README.md and docs/OPERATIONS.md: commands, environment defaults and recovery boundaries.
- ANTIGRAVITY_HANDOFF.md and docs/DESIGN_SYSTEM, UX_FLOW, UI_SPEC, MOBILE_UX, MOTION_SPEC,
  VISUAL_QA and I18N: reviewed premium studio target, component/capability map and QA gates.
- docs/design/: labelled 15-screen synthetic interactive reference, captures and QA record.
- scripts/preview-design.mjs: loopback3003 preview serving only the four reference assets.

Root inspected and integrated each writer's owned paths. QA's independent security and final
source reviews accepted the implementation after fixing successful-login throttling. Root
also enforced five-field AI brief projection and normalized usernames. No material review
findings remain. A final fixture review improved aggregate scene-duration coverage.

## Actual verification

Current integrated core: npm.cmd test exit0,58 total:57 passed,0 failed,1 POSIX-only test
skipped on Windows. npm.cmd run build (all three typechecks), lint and validate:pwa exit0.
Real FFmpeg again assembled a synthetic12-second MP4; no live AI/OAuth/Drive call occurred.
Optional SQL check passed6 groups on the final draft in PGlite:DDL/grants/actual denied roles,
owner/revision, exclusive target/token proof, selected-only atomic content and expired lease
retention without replay. PGlite is one connection; hosted PostgREST/advisors and real
multi-host lock contention are not accepted by this evidence.

Compiled HTTP smoke passed in an isolated temporary owner/data directory with mock mode:
setup/session, ten labelled ideas, one saved selection, expansion, prompt pack, unavailable
capabilities, logout401. Its process/data were cleaned up; actual owner storage was not seeded.
Independent QA reviewed auth/media/provider/OAuth/vault/cloud/SQL. POSIX permission repair,
shared/Shared Drive rejection, descriptor cleanup and malformed-mode safety findings are fixed.
Windows ACL operation and actual POSIX permission-test execution remain host verification.
Final document/link validation passed25 artifacts; secret/ignore validation passed100 tracked
files without printing values. Staged whitespace and scoped ESLint passed. The synthetic
Supabase fixture adjustment passed the affected14/14 cloud tests. Protected UI/design/package/
lockfile/local-schema paths are unchanged. The compiled backend is running on3001 and its
health/first-run auth status were checked. Checkpoint subject is recorded below.
Authoritative Codex usage read46% /81% remaining; the <=7% stop rule did not trigger.

Historical design/Phase1 verification follows:

Design reference: syntax and scoped ESLint passed; 270 rendered layout cases across15 screens,
two UI locales, three content modes and360/768/1440px passed the documented DOM checks.
Keyboard BibleTabs, modal focus wrap/Escape, sample selection and draft retention were exercised.
Four screenshots and measured evidence are linked from [design README](docs/design/README.md).
Final scoped ESLint and the22-document/link validation passed. Preview asset reads returned200,
source/Git/storage probes404 and POST405; independent QA found no actionable issues.
Staged secret/ignore validation passed78 tracked files and the staged whitespace check passed.
Copy feedback was observed, but session clipboard read-back was empty: payload copy remains
unverified. Physical IME, OS motion/transparency, assistive tech, zoom/full rendered contrast
and implementation visual QA remain pending. This turn did not modify or retest backend/app code.

Historical Phase1 verification:

`npm.cmd test` passed 14/14; `npm.cmd run lint` and `npm.cmd run build` exited0 (build includes
all three TypeScript checks). `npm.cmd run validate:pwa`, `validate:docs`, `validate:secrets`
and `git diff --cached --check` exited0. The strengthened contracts fixture subsequently
passed its focused 2/2 tests, scoped lint and test typecheck. Browser checks covered both
locales at360/768/1440px, setup, offline/reconnect, logout and zero private cache entries.
The real FFmpeg export used synthetic clips. No mocked result proves live creative quality.
The test browser/server were stopped and the actual first-run data was not seeded.
The installed Apache override/module configuration was read-only inspected; an isolated
port3080 probe returned403 for source, Git and test-database paths under the new .htaccess.
Its syntax check passed and test process stopped. No global Apache configuration changed.

## Blockers and next safe actions

1. Resolve the pending Owner API billing/key decision. Discovery GET was200, but generation
   returned429 insufficient_quota. Keep using the authorized existing environment key until
   the Owner selects another secure path. Do not retry or change billing automatically.
   After access is resolved, run a deliberate live brief →10 ideas →one choice →expansion
   check and record real quality/error evidence separately.
2. Antigravity owns implementation of DESIGN_SYSTEM/UI_SPEC/UX_FLOW/MOBILE_UX/MOTION_SPEC
   and visual QA in its separate worktree. Codex preserves compatible backend contracts.
   New API/worker/gate information is in CORE_INTEGRATION_HANDOFF; do not copy demo behavior.
3. With Owner-produced Google Flow clips, check visual continuity and the final creative
   result. The app already supports prompt packs, imports, assembly, preview and export.
4. Use the existing GitHub origin for a normal main checkpoint push. Preserve its separate
   design/antigravity-ui branch. Do not invent a remote or force push.
5. Owner must select the intended AI Content Factory Supabase project (a question is pending)
   and privately configure its server secret plus Google OAuth/encryption settings. The two
   connected unrelated Supabase projects were only listed and left untouched. Follow the
   concrete guides for owner consent and controlled private service verification. Review the
   prepared SQL/host permission/concurrency results before requesting live migration approval.
   Existing accounts/sessions/projects/media stay local until approved cutover. Cloud tasks
   while the laptop is offline need verified always-on hosting; a cached PWA shell is insufficient.
   Do not distribute service keys/refresh tokens to a Local Worker or claim pairing exists.

To inspect the local application, run `npm.cmd start` from this workspace after the verified
build, then open http://127.0.0.1:3001. Choose the first username/password yourself; no shipped
or test login exists in the actual data folder. See [README.md](README.md).

## Git state

Phase0 checkpoint: d0640b0. Scaffold checkpoint: debdffe. Phase1 checkpoint:311e82e.
Design checkpoint:9e389d4. The core checkpoint uses subject
`feat: prepare authenticated Drive and Supabase core integrations`; resolve via git log.
The final inspection found origin at DoubleFo20/AI-CONTENT-FASTORY with the separate
design/antigravity-ui branch and no main branch yet. A normal main checkpoint push is eligible;
verify delivery from origin/main. No runtime/env/private media/database/real secret is tracked.
Ignored writer worktrees and test artifacts remain locally for review.
