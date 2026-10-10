# Task dependency plan

STATUS: PAUSED_FOR_USAGE_RESET
RELEASE_READINESS: READY_FOR_OWNER_APPROVAL
ANTIGRAVITY_STATUS: QA_COMPLETED_PASS
Updated: 2026-10-10 (Asia/Bangkok)

หยุดตาม authoritative usage: เริ่ม checkpoint ที่เหลือ7%; ตรวจล่าสุด primary99% used (เหลือ1%), secondary59% used. ไม่เริ่ม feature/agent ใหม่ ไม่มี automatic resume หรือ scheduler.

Antigravity evidence published qa/v1-visual-review ddccf9c, tested source3e9c1aa, PASS; release source ไม่เปลี่ยนจาก source ที่ผ่าน QA. รวมรายงานโดยรักษาเอกสารล่าสุด. Final release regression: npm.cmd test145total/144pass/0fail/1POSIXskip75.748s; typecheck/lint/build/PWA ผ่านก่อนหน้านี้จาก code เดียวกัน. MP4 smoke ใหม่4.021333s และ actual Chrome playback/error=null ผ่าน. Owner database/media read-only baseline preserved; original app3006/บัญชี/10Mockideasอยู่เดิม. Main ไม่ merge/deploy.

Phase2 เตรียม Gemini official adapter, Owner provider selection/provenance/usage และ manual Drive integrity verifier. Final policy regression180total/179pass/0fail/1POSIXskip79.216s. Independent safety re-review ไม่พบ P1/P2. Browser ที่5559bbc ผ่าน workflow Mock และ focused360TH/768EN/1440EN; ไม่ได้ทดสอบทุก locale×viewport ใหม่หลัง policy-copy change. Gemini PRIMARY: ideas/expansion gemini-3.5-flash-lite เท่านั้น, ต้องมี private key และ ACF_GEMINI_FREE_TIER_CONFIRMED=true หลัง Owner ยืนยัน API project ไม่มี billing. Quotaหมดหยุด/no paid fallback/no auto retry. OpenAI สำรองถูกปิดจนได้รับ explicit approval ใหม่; ACF_OPENAI_REQUESTS_APPROVED ต้องไม่เปิดก่อน approval. ไม่มี live Gemini/Drive/cloud verification หรือ billing action.

Owner requests ที่ยังรอ: private Gemini key+Free Tier project confirmation; Google OAuth credentials/consent; app-specific Supabase+HTTPS host และ schema/deployment approval. ไม่ส่ง secrets ในแชต. Local V1 VERIFIED, Mock text MOCK_ONLY, Gemini/Drive/cloud foundation PREPARED, OpenAI BLOCKED, notebook-offline/full automation NOT_IMPLEMENTED.

NEXT_TASK: หลัง usage reset และมี invocation ใหม่ ตรวจ usage/Git checkpoint ก่อน; Owner review PR#2 โดยยังไม่ merge main. เมื่อ Gemini private key+Free Tier confirmation พร้อม ทำ isolated10ideas→Ownerเลือกหนึ่ง→expand live canaryครั้งเดียว บันทึก usage และหยุดเมื่อ quotaหมด. จากนั้น Drive OAuth/verified upload-download-restore canary ที่ได้รับอนุมัติ. Cloud ต้องผ่าน host/schema approval และ disconnected-device proof ก่อนกล่าวว่าใช้งานได้.

หลักฐาน: [Final review](docs/release/FINAL_REVIEW.md), [Visual QA](docs/release/QA_VISUAL_REPORT.md), [Phase2 operations](docs/PHASE2_OPERATIONS.md), [Phase2 QA](docs/PHASE2_QA.json).

## Historical checkpoints — superseded by the current status above

STATUS: PHASE2_PREPARED_LIVE_GATES_PENDING
Updated: 2026-10-10 (Asia/Bangkok)

