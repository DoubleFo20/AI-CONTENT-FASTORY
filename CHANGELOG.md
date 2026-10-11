# Changelog

## 2026-10-12 — Gemini Free Tier selected expansion ผ่าน live หนึ่งคำขอ

- Latest PR3 source8f95c16/implementation921ce7b ขยายselectedcanaryสำเร็จ 3scenes/20sec/2characters/1location/2rules; input624/output1291 tokens มีไทย/อังกฤษครบ ใช้10ideas/selectionเดิม ไม่เปลี่ยนOwner3006
- ตรวจproject/keyFreeTierและNoBillingAccountก่อนส่ง; exclusiveapproval1/1/0remaining, backup/schema/history/readonlypreservationผ่าน ไม่retry/Models/OpenAI/Paid/Billing ไม่resetusedhelpers
- Harness15/15/Gemini62/62/production7/7/DriveCloud68pass1WindowsPOSIXskip; build/typechecks/lint/parserผ่าน CanonicalFlowcompilerใช้realcachedpackageเติมcontinuity/appearance/duration/ratio/IDs ไม่มีFlowAPI/clipgeneration
- [ผลตรวจภาษาไทย](docs/GEMINI_EXPANSION_LIVE_RESULT_20261012_TH.md) และ [safe JSON evidence](docs/GEMINI_EXPANSION_LIVE_RESULT_20261012.json); historicalHTTP400parameterยังNOT_PROVEN PR2/PR3คงDraft/unmerged Drive/cloudยังต้องexternalauthorization/liveproof

## 2026-10-12 — checkpoint ของ compact Gemini expansion (ทดสอบ offline 2026-10-11)

- Source921ce7b เพิ่ม strict flat draft/local A–D assembler คง StoryPackage/API/schema/queue/UI เดิม; expansionหนึ่งrequestเหมือนเดิม ลด wire2,281→1,568ไบต์ และ Ideas schemaไม่เปลี่ยน [รายละเอียด](docs/GEMINI_EXPANSION_FIX_TH.md)
- Scoped62/62; full227/226pass/0fail/1WindowsPOSIXskip รวม FFmpeg/FFprobe; build/สามtypechecks/lintผ่าน Independent source review READY/noP1P2 ไม่มีliveAI/Models/OpenAI/Billing/retry
- Canary10realideas/selection/4jobs/schema/accountsอยู่ครบแบบread-only Owner3006คืนreleaseเดิมในMockโดยไม่มีexternalcredentials logicaldata/mediaก่อน–หลังตรงกัน หลังreviewhelperแก้P2 cleanup/PIDownershipแล้ว Canary3013ไม่start
- HTTP400/INVALID_ARGUMENTspecificparameterยังNOT_PROVEN; requestใหม่ยังไม่ผ่านlive ต้องOwnerapprovalใหม่สูงสุด1selected-onlyFreeTierexpansion ไม่ใช้usedhelpersซ้ำ PR2/PR3คงDraft/unmerged Drive/Cloudexternalgatesคงเดิม

## 2026-10-11 — one approved diagnostic expansion; INVALID_ARGUMENT observed

- ใช้สิทธิ์ Owner-approved expansion1requestบนcachedcanaryเดิม Job3d7b6ca4 failedAI_REQUEST_FAILED/HTTP400 และครั้งนี้เก็บ providerStatusINVALID_ARGUMENT/errorResponsePARSED_ERRORได้ ยังไม่ทราบ parameter/field ที่ผิด ไม่มี package/expansionreceipt [ผลจริง](docs/GEMINI_DIAGNOSTIC_RESULT_20261011_TH.md)
- Consistentbackup/schema/idle/historyผ่านก่อนverifiedcanaryrestart source1538c58 Newmarkers/logsแยกold; normalcanaryCSRF/logoutconfirmed Offlinehelpertests12/12และbuild/typechecksผ่าน IndependentreviewREADY/noP1P2 ไม่มี furtherretry/Modelsprobe/OpenAI/Billing/paidfallback
- 10realideas/selection/schema/users/old3jobhistoryอยู่ครบ; now4jobs/0active Owner3006health200/read-onlybaselinepreserved ยังRC/Mock/PremiumUI ไม่มี appsource/UI/schema/media/Ownerdata change
- Budgetเหลือ0และPR2/PR3ยังDraft/unmerged Drive/Cloudexternalgatesคงเดิม ผลเก่ารักษาตามsource ไม่มีnewfullsuite/MP4/browserหรือliveintegration-successclaim

