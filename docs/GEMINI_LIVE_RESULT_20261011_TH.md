# ผลทดสอบ Gemini จริง — 2026-10-11

STATUS: LIVE_IDEAS_VERIFIED_EXPANSION_BLOCKED

ล่าสุดหลัง Owner เลือก Mock: ยังไม่อนุมัติ Gemini request เพิ่ม Checkpoint offline ส่ง 0 live requests และเพิ่ม parsing/invalid-field diagnostics สำหรับอนาคตโดยไม่ restart runtime หรือเปลี่ยน payload ดู [ผลวิเคราะห์ HTTP400](GEMINI_HTTP400_OFFLINE_REVIEW_TH.md) ผล live ต่อไปนี้เป็นประวัติที่ยังไม่ถูกทดสอบซ้ำ

## Retry ที่ Owner อนุมัติ — ผล live ล่าสุด (ประวัติ)

Owner อนุมัติ expansion เพิ่ม **หนึ่งครั้งด้วย Free Tier**. ใช้สิทธิ์ครบแล้ว ไม่มี generation request เพิ่มหลัง failure. Free Tier/Billing disabled เป็น Owner attestation; ไม่มี billing telemetry หรือการเปิด Billing/เปลี่ยน Paid/OpenAI/Mock.

| ขั้นตอน | ผลจริง |
| --- | --- |
| Consistent backup + idle/schema check | VERIFIED ก่อน restart isolated3013ด้วย bf276fb; accounts/ideas/selection/history เดิมยังอยู่ |
| Retry endpoint | POST /api/jobs/59245471-320e-4834-aa24-5e20ea1497a6/retry หนึ่งครั้งผ่าน normal canary session/CSRF |
| Job ใหม่ | 599d80d9-7412-466f-9600-a0e62485e1e6; queued → running15 → failed15 / AI_REQUEST_FAILED |
| Private diagnostic | HTTP400 / phase=http / 2026-10-11T01:42:47.427Z; providerStatus/reason ไม่ได้เก็บ |
| Ten ideas / one selection / original jobs | VERIFIED ยังคงเดิม; read-onlyพบ3jobs/0active ไม่ได้ generateideasใหม่ |
| Logout | VERIFIED APIตอบok:true; helperไม่รายงานสำเร็จถ้าlogoutล้มเหลว |
| Live package / scenes / Flow prompts | BLOCKED ยังไม่มี package; ไม่มี expansion usage receipt |
| Owner3006 / original database / media | VERIFIED HTTP200/read-onlybaselinepreserved; RC/Mock/PremiumUIเดิม |

Project cc629e54-668e-4ff1-82fe-c5904b4edbcc ใช้ storage/gemini-canary-4XXQbi เดิม. Isolated PID17440 เป็น observation ณ checkpoint; Owner PID14548ไม่ถูกหยุดหรือrestart. รวม live generation attempts สองรอบเป็น ideas1 + expansionเดิม1 + approvedretry1. Receiptที่มีเพียง ideas: **254 input / 1307 output / 1561 total**. ไม่มี expansion receiptจึงไม่สมมติ token/cost=0.

หลักฐาน privateอยู่ใน .tmp/gemini-private/approved-expansion-retry-20261011.*: consistentbackup/preflight/exclusiveattemptmarker/result/diagnostic และ auth/keyDPAPI แยกต่างหาก. ห้าม commit/print backup/credentials/rawlogs หรือ reset marker. Resume/retry helpers ครั้งนี้ถูกใช้ไปแล้วและจะปฏิเสธ rerun; verifierเดิมปฏิเสธหลาย expansionjobs จึงต้องอ่านสถานะ/ประวัติอย่างปลอดภัยโดยไม่ POST เพิ่ม.

### Diagnostics และการตรวจ offline

