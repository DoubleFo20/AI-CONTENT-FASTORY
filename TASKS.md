# Task dependency plan

STATUS: PAUSED_FOR_USAGE_RESET

## Gemini activation preparation — 2026-10-10

Owner กำลังตั้ง private GEMINI_API_KEY และตรวจ Free Tier; ยังไม่มี live Gemini call หรือ successful live result. Backend ต้อง GEMINI_API_KEY + ACF_GEMINI_FREE_TIER_CONFIRMED=true จากแหล่งเดียวกันหลัง Owner ตรวจ API project/Billing disabled. Primarytext=gemini-3.5-flash-lite; OpenAI requestsยังไม่อนุมัติ, ไม่มีpaidfallback/retry/billingchange.

เพิ่ม Windows hidden-input/DPAPI helper + isolated launcher: current-user ACL, ancestor/reparse rejection, atomicnooverwrite, freshcontainedcanary, envallowlist, boundedPID/listening/health readiness. คู่มือไฟล์และคำสั่งละเอียด: [GEMINI_LOCAL_SETUP_TH](docs/GEMINI_LOCAL_SETUP_TH.md). Helper startupไม่เรียก AI. Independentread-onlyreviewปิดP1/P2; WindowsPowerShell5 th-THregression14/14ผ่าน; PS7prepatchQA9/10 (timestampissue) เก็บไว้ตามจริง, PS7postpatchยังไม่verified. Finalindependentread-onlyreviewยอมรับboundednetstat/DateTimefix ไม่มีP1/P2. Rootหยุด4syntheticfixtureprocessesที่verifyidentity/pathแล้ว; Owner3006ยังactive.

Explicit --expand-first-idea สำหรับ canaryใหม่เท่านั้น: ideas/select/expandอย่างละหนึ่งPOST แล้วตรวจสิบconcepts, selected-onlypackage/scene refs/คำอธิบายไทย/Flowpromptsอังกฤษ. ทุก --project-id resumeอ่านสถานะเท่านั้น; ไม่มีexpandjobเดิมหยุดCANARY_STATE_UNSAFE. ไม่เปลี่ยน Owner storyหรือmode. Rootรัน targeted Gemini/provider/Drive/cloud/presence regression74/74ผ่าน, three typechecks/full lintผ่าน. Testsทั้งหมดinjected/synthetic, ไม่ใช่liveproviderproof.

Owner app3006 ยัง RC/Mock/PID14548; /,health,authstatus200และanonymousprojects401. Read-onlypreservationผ่าน:1owner/1project/4jobs/10ideas/0active/0clips/0exports,baselineunchanged. ไม่มี src/public/server/shared/schema/dependency/lockfile/env/CI changeในcheckpointนี้. PremiumCinematicV2/source0b35ceaยังคงเดิม. PR#2และ#3ยังOPEN/DRAFT/unmerged; mainไม่เปลี่ยน.

DriveOAuth/folders/encryptedvault/upload/download/checksumverifierและcloudjobs/presence/reconnectfoundationตรวจด้วยmockต่อได้; 74testsรวมDriveverifier/cloudด้วย. ไม่มีOAuthgrant/remoteupload/approvedrestore/Supabaseproject/HTTPShost/schema/deploy; notebook-offline/fullautomationยังNOT_IMPLEMENTED. ห้ามลบlocalmedia/cutover/publish/deploy/mergeโดยไม่มีapproval.

NEXT_TASK: หลังusage reset/Owner invocation ให้รัน pwsh -NoProfile -File tests/gemini-local-setup.ps1 เพื่อตรวจ PS7 th-TH หลัง timestamp DateTime/string และ bounded netstat fixes (WinPS5ล่าสุด14/14ผ่าน). เมื่อOwnerยืนยันprivateGEMINI_API_KEY+APIprojectFreeTier/Billingdisabledพร้อม จึงbuildPhase2/startfresh3013/normalcanaryaccount/verify-gemini-live --expand-first-ideaหนึ่งครั้ง (สูงสุดideas1+expand1 ไม่มีretry). ใช้UUIDเดิมอ่านสถานะหากtimeout;ไม่generateOwnerstoryเดิม. Owner3006activationต้องbackup/0active/schema check+preservesavedMock. Driveยังต้องOAuth+consent;Cloudต้องapprovedproject/HTTPS/schema/deploy. ห้ามmainmerge/publicdeploy/publish/billing.

Usage authoritative ล่าสุด:เหลือ3%/26% (5hr/week), แตะthresholdแล้ว. หยุดstartingfeatures/spawns; essentialchecks/handoff/checkpointpushเท่านั้น จากนั้นหยุดจนusage resetและnewOwnerinvocation. ไม่ใช้resetcredit/ไม่มีschedulerหรือautomaticresume.

---


STATUS: PHASE2_PREPARED_LIVE_GATES_PENDING
RELEASE_READINESS: READY_FOR_OWNER_APPROVAL
ANTIGRAVITY_STATUS: PUBLISHED_PASS_FOR_PRE_PATCH_RELEASE_3e9c1aa
Updated: 2026-10-10 (Asia/Bangkok)