## 2026-10-11 — offline HTTP400 investigation; Owner retains Mock

- Owner ยังไม่อนุมัติ Gemini เพิ่ม; checkpointนี้ 0 live requests/0 Models API requests ไม่มี OpenAI/Billing/provider fallback หรือ runtime change
- ตรวจ official model/v1beta endpoint/generated schema/config ไม่พบความไม่ตรง contract ที่พิสูจน์ HTTP400 ข้อจำกัดเดิมคือไม่ได้เก็บ Google body/status/reason จึงไม่อ้างว่าแก้ generation root cause แล้ว [ผลวิเคราะห์](docs/GEMINI_HTTP400_OFFLINE_REVIEW_TH.md), [redacted audit](docs/GEMINI_HTTP400_OFFLINE_AUDIT.json)
- เพิ่ม enum-only parsing outcome/trusted invalid-field category และ targeted regression tests; request/schema/model/budget เดิม Independent source review READY/noP1P2; 56/56 injected/build/typechecks ผ่าน ก่อน lint พบ regex escape 6 จุด หลังแก้ semantics เดิม provider21/21/lint ผ่าน
- Owner3006 HTTP200/anonymous401/read-only baseline preserved; UI/data/media/schema/env/dependencies เดิมคงอยู่ ไม่มี full suite/MP4/browser/live rerun ใหม่ PR2/PR3คงDraft/unmerged ขั้นตอน live ถัดไปต้อง approval ใหม่สำหรับ selected-only expansion 1 request; Drive/Cloud ยังรอ external authorization

## 2026-10-11 — one approved expansion retry and safe status diagnostics

- Used exactly one Owner-approved Free Tier retry on the existing cached canary; newjob599d80d9 failedAI_REQUEST_FAILED/HTTP400. Preserved10ideas/selection/originaljobs; normalcanarylogoutconfirmed. No additional generation/fallback/OpenAI/Billing/Ownerdatawrites. Live package/scenes/prompts remainBLOCKED; see [report](docs/GEMINI_LIVE_RESULT_20261011_TH.md).
- Added allowlisted providerStatus and fixed canonical schema-complaint classification without rawmessages/metadata/secrets; malformeddetails do not erase safestatus. No request/schema/model/budget changes. Independentread-onlyreviewREADY/noP1P2.
- Targeted54/54injected plus privatehelper11/11offline; build/3typechecks/lintpassed. Full217/216pass/1WindowsPOSIXskip/FFmpeg evidence belongs to previousbf276fb checkpoint; no new browser/responsive/MP4/liveFlow/Drive/Cloudclaim.
- Owner3006HTTP200/read-onlybaselinepreserved; PremiumUI/bundles/schema/env/dependenciesunchanged. PR2/PR3remainDraft/unmerged. Nextgenerationneedsnewexplicitapproval; Drive/Cloudexternalgatesunchanged.

## 2026-10-11 — guarded live Gemini result and bounded Windows startup

- Final full Node regression 217 total/216 passed/0 failed/1 Windows POSIX skip, including isolated FFmpeg/FFprobe exports; docs/PWA/secrets validation and staged diff check passed. Browser/responsive evidence remains the previous source-specific checkpoint.

- Real isolated Gemini ten ideas/one selection verified; ideas usage254/1307/1561. Expansion failed AI_REQUEST_FAILED; package/prompts unverified. No retries/billing/fallback/Ownerdatawrites; exact IDs and next bounded approval in [live report](docs/GEMINI_LIVE_RESULT_20261011_TH.md).
- Fixed EOF waits in Windows launcher/test capture and WinPS5 ExitCode handle; actual PS5/PS7 th-TH14/14 each, synthetic only.
- Added allowlisted private Gemini failure diagnostics (HTTP/transport/body/validation) with privacy/no-retry/sink-failure regressions; independent review accepted. Node targeted86/86; build/typechecks/lint passed. No UI/schema/dependencies/env/CI changes; PR2/PR3 unmerged.


## 2026-10-10 — Gemini limited pipeline and private backend setup (usage paused)

