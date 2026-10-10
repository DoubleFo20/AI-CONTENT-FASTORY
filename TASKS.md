# Tasks and dependencies

## Current V1 Release Candidate

| ID | งาน | Dependency | สถานะ |
| --- | --- | --- | --- |
| RC-01 | inspect/fetch/compare main, PR#1 and Premium V2; preserve existing work/data | — | DONE |
| RC-02 | dedicated release/v1-real-world + safe V2 integration | RC-01 | DONE |
| RC-03 | actual quota/stale ideas diagnosis and fenced queue/cancel/retry/progress | RC-02 | DONE |
| RC-04 | consistent original SQLite backup + 10 Mock ideas recovery; preserve auth/history/media/schema | RC-03, Owner proceed | DONE |
| RC-05 | selected-only variable-duration story/bibles/scenes/EN Flow prompts/TH explanation | RC-03 | DONE_MOCK_ONLY |
| RC-06 | Flow scene status/reference/filename matching/owner-verified credit estimate | RC-05 | DONE_ASSISTED; live Flow gate remains |
| RC-07 | deterministic FFmpeg editor/audio/images/subtitles/order/quality/play/download | RC-05 | VERIFIED_SYNTHETIC_MEDIA |
| RC-08 | six Drive categories, private media index/progress/idempotent uploads/verified cache restore | RC-07 | PREPARED; fake-adapter tests; OAuth/live gate remains |
| RC-09 | cancel/drain actual HTTP handlers and late upload cleanup before Store close | RC-03,RC-08 | DONE; independent retake accepted; full regressions passed |
| RC-10 | critical THEN/mobile/PWA/persistence regression | RC-05,RC-07 | IN_FINAL_QA |
| RC-11 | full regressions/typecheck/lint/build/PWA/docs/secrets | RC-09,RC-10 | 144passes/1POSIXskip; lint/build/PWA/docs passed; staged hygiene pending |
| RC-12 | safe local activation; commit/push release candidate/draft PR to main | RC-11 | LOCAL_ACTIVE3006; publication pending |
| RC-13 | Antigravity visual QA of actual combined UI + final integration review | RC-12 | HANDOFF_PREPARED; visual acceptance PENDING |
| RC-14 | real AI/Flow/Drive/Supabase/cloud/paired Local Worker | external owner gates | BLOCKED / PREPARED / NOT_IMPLEMENTED individually; see matrix |

Root reviewed isolated Sol High core/editor and Luna UI/QA/docs output before copying owned paths. Root alone owns Git/shared/config/progress/schema. No concurrent edits of the same files; Antigravity design worktree/specifications remain preserved. New schema migration, billing, public deployment, content publishing and main merge require separate approval.

Exact next task and required Owner actions are in [HANDOFF](HANDOFF.md). Current evidence supersedes historical checkpoint counts below.

## บันทึก checkpoint ก่อนหน้า (historical)


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
| D-02 | Design implementation in existing client | D-01,P1-07 | Antigravity in separate worktree | DELIVERED_ON_DESIGN_BRANCH; integrated by I-02/I-03 |
| D-03 | Actual integrated application visual QA | I-04 | Antigravity | READY_FOR_REVIEW; PENDING |
| D-04 | Drive primary-media, trusted cost and durable approval contracts | D-01,C-03; approved external integration | Codex engineering lead | BACKUP_API_PREPARED; primary media index/cutover and cost/approval pending |
| C-01 | Updated Supabase/Drive/Cloud+Local architecture without rewriting local stack | P1-08 | Root | DONE; no migration applied |
| C-02 | Labelled Mock AI, bounded auto fallback and safe invalid-mode handling | C-01 | Luna agent + Root/QA | DONE; injected provider checks |
| C-03 | Drive OAuth/encrypted vault/private128MiB media adapter | C-01 | Sol High core + independent QA | PREPARED; real credentials/grant H-03 |
| C-04 | Supabase snapshot/queue adapter, CAS/fencing and review-only SQL | C-01 | Sol High cloud + Root/QA | PREPARED; isolated SQL6 groups passed; real host H-04,H-05 |
| C-05 | Authenticated integration/cloud APIs and safe export gate | C-02,C-03,C-04 | Root + QA | DONE; compiled mock smoke passed |
| C-06 | Cloud AI executor and Local Worker target/lease architecture | C-04,C-05 | Sol High + Root | FOUNDATION_DONE; actual local pairing/media bridge H-05 |
| C-07 | Combined regressions, typecheck/build/lint/PWA and independent security review | C-05,C-06 | Luna QA + Root | DONE;57 passed,1 POSIX skip Windows |
| C-08 | Core/API/Drive/cloud operations handoff and Git checkpoint | C-07 | Root + Luna docs | DONE;2d112dc pushed/verified; docs/secrets/whitespace passed |
| I-01 | Fetch/compare branches, inspect worktrees and preserve uncommitted work | C-08,D-02 | Root | DONE; main dfe2b2c, design cad482e |
| I-02 | Dedicated integration/v1-ui-core worktree and safe design merge | I-01 | Root | DONE; no conflicts; core unchanged |
| I-03 | Connect approved UI to actual APIs and fix functional/accessibility regressions | I-02 | Sol High UI + Root review | DONE; picker, saved choice, TH/EN, honest capabilities, focus and44px targets |
| I-04 | Combined automated/browser/auth/offline/media verification | I-03 | Luna QA + Root | DONE;63 passes,1 POSIX skip;216 layout+6 login cases; real synthetic24-second MP4 |
| I-05 | Evidence, normal commit/push and PR to main | I-04 | Root + Luna docs | DONE; fda96d6 pushed/remote verified; Draft PR#1 targets main; unmerged |
| I-06 | Visual QA handoff for actual combined app | I-04 | Root | READY; external visual review PENDING |
| I-07 | Final integration review before main merge | I-05,D-03 | Owner + reviewers | PENDING; main not merged |
| H-03 | App Google OAuth configuration, owner consent and real private round trip | C-03 | Owner + Root | AWAITING_EXTERNAL |
| H-04 | App-specific Supabase project/secret and hosted SQL/RLS/PostgREST verification | C-04 | Owner + Root | AWAITING_PROJECT_SELECTION; unrelated projects untouched |
| H-05 | Approved data/auth/media migration, always-on host and Local Worker pairing | H-03,H-04,C-06 | Owner + Root | AWAITING_DEPENDENCIES_AND_MIGRATION_APPROVAL |
| H-01 | Owner-controlled real Google Flow generation/clips and creative review | H-02,P1-05 | Owner | AWAITING_EXTERNAL |
| H-02 | OpenAI project credits/access and live ideas/expansion acceptance | P1-04 | Owner + Root | AWAITING_HUMAN; insufficient_quota |

Verification evidence and the separate live/design/creative gates are recorded in
[PROJECT_STATUS.md](PROJECT_STATUS.md). No secondary factory work is scheduled in V1.

## Parallel ownership contract

Current integration assignment: Root owns the dedicated integration branch, Git, progress and
final acceptance. UI, QA and docs writers used separate worktrees with disjoint paths. Root
reviewed their output before copying it to the candidate. Antigravity's original branch/worktree
and UX specifications remain untouched; Antigravity owns actual-app visual QA. Core/shared/public/
package paths stay identical to main. No concurrent writer edits occurred in the candidate.

Historical Backend/Core assignment: Root owns shared contracts, server/app/index/integrations,
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