| ID | Phase2 task | State |
| --- | --- | --- |
| P2-A | FinalRCreview/regressions/MP4/data preservation | VERIFIED; releaseba327e2/PR2Draft |
| P2-B | Geminiadapter/explicitOwnerselection/provenance/usage/verifiedcost | PREPARED; code5559bbc; livekey/quotaBLOCKED |
| P2-C | Drive normal-auth syntheticroundtrip verifier | PREPARED;10injectedtests; OAuth+restoreapprovalBLOCKED |
| P2-D | Cloud/Supabaseinventory/HTTPS/workerprotocol assessment | PREPARED; noapprovedappactiveproject/host; pairingNOT_IMPLEMENTED |
| P2-E | ExistingFlowassist/variablelength/creditbudget/editor | PRESERVED; realclipacceptanceOwner-operated |
| P2-QA | Combined177tests/typechecks/lint/build/PWA/securityreview | 176PASS/0FAIL/1SKIP; focusedbrowserPENDING |
| P2-REVIEW | Phase2DraftPR + privateexternalgates | Readyforcheckpoint; noRC/mainmerge |

ExactnexttaskandOwnerconfiguration: [Phase2 operations](docs/PHASE2_OPERATIONS.md); [QA](docs/PHASE2_QA.json). HistoricallocalV1tasksbelowremainpreserved.

| ID | Task | Depends on | State |
| --- | --- | --- | --- |
| RC-01 | Preserve/fetch/review main, PR#1 and Premium V2 in isolated release | Owner mission | DONE |
| RC-02 | Diagnose actual Ideas quota failure and stale state | RC-01 | DONE |
| RC-03 | Mode/provenance/cache/progress/retry/cancel/deadline/restart fences | RC-02 | VERIFIED |
| RC-04 | Consistent backup + original10Mock ideas recovery; preserve accounts/history/media/schema | RC-03, Owner proceed | VERIFIED |
| RC-05 | Selected-only variable story + bibles/scenes/EN prompts/TH explanation | RC-03 | MOCK_ONLY |
| RC-06 | Assisted Flow refs/status/credit rate/matching/missing clips | RC-05 | PREPARED; real Flow gate |
| RC-07 | Real clip/audio/image imports + deterministic editor/MP4/play/download/persistence | RC-05 | VERIFIED_SYNTHETIC_MEDIA |
| RC-08 | Drive private folders/index/progress/verified retry/cache restore | RC-07 | PREPARED; OAuth/live gate |
| RC-09 | Request-lifecycle shutdown/auth/file/OAuth/queue safety review | RC-03,RC-08 | VERIFIED; independent review accepted |
| RC-10 | THEN/48viewport cases/PWA/restart/read-error recovery; critical tablet/mobile repairs | RC-05,RC-07 | VERIFIED; visual/physical-device acceptance pending |
| RC-11 | Full regressions/typecheck/lint/build/PWA/docs/secrets | RC-09,RC-10 | 144pass/0fail/1POSIXskip; checks passed |
| RC-12 | Storage-preserving local3006 activation; normal release push/draft PR | RC-11 | VERIFIED; [Draft PR#2](https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/2) |
| RC-13 | Antigravity actual combined UI visual QA + final integration review | RC-12 | OWNER_REPORTED_READY; final evidence/SHA + Owner approval PENDING |
| RC-14 | Live AI10/selected expansion canary after quota fix | Owner billing/access | BLOCKED; actual HTTP429 insufficient_quota |
| RC-15 | Live Drive OAuth/checksum upload/download/restore | Owner Google setup+consent | BLOCKED |
| RC-16 | Supabase/HTTPS host/approved migration + paired-worker bridge + notebook-offline mobile acceptance | RC-15, Owner host/schema approval | PREPARED / BLOCKED / NOT_IMPLEMENTED individually |

Latest source checkpoint `b271855`; Root reviewed disjoint agents before integration. Root owns Git/contracts/config/progress/schema. Existing architecture, owner data and Antigravity original worktree/specifications remain preserved. No main merge/force push/deploy/billing/publishing.

Final regression rerun ที่3e9c1aa ผ่าน145/144/0/1, typecheck/lint/build/PWA และ actual MP4 playback; [FINAL_REVIEW](docs/release/FINAL_REVIEW.md). Phase2 Gemini/provider/usage + Drive verifier อยู่สาขาแยก และ cloud remains externally gated.

Exact next task and consolidated Owner gates: [HANDOFF](HANDOFF.md). Current [QA](docs/release/QA_RESULTS.json) and [readiness](docs/release/V1_READINESS.md) supersede the historical counts below.

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