HTTP400เพียงอย่างเดียวแยก INVALID_ARGUMENT กับ FAILED_PRECONDITION ไม่ได้ตาม [Google API errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors). ยังไม่ยืนยัน schema complexity/quota/region; HTTP status ของ expansionรอบแรกยังunknown. ตรวจ outgoing schemaแบบ injected: ideas689bytes/23nodes/depth8; expansion2281bytes/64nodes/depth8. ใช้ constraints ที่เอกสาร [structured output](https://ai.google.dev/gemini-api/docs/structured-output) รองรับ; schemaใหญ่หรือซับซ้อนอาจถูกปฏิเสธแต่ยังเป็น hypothesis. จึงไม่เปลี่ยน schema/token budget/modelจากการคาดเดา.

เพิ่ม server-only providerStatus ผ่าน exactallowlist และ SCHEMA_COMPLEXITY เฉพาะ canonical bounded provider complaintที่มี INVALID_ARGUMENT. เก็บ enumเท่านั้น ไม่เก็บ actualmessage/metadata/key/header/prompt/stack; malformedstatus/detailsไม่ทำให้ข้อมูลprivateออกlog. Request/retries/fallback/publicerrorเดิมคงอยู่. Codeนี้เป็น preparationสำหรับคำขออนาคต; PID17440ยังโหลด bf276fbก่อน delta จึงกู้ statusย้อนหลังไม่ได้.

Independent review source: READY/noP1P2. Targeted Node **54/54** injected/syntheticผ่านใน11.761s; build/สามtypechecks/lintผ่าน. Retry helper offline **11/11** ผ่านก่อนใช้จริง; ไม่ใช่providerproof. Full217/216pass/0fail/1WindowsPOSIXskipพร้อมFFmpeg/FFprobeผูกcheckpointbf276fb; ไม่ได้rerunfullsuite/browser/responsive/MP4สำหรับ diagnostics delta. Premium bundlesยัง index-Cx75inse.css/index-Lz5dMZN5.js, PWA9publicassets; ไม่มี UI/schema/env/dependency/CI change.

### ขั้นตอนต่อไป

หยุด generation ไว้ตามสิทธิ์ที่ใช้ครบแล้ว. หาก Ownerอนุมัติคำขอเพิ่มในภายหลัง ให้ใช้ canary/selectionเดิมและใหม่source diagnosticsหลังbackup/idle/schema/historycheck; จำกัดจำนวนที่อนุมัติด้วย markerใหม่ ไม่ลบ markerเก่าและไม่ reuse helperที่ใช้แล้ว. Owner3006 activationยังรอ isolated selected-onlypipelineผ่านโดยรักษา savedMock/data. Driveยังต้องOAuth/consentและliveupload/download/approvedrestore; Cloudยังต้องapprovedSupabase/HTTPS/schema/deploy/disconnectednotebookproof. PR2/PR3คงDraft/unmerged; GoogleFlowเป็นprimaryassistedvideo.

---

## รอบแรก — หลักฐาน historical ก่อน Owner อนุมัติ retry

ข้อความและคำแนะนำรอบแรกด้านล่างเป็นประวัติ; approval/retryหนึ่งครั้งที่เคยรอได้รับและใช้แล้วตามผลล่าสุดด้านบน. PID7552และสถานะรอretryเดิมไม่ใช่สถานะปัจจุบัน.

ทดสอบหนึ่งรอบตามที่ Owner อนุญาต หลังพบ configuration แบบ Windows DPAPI พร้อมคำยืนยัน Free Tier/Billing disabled และ ACL เฉพาะผู้ใช้ปัจจุบัน. คำยืนยันนี้มาจาก Owner; โปรแกรมไม่ได้ตรวจสถานะ billing ผ่าน API. ไม่มีการเปิด Billing หรือสลับไป Paid Tier/OpenAI/Mock.

## ผลจริง

| ขั้นตอน | ผล | หลักฐาน |
| --- | --- | --- |
| Backend Gemini บน loopback 3013 | VERIFIED | process 7552; storage ใหม่แยกจาก Owner; ไม่มี OpenAI/cloud credentials ใน child |
| Normal account setup/login/CSRF | VERIFIED | บัญชี canary ใหม่ผ่าน API ปกติ; ไม่มีการอ่านหรือปลอม session ของ Owner |
| สร้าง 10 ไอเดียไทย/อังกฤษ | VERIFIED | ideas job completed; verifierตรวจสิบ concepts ก่อนส่งคำขอเลือก; usage receipt เป็น Gemini Flash-Lite |
| เลือกหนึ่งไอเดีย | VERIFIED | full project GET ยืนยันเลือกตรงหนึ่งในสิบไอเดีย |
| ขยายเรื่องที่เลือก | BLOCKED | expand job failed ที่ progress 15 ด้วย AI_REQUEST_FAILED |
| Bibles/scenes/Thai explanations/English Flow prompts จาก AI จริง | BLOCKED | package ยังไม่มี; ไม่รายงานผล Mock เป็น live |
| Owner app 3006 / Premium Cinematic V2 / ข้อมูลเดิม | VERIFIED | HTTP200; read-only preservation ผ่าน; 1 owner/1 project/4 jobs/10 cached Mock ideas/0 active jobs |

Usage ที่มีหลักฐานจริงสำหรับ ideas: input **254**, output **1,307**, total **1,561 tokens**. ไม่มี receipt สำหรับ expansion จึงไม่สมมติ token/cost เป็นศูนย์. ค่าใช้จ่ายจริงและ quota ที่เหลือยังไม่มี billing telemetry.

Canary project: `cc629e54-668e-4ff1-82fe-c5904b4edbcc`.
Ideas job: `3ddfc8e6-d53d-4472-8e0b-503aa2e1a57c`.
Expansion job: `59245471-320e-4834-aa24-5e20ea1497a6`.
Storage: `storage/gemini-canary-4XXQbi` ใน Phase2 worktree. รักษา failed job/สิบไอเดีย/selection และ credentials canary แบบ DPAPI ใน private directory เพื่อวิเคราะห์ต่อ.

ส่ง ideas และ expansion อย่างละหนึ่งคำขอเท่านั้น; ไม่ retry, regenerate, cancel, delete หรือเปลี่ยน provider หลัง failure. การตรวจภายหลังใช้ normal login + GET + logout และไม่มี generation request. Owner story เดิมไม่ได้ถูกเลือกหรือขยาย.

## ข้อผิดพลาดและการแก้ที่ตรวจแล้ว

`AI_REQUEST_FAILED` เดิมรวมทั้ง network และ HTTP failures; HTTP status/reason ของ failure นี้ไม่ได้ถูกเก็บ จึงยังระบุไม่ได้ว่าเป็น HTTP400/500/network และยังไม่มีหลักฐานว่า quota หมด. ไม่แก้ schema หรือเปลี่ยนโมเดลจากการคาดเดา.

เพิ่ม server-only diagnostics ที่บันทึกเฉพาะ operation/model/phase/error code/HTTP status และ reason จาก allowlist ลง stderr. ไม่มี key, header, raw message/body, prompt หรือ stack. Logging failure ไม่เพิ่ม retryหรือเปลี่ยน public errors. Independent read-only review ไม่พบ P1/P2. โค้ดใหม่นี้ไม่สามารถกู้ HTTP response เดิมย้อนหลัง; runtime canary ที่ยังเปิดอยู่โหลดโค้ดก่อนเพิ่ม diagnostics.

แก้ PowerShell startup ที่รอ pipe EOF โดยไม่มี deadline: ใช้ JSON บรรทัดเดียวและ deadline แยก; tests ใช้ file capture แบบมีเวลาจำกัดและเก็บ process handle เพื่ออ่าน ExitCode บน Windows PowerShell5. รันจริงทั้ง PowerShell5 และ PowerShell7 ภายใต้ th-TH ผ่าน **14/14 ต่อ shell**, synthetic เท่านั้น ไม่มี live requests.

Regression หลังเพิ่ม diagnostics: Gemini/provider/verifier **42/42**, AI integration/usage **10/10**, Drive/cloud/presence **34/34**; รวม **86/86**, injected/synthetic. Build พร้อมสาม typechecks และ lint ผ่าน. Frontend bundles ยังเป็นไฟล์เดิม; ไม่มี src/public/shared/schema/dependencies/env/CI changes. รายละเอียดเพิ่มเติมใน PHASE2_QA.json.

Final `npm test` ของโค้ดนี้ผ่าน **217 total / 216 passed / 0 failed / 1 skipped** ใน 92.630 วินาที. กรณีที่ข้ามเป็น POSIX permission test บน Windows. รวมการทดสอบ auth/owner isolation/queue/restart และ FFmpeg/FFprobe MP4 ในฐานข้อมูล/สื่อสังเคราะห์; ไม่ใช่ live Flow/Drive/Cloud. `validate:docs`, `validate:pwa`, `validate:secrets` และ staged diff check ผ่าน. Browser playback/responsive ไม่ได้รันซ้ำใน checkpoint นี้; UI ไม่เปลี่ยนและหลักฐานเก่าระบุ source SHA แยกไว้.

## ขั้นตอนต่อไป

รอ Owner อนุมัติ **retry เฉพาะ expansion อีกหนึ่งครั้งด้วย Gemini Free Tier** เนื่องจากสิทธิ์ทดสอบหนึ่งรอบสอง generation attempts ใช้ครบแล้ว. ก่อน retry ให้เปิด isolated runtime ด้วย source ที่มี diagnostics และ **storage canary เดิม** หลังตรวจไม่มี active jobs/backup/schema compatibility; ใช้บัญชี canary ผ่าน normal API. ห้ามใช้ Start ที่สร้าง storage ใหม่เพื่อ regenerate สิบไอเดีย. Retry เพียงงาน expansion เดิมแล้วอ่านผล; ถ้าล้มเหลวอีกให้หยุดพร้อม diagnostic ห้าม automatic retries หรือ paid fallback.

Owner3006ยังใช้ RC/Mock. เปิด Gemini ใน Owner app หลัง isolated full pipeline ผ่านและตรวจ backup/0 active jobs/schema; รักษา saved Mock mode/บัญชี/โครงการ/คลิป แล้วให้ Ownerเลือก providerผ่าน Settings. PR #2/#3 ยังไม่ merge และไม่มี production deployment/content publishing.

Drive OAuth/consent/live upload-download-restore ยังต้อง Owner. Cloud ต้อง approved Supabase project/HTTPS host/schema/deployment และ disconnected-notebook acceptance; ยังไม่รายงาน notebook-offline ว่าทำงานได้. Google Flow ยังคง primary video แบบ assisted production.

ข้อมูลโมเดลและเงื่อนไข Free Tier: [Gemini Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [ราคา](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), [Billing](https://ai.google.dev/gemini-api/docs/billing). การมีโมเดลใน Free Tier ไม่พิสูจน์ billing tier ของ API project โดยตัวโปรแกรม.