Antigravity เผยแพร่ QA commit ddccf9c/PASS ที่ source3e9c1aa แล้ว หลักฐานสองไฟล์ถูกเก็บใน release. RC sourceปัจจุบัน 0b35cea82d7e7867e11c653df0d6d790a6b66f19 เพิ่มเฉพาะ Drive help แบบ block, dialog สีตาม Premium Cinematic V2 และ focus กลับปุ่มเมนูมือถือ; backend baseline b271855 คงเดิม ไม่มีการย้าย schema. Published PASS เดิมไม่ได้ครอบคลุม UI delta นี้ จึงเตรียม handoff ให้ตรวจ actual latest RC ก่อนอนุมัติขั้นสุดท้าย.

ผลจริง RC: Node regression 145 total/144 passed/0 failed/1 POSIX permission skip บน Windows ที่de59fe6 (50.786s); หลัง frontend focus fixผ่าน build/สาม typechecks และ lint. Browserปัจจุบัน0b35ceaผ่าน12 dialog cases + Preview360 TH/ENสอง cases. Regressionไฟล์ modal-focus.js รันจริงแยกทั้งRC/Phase2 ผ่าน12/12ต่อสาขา รวม contrast, Tab, Escape/Close และ focus กลับ opener. MP4สังเคราะห์ใหม่ผ่าน FFprobe: H.264720×1280 + AAC48k stereo,4.021333s/122601bytes; Chrome เล่นได้; แยกตรวจ HTTP download ด้วยขนาด/hash ตรงต้นฉบับ. ไม่ใช่ Flow live generation.

Owner app3006ใช้ original storage และ Mock; client rebuildแล้ว, API/backendเดิมคงอยู่. Read-only baselineยืนยันบัญชี/โปรเจกต์/ประวัติ4jobs/10cachedMockideas/0activejobsและสื่อเดิมยังอยู่ ไม่มี database writes/reset/migration. Child processไม่ได้รับ OpenAI credential; keyในenvironmentที่Ownerเก็บถาวรไม่ถูกแก้.

Phase2 source de462843a2847e850334730c004f8b1d8f01e0b6 อยู่ใน stacked Draft PR#3 target release/v1-real-world. Gemini Free Tier gate/provider selection/usage, Drive verifier และ one-request Gemini canaryพร้อม injected tests; pure worker presence/reconnectพร้อม10tests ยังไม่มี authenticated broker/durable CAS/active waiting UI. Full regressionที่86dbbb5:204total/203passed/0failed/1POSIXskip,91.243s; หลังแก้ frontendผ่านbuild/typechecks/lintและbrowsertargeted. Matrix36/36ที่86dbbb5 + latest12dialogที่de46284ผ่าน, TH/EN×360/768/1440 ไม่มีpage overflow. RuntimeขณะQAล้างcredentialsและใช้ฐานข้อมูลสังเคราะห์ ไม่มี live provider calls.

Geminiเป็นprimarytextเฉพาะ Flash-Lite; ต้อง private backend keyและ ACF_GEMINI_FREE_TIER_CONFIRMED=true หลังOwnerตรวจว่าAPIprojectใช้FreeTier/Billingdisabled. Quotaหมดหยุด ไม่มีpaidupgrade/retry/providerfallback. OpenAIต้องapprovalใหม่ก่อนเรียก. Google Flowเป็นprimaryvideoแบบOwner-operated; Driveต้องOAuth/consentและliveupload/download/approvedrestoreก่อนcutover. Cloudยังต้องapprovedSupabase/HTTPShost/schema, owner-scopedclaim, frozenprovider/mediareceiptและdisconnected-deviceproof.

usage ที่ตรวจจากบัญชีล่าสุดเหลือ 45% ในรอบ 5 ชั่วโมง และ 32% ในรอบสัปดาห์ ยังไม่ถึงเกณฑ์หยุด 7%; checkpointหยุด1%ก่อนหน้าคงเป็นประวัติ. ไม่มีschedulerหรือautomaticresume. ไม่มีmerge main/deploy/billing/publish.

NEXT_TASK: Ownerreview PR#2และPR#3; ตรวจUIdeltaจริงผ่านAntigravityhandoff. เมื่อprivateGeminiKeyและFreeTierconfirmationพร้อมให้รันPhase2runtimeแยก→canary10ideasหนึ่งครั้ง; resumeด้วยproject-idเดิม ไม่regenerate และOwnerเลือกหนึ่งก่อนexpand. หลังDriveOAuthconsentตรวจsmall-fileroundtrip/checksumและrestoreที่Ownerอนุมัติ; cloudต้องapprovalก่อนเปิดใช้งาน.

ดู [ผล final review](docs/release/FINAL_REVIEW.md), [readiness matrix](docs/release/V1_READINESS.md), [published QA](docs/release/QA_VISUAL_REPORT.md). Localauth/persistence/editor/MP4 VERIFIED; storytext MOCK_ONLY; Gemini/Drive/cloudfoundation PREPARED; notebook-offline/fullautomation NOT_IMPLEMENTED.

| งาน | สถานะ / dependency |
| --- | --- |
| RC regression/current dialogs/MP4/data preservation | VERIFIED; Owner approval และ UI delta review pending |
| Phase2 injected regression + TH/EN responsive QA | VERIFIED within synthetic/injected scope |
| Gemini canary | PREPARED; private key + verified Free Tier project required |
| Drive round trip / verified restore | BLOCKED; OAuth/consentและrestore approval |
| Worker presence helper | PREPARED; broker/auth/durable CAS/media bridgeยังไม่มี |
| Notebook-offline cloud acceptance | NOT_IMPLEMENTED; approved host/project/deployment required |

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