- เพิ่มexplicitselected-onlypipelinecanary/observation-onlyresume;25verifiertestsผ่าน. RoottargetedGemini/provider/Drive/cloud/presence74/74,three typechecks/full lintผ่าน;ทั้งหมดinjectedไม่live.
- เพิ่มhidden-inputWindowsDPAPI/atomicnooverwrite/privateACL/envallowlist/freshcanary/PID+healthlauncherและคู่มือThai;independentreviewปิดP1/P2,WindowsPowerShell5 th-TH14checksผ่าน; PS7prepatch9/10timestampfailureและpostpatchยังรอตรวจ. แก้idempotentACL/firstNode/invarianttypedtimestamp/boundednetstat;independentreviewยอมรับ.
- ตรวจOwner3006/publicAPI/anonymousdenialและread-onlydata preservationผ่าน;PremiumUI/server/schema/dependenciesคงเดิม,main/PR2/PR3ยังunmerged.
- PrivateGeminiKey+OwnerFreeTierconfirmation/OAuth/cloudexternalgatesยังรอ ไม่มีbilling/livecalls/publicdeploy/contentpublish.
- Authoritativeusageเหลือ3%/26% จึงSTATUS:PAUSED_FOR_USAGE_RESET; checkpoint/essentialchecksแล้วหยุด ไม่มีautomaticresume/resetcredituse. ExactNEXT_TASKอยู่HANDOFF.


## 2026-10-10 — Verified release and Phase2 checkpoint

- แก้Drivehelp/dialogcontrast/mobileeditorfocusด้วยPremiumCinematicV2tokens;backend/schema/dependenciesคงเดิม.
- RC regression144pass/1skip;Phase2203pass/1skip. Build/typecheck/full lintผ่าน;syntheticNodecoverageแยกจากliveproof.
- ActualRC14targetedcasesและPhase2latest12dialogsผ่าน;ไฟล์modal-focus.jsรันจริง12/12ทั้งสองสาขา. PreviousPhase2matrix36/36ผูกsource86dbbb5.
- MP4ใหม่4.021333s/122601bytesผ่านFFprobeและChrome playback + HTTP download/hash. Ownerdataread-onlybaselinepreserved.
- เพิ่มGemini/Googlekeyguard;syntheticnegativeสองกรณี+cleanpositiveผ่าน ไม่มีvalueprinted. Independentread-onlyreviewยอมรับ.
- PublishedAntigravityPASSผูกpre-patch3e9c1aa;currentdeltaส่งhandoffเพื่อreview ไม่claimretest.
- usage ที่ตรวจจากบัญชีล่าสุดเหลือ 45% ในรอบ 5 ชั่วโมง และ 32% ในรอบสัปดาห์ ยังไม่ถึงเกณฑ์หยุด 7%; main/deployยังไม่อนุมัติ. PrivateGeminiFreeTier/OAuth/cloudgatesยังคงอยู่.

## 2026-10-10 — Explicit resume and Phase2 preparation

- Owner proceed resumed work only after authoritative remaining100%/41%; latest73%/37%, above stop threshold.
- Restored Owner3006 on reviewed RC code with original data, Mock only and no OpenAI credential passed to its child; read-only preservation passed.
- Prepared stacked Draft PR#3 targeting release/v1-real-world; PR#2/main remain unmerged.
- Phase2 source86dbbb5 adds bounded one-request Gemini canary/resume, pure worker presence/reconnect and scoped Drive guide block layout; independent reviews accepted.
- Full204 tests/203 passes/1 Windows POSIX skip; build/typechecks/lint passed. All Gemini/Drive/cloud tests are injected/prepared, not live acceptance.
- Current external gates: private Gemini key + Free Tier confirmation; Drive OAuth/consent; approved Supabase/HTTPS host/schema. OpenAI requires new explicit approval.



## 2026-10-10 — Usage safety checkpoint

- STATUS: PAUSED_FOR_USAGE_RESET; authoritative remaining1% after checkpoint began at7%. No new features/agents or automatic resume.
- Published Antigravity QA ddccf9c/PASS on source3e9c1aa integrated as evidence; RC ready for Owner approval, main/deploy unchanged.
- Final regression 180total/179pass/0fail/1POSIXskip; Owner data preserved.
- Gemini limited to confirmed Free Tier Flash-Lite for both jobs; OpenAI requests gated by new Owner approval. Quota stops without paid fallback. Targeted TH/EN copy corrected.
- Exact NEXT_TASK and external credential/authorization gates recorded in HANDOFF; safe checkpoint only.

## 2026-10-10 — Phase2 prepared integrations

