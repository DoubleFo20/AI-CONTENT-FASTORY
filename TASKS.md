# Tasks and dependencies

| ID | Task | Depends on | Owner | State |
| --- | --- | --- | --- | --- |
| P0-01 | Workspace/runtime/usage discovery, Git and safe ignore rules | — | Root | DONE |
| P0-02 | Stable PRD, V1 scope, IA, pages, UX and mobile requirements | P0-01 | Root | DONE |
| P0-03 | System, AI, security, i18n and API/data contracts | P0-02 | Root | DONE |
| P0-04 | Antigravity handoff READY_FOR_DESIGN | P0-02,P0-03 | Root | DONE |
| P0-05 | Artifact validation and checkpoint commit | P0-04 | Root | DONE |
| P1-01 | npm/TypeScript scaffold and tooling | P0-05 | Root | DONE |
| P1-02 | Backend auth, project state/ownership, persistent queue | P1-01 | Core agent + Root review | DONE |
| P1-03 | TH/EN functional client shell, setup, dashboard/workspace | P1-01 | Web agent + Root review | DONE |
| P1-04 | OpenAI provider and selected-story structured pipeline | P1-01 | Root + QA review | DONE_LOCAL; live gate H-02 |
| P1-05 | Clip validation, FFmpeg assembly and authenticated media | P1-02 | Core agent + Root review | DONE_SYNTHETIC_MEDIA |
| P1-06 | API regressions and independent security review | P1-02,P1-04,P1-05 | QA agent | DONE; 14/14 tests |
| P1-07 | Integration/typecheck/lint/build/browser/mobile/PWA QA | P1-03,P1-06 | Root + QA | DONE |
| P1-08 | Evidence, operations guide and checkpoint commit | P1-07 | Root | DONE_LOCAL |
| D-01 | Reviewed design system, UX specs and interactive reference | P0-04,P1-07 | UX lead + design/spec/QA agents + Root review | DONE; DESIGN_READY_FOR_CODEX |
| D-02 | Design implementation in existing client | D-01,P1-07 | Antigravity in separate worktree | OWNED_BY_ANTIGRAVITY; Codex does not concurrently edit UX/UI |
| D-03 | Visual QA | D-02 | Antigravity | BLOCKED_BY_D-02 |
| D-04 | Drive primary-media, trusted cost and durable approval contracts | D-01,C-03; approved external integration | Codex engineering lead | BACKUP_API_PREPARED; primary media index/cutover and cost/approval pending |
| C-01 | Updated Supabase/Drive/Cloud+Local architecture without rewriting local stack | P1-08 | Root | DONE; no migration applied |
| C-02 | Labelled Mock AI, bounded auto fallback and safe invalid-mode handling | C-01 | Luna agent + Root/QA | DONE; injected provider checks |
| C-03 | Drive OAuth/encrypted vault/private128MiB media adapter | C-01 | Sol High core + independent QA | PREPARED; real credentials/grant H-03 |
| C-04 | Supabase snapshot/queue adapter, CAS/fencing and review-only SQL | C-01 | Sol High cloud + Root/QA | PREPARED; isolated SQL6 groups passed; real host H-04,H-05 |
| C-05 | Authenticated integration/cloud APIs and safe export gate | C-02,C-03,C-04 | Root + QA | DONE; compiled mock smoke passed |
| C-06 | Cloud AI executor and Local Worker target/lease architecture | C-04,C-05 | Sol High + Root | FOUNDATION_DONE; actual local pairing/media bridge H-05 |
| C-07 | Combined regressions, typecheck/build/lint/PWA and independent security review | C-05,C-06 | Luna QA + Root | DONE;57 passed,1 POSIX skip Windows |
| C-08 | Core/API/Drive/cloud operations handoff and Git checkpoint | C-07 | Root + Luna docs | DONE;2d112dc pushed/verified; docs/secrets/whitespace passed |
| H-03 | App Google OAuth configuration, owner consent and real private round trip | C-03 | Owner + Root | AWAITING_EXTERNAL |
| H-04 | App-specific Supabase project/secret and hosted SQL/RLS/PostgREST verification | C-04 | Owner + Root | AWAITING_PROJECT_SELECTION; unrelated projects untouched |
| H-05 | Approved data/auth/media migration, always-on host and Local Worker pairing | H-03,H-04,C-06 | Owner + Root | AWAITING_DEPENDENCIES_AND_MIGRATION_APPROVAL |
| H-01 | Owner-controlled real Google Flow generation/clips and creative review | H-02,P1-05 | Owner | AWAITING_EXTERNAL |
| H-02 | OpenAI project credits/access and live ideas/expansion acceptance | P1-04 | Owner + Root | AWAITING_HUMAN; insufficient_quota |

Verification evidence and the separate live/design/creative gates are recorded in
[PROJECT_STATUS.md](PROJECT_STATUS.md). No secondary factory work is scheduled in V1.

## Parallel ownership contract

Current Backend/Core assignment: Root owns shared contracts, server/app/index/integrations,
cloud service composition, architecture/progress/config/Git and final schema acceptance.
Core writer owns new server/storage files and Drive tests in core-drive; cloud writer owns
new server/cloud adapters/runner, cloud tests and review-only SQL in core-cloud. Scoped Luna
writer owns new mock/router/provider tests and Drive guide in core-provider. Independent QA
owns only new integration API tests in core-security and reviews high-risk code read-only.
Antigravity owns src/, public/, docs/design/ and UX/UI specs. No concurrent edits to those paths.
Root reviewed and copied finished owned paths into main, then ran combined checks. Existing
package/lockfile/environment/local schema remained compatible and untouched.

The following describes historical Phase1/design ownership:

Root: all governance/progress docs, shared/, server/ai/, package manifests/lockfiles,
configs, schema definitions, tooling, Git and integration. Core writer: server/ except
server/ai/ and Root-owned schema/contracts. Web writer: src/, public/ except Root manifest/
service worker assets. QA: tests/ only; server and client are read-only review targets.
All writers use isolated worktrees within ignored .worktrees/. Git operations remain Root-only.
Root reviews and copies owned paths into main after writers finish, then runs combined checks.

For the completed design request, Root owned DESIGN_SYSTEM/UX_FLOW/I18N, handoff/progress,
preview server and integration. Design-prototype agent owned docs/design/index.html/studio.css/
studio.js/README.md; specs agent owned UI_SPEC/MOTION_SPEC; QA agent owned MOBILE_UX/VISUAL_QA
and performed independent read-only review. Each writer used an isolated design worktree.
Root added final corrections and measured the browser; production src/server/shared stayed untouched.