- Added official Gemini text adapter, explicit Owner provider choice, normalized reported usage and verified-rate cost estimates; no paid retries or live success claim.
- Added explicit normal-auth tiny Drive canary verifier; preserves local media and reports restoration untested rather than evicting cache.
- Fixed independent-review Cloud provider switching risk with fail-closed lock and localized UI/error; preserved local React/Vite/Express/SQLite/FFmpeg and PremiumV2.
- Full regressions177total/176pass/0fail/1Windows skip, build/typechecks/lint/PWA passed. OAuth/key/cloud approvals remain external gates.

## 2026-10-10 — Final release review

- Reran release3e9c1aa regressions:145total/144pass/0fail/1WindowsPOSIXskip, typecheck/lint/build/PWA passed.
- Verified fresh synthetic H.264/AAC MP4 with FFprobe and actual Chrome playback; preserved Owner database/media via read-only inspection.
- Recorded Owner-reported Antigravity approval readiness separately from missing final evidence. PR2 remains draft/main unmerged; Phase2 work uses a separate branch.

## 2026-10-10 — V1 Release Candidate

- Published release checkpoint8434c84 normally with verified remote SHA; [Draft PR#2](https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/2) targets main and remains draft/unmerged. Final documentation commits preserve verified sourceb271855.

- Final source b271855: full145tests/144passes/1Windows skip; build/lint/typechecks/PWA and48viewport cases passed.
- Fixed recovered polling alert without hiding owner-command failure; retained reproducible browser regression. Restored tablet nav icons and mobile focused headings with scopedCSS.
- Actual live OpenAI one-call diagnosis still429/insufficient_quota; no retry, key leak, billing or Owner data mutation.
- Added current readiness/QA evidence, original-owner restart guide and actual-release Antigravity visual handoff.

- Preserved Premium Cinematic V2 and React/Vite + Express/SQLite; no rewrite/migration/reset.
- Diagnosed actual quota-failed Ideas history; backed up original data and recovered 10 labelled Mock concepts while preserving account/session/media/schema/history.
- Added persisted explicit AI mode/provenance, job cancel/progress/deadlines/restart/manual retry and late completion fencing.
- Added variable-duration scenes, continuity/reference-enriched English Flow prompts + Thai explanations, scene production state, verified owner-configured credit estimates and confirmed clip matching.
- Added private audio/images and deterministic editor ordering,720p/1080p,cut/fade,normalization/music/SFX/subtitles,preview/export settings.
- Added six-category Drive preparation, owner/project private media index, verified/idempotent transfers/progress/retry and missing-cache restore without local deletion; live OAuth gate remains.
- Fixed request shutdown/late-Multer/filehandle races after independent review; added targeted auth/media/queue/storage regressions.
- Corrected critical TH/EN labels/form validation and360px Drive instructions overflow; retained public-shell PWA privacy.
- Verified synthetic 12-second MP4 playback/download and persistence/offline/auth; final combined checks and release publication are recorded in current status.


## 2026-10-09 — Verified UI/core integration candidate

- Integrated approved Antigravity studio UI in a dedicated branch from latest main; preserved
  original worktrees, uncommitted writer work and backend/shared/public/package files.
- Connected real project/editor/queue/selection/clip/export APIs and truthful capabilities.
  Preserved TH/EN/PWA/Mock; Flow stays the manual primary engine and planned modules stay disabled.
- Fixed modal keyboard focus/Escape/return and44px brand/project/review links. Added six
  client API regressions and a guarded isolated Mock QA launcher.
- Verified63 automated passes/1 POSIX Windows skip, typechecks/lint/build/PWA/mock HTTP smoke,
  216 responsive+6 login cases, clipboard, offline/cache/auth and a real synthetic24-second MP4.
- Recorded actual-app captures/evidence and Antigravity handoff; visual/final integration
  review and live provider/storage/cloud acceptance remain pending.
- Pushed fda96d6 normally to integration/v1-ui-core and created Draft PR#1 against main;
  verified original main/design remote SHAs unchanged. No force push or merge occurred.

## 2026-10-09 — Parallel backend/core integration checkpoint

- Preserved the existing React/Express/SQLite/auth/queue/FFmpeg stack and Antigravity's UX/UI ownership.
- Added labelled TH/EN Mock AI, selected-only expansion, controlled explicit auto fallback,
  safe error boundaries and fail-closed malformed provider modes without new live API calls.
- Added private Drive OAuth PKCE/session state, encrypted owner token vault,128MiB multipart/
  resumable backups, private owner-marker downloads, exact endpoints and bounded errors.
- Added opt-in Supabase snapshot/queue gateway with preferred secret-key support, owner/revision
  checks, fenced leased runner and review-only private-schema SQL; no real migration/deployment.
- Wired compatible authenticated capability/Drive/cloud APIs, cloud AI worker and explicit
  cloud export gate while media indexing/Local Worker pairing remain pending.
- Reviewed isolated Sol High core/cloud and Luna provider/test/documentation worktrees.
  Independent QA findings were fixed before integration; no frontend/design/lock/env edits.
- Integrated tests passed57, skipped1 POSIX-only test on Windows; build/typecheck, lint and PWA
  passed. Temporary PostgreSQL verified6 SQL groups, compiled mock HTTP smoke passed. Hosted
  PostgREST/multi-host concurrency, actual OAuth/Drive and host permissions remain separate gates.
- Updated architecture, stable API contract and core/Drive/cloud operations handoff. App-specific
  Supabase credentials, Google owner consent, approved cutover/hosting and API credits are pending.
- Anchored runtime storage ignore to /storage/ so server/storage source is committed; extended
  staged secret checks to Supabase/Google/vault keys without printing values.
- Passed25-document/link validation and100-file secret/ignore validation. Cloud fixture
  adjustment passed14/14 focused tests; compiled backend health was checked on3001.
- Pushed core commit2d112dc normally to the existing GitHub origin/main and verified its SHA.
  The separate Antigravity design branch stayed unchanged; no force push or remote creation.

## 2026-10-09 — UX/UI design handoff

- Delivered a premium cinematic dark studio system and 15-screen synthetic interactive reference.
- Defined exact UI/component/API mappings, 360/768/1440 layouts, lightweight motion and
  independent TH/EN UI plus TH/EN/TH+EN content display.
- Specified manual Flow plan review, unknown credits and Drive as the future primary-media
  destination without fabricating integrations, approval records, worker health or paid jobs.
- Reviewed isolated design/spec/mobile QA output and completed270 browser layout measurements.
  Exercised keyboard tabs/modal focus and preserved sample selection/drafts across locale changes.
- Added four design screenshots, recorded measurement boundaries, and the pending production
  visual QA checklist. Clipboard feedback was observed; payload read-back remains unverified.
- Set ANTIGRAVITY_STATUS: DESIGN_READY_FOR_CODEX and made client design implementation ready.
- Passed scoped syntax/ESLint,22-document/link validation and preview allowlist HTTP probes;
  independent final review reported no actionable issues.
- Preserved production source, API/schema/contracts, packages/lockfile, environment and real data.
  No live AI/Flow/Drive action occurred; API quota and creative acceptance remain separate gates.

## 2026-10-08 — Phase 1 local checkpoint

- Integrated isolated Core/Web/QA output into a runnable React/Express/SQLite local app.
- Added first owner setup, scrypt login, sessions/CSRF, ownership, durable queue and recovery.
- Added ten ideas/one selection/selected expansion, four bibles, scenes and Flow prompt pack.
- Added validated private clip import, normalized FFmpeg MP4 assembly, preview and export.
- Added TH/EN responsive UI and versioned public-only PWA assets; kept secondary modules planned.
- Protected the workspace under XAMPP htdocs with a verified Apache deny rule; isolated
  source/Git/test-database probes returned403 without changing global server configuration.
- Fixed review findings for auth throttling, selected-only AI inputs and username normalization.
- Mapped real quota failures to safe localized errors without automatic retry or secret disclosure.
- Passed14 regression tests, lint, full typecheck/build, PWA/docs/secrets checks and browser
  locale/responsive/offline/logout checks. Media evidence uses synthetic clips.
- Added README/operations and updated stable Antigravity handoff. Live text generation is
  blocked by insufficient_quota; approved design, visual QA and actual Flow clips remain pending.
- Committed a local checkpoint; no Git remote or external resource was created.

## 2026-10-08 — Phase 0 definition

- Initialized local Git and protected secrets, media, databases and worktrees with ignore rules.
- Defined Story Factory V1, secondary extension boundaries and local architecture.
- Added governance, product/UX/security/i18n/API documentation and Antigravity handoff.
- Recorded runtime discovery and approved environment-key reuse; application validation pending.
- Validated all 17 required artifacts, ignore rules and tracked secrets; independent QA accepted
  definitions after clarifying immediate session/CSRF issuance on owner setup.
