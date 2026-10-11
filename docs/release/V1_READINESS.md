# V1 Release Candidate — สถานะสำหรับการใช้งานจริง

ล่าสุด Phase2 2026-10-12: [Gemini selected expansion live verified](../GEMINI_EXPANSION_LIVE_RESULT_20261012_TH.md) จากPR3source8f95c16/implementation921ce7b ผ่าน1requestFreeTier มี3scenes/20sec/bibles/TH-EN/promptsครบ Original10ideas/selection/history/Ownerdata-mediaคงอยู่ Owner3006ยังoriginalRC/Mock/PremiumUIห้ามactivate Source-scoped offline/harness/build/lintผ่าน ไม่เรียกMockเป็นliveproof ไม่mergePR2/PR3/deploy และspecifichistoricalHTTP400parameterยังNOT_PROVEN

| ความสามารถ | สถานะล่าสุด | หลักฐาน |
| --- | --- | --- |
| Local V1 / Premium UI / Owner data | VERIFIED | Original baseline/HTTP200; no UI/schema changes |
| Story text in Owner3006 | MOCK_ONLY | Saved Mock mode preserved |
| Gemini ten real concepts + one selection | VERIFIED | One live canary; ideas receipt1561tokens |
| Gemini selected story/scenes/Flow prompts live | VERIFIED | One approved Free Tier text request at8f95c16; 3scenes/20sec/2characters/1location/2rules. Canonical assisted prompt compiler checked on real cached package. No Flow generation or Owner3006 activation. |
| Drive primary media | PREPARED | รอบนี้ Drive/cloud/worker 69 total / 68 pass / 1 Windows POSIX skip ใช้ injected transport; OAuth/live verification ยังรอ |
| Cloud foundation | PREPARED | Injected contracts; no approved deployed HTTPS/Supabase |
| Notebook-offline / full automation | NOT_IMPLEMENTED | No disconnected-device production proof |

วันที่: 2026-10-10 (Asia/Bangkok) · branch `release/v1-real-world`

React/Vite + Express/SQLite/FFmpeg และ Premium Cinematic V2 เป็นฐานเดิมของ release นี้ ไม่มีการย้าย schema หรือสร้างแอปใหม่ บัญชี โปรเจกต์ ประวัติงาน และสื่อเดิมถูกเก็บไว้

| ความสามารถ | สถานะ | หลักฐาน / ขอบเขต |
| --- | --- | --- |
| Owner login, session, project persistence และ owner isolation | VERIFIED | ทดสอบ API และ browser; logout ปิดสิทธิ์ project/clip/export/audio/image ด้วย 401 และ no-store |
| สร้าง 10 ไอเดีย → บันทึกหนึ่งไอเดีย → ขยายเฉพาะที่บันทึก → 4 bibles → scenes/prompts | MOCK_ONLY | Workflow ผ่านด้วย Mock ที่แสดงแหล่งกำเนิดชัดเจน; ไม่ใช่ live text generation |
| กู้โปรเจกต์ Owner ที่ไม่แสดงไอเดีย | VERIFIED | สำรอง SQLite แบบ consistent + integrity_check ก่อนกู้; ได้ 10 Mock ideas, completed 100%, ไม่มี active job; บัญชี/session/media/schema และ 3 quota-failed jobs เดิมยังอยู่ |
| Retry/Cancel, progress, restart interruption และ late-result fencing | VERIFIED | regression tests แบบ isolated; ไม่ replay paid AI โดยอัตโนมัติ |
| OpenAI real text adapter | BLOCKED | Historical one-call429/insufficient_quota; ล่าสุด Owner ระงับการเรียกจนมี explicit approval ใหม่ ไม่ retry/billing change |
| Gemini Free Tier text adapter / explicit canary | VERIFIED | Phase2 Draft PR#3 source8f95c16 ผ่าน selected expansion หนึ่งคำขอจาก10ideas/selectionเดิม ได้3scenes/20sec/bibles/TH-EN/promptsครบ ตรวจ AIStudio project/key FreeTier และ No billing account ก่อนส่ง พร้อม private masked-suffix comparison; ไม่มี Owner3006 activation หรือ Flow clip proof |
| Google Flow assisted production | PREPARED | English prompts + Thai explanations, reference/scene IDs, duration/ratio, copy/download, per-scene status, filename matching และ missing-clip checks ผ่าน; ยังไม่ได้ทดสอบบัญชี/คลิป Flow จริง |
| Flow direct API / automatic credit consumption | NOT_IMPLEMENTED | ไม่พบ authorized documented account integration; ไม่ invent endpoint หรือ automate authentication |
| Flow credit estimates | VERIFIED | คำนวณจาก rate ที่ Owner กรอกและยืนยันเอง; QA ใช้ rate สังเคราะห์ ไม่ใช่ราคา Flow ปัจจุบันหรือการใช้เครดิตจริง |
| Clip/audio/image import และ Auto Editor | VERIFIED | ใช้ไฟล์สังเคราะห์จริง + FFprobe; จัดฉาก เสียง/music/SFX normalization, cut/fade, TH/EN subtitles, 720p/1080p และ ratio settings |
| MP4 preview/play/download และ reopen | VERIFIED | Browser เล่นและดาวน์โหลด H.264 720×1280, yuv420p + AAC 48kHz stereo, 12.021029 วินาที; order/settings/media อยู่ครบหลัง server/browser restart |
| Google Drive folders/index/manual upload/verified restore | PREPARED | owner/project-bound private sidecar, 6 categories, checksums/progress/idempotency/interrupt/retry/restore ผ่าน fake-adapter tests; ยังไม่มี OAuth/live round trip |
| Google Drive ใช้จริงเป็น primary media | BLOCKED | ต้อง OAuth consent และตรวจ upload/download/restore จริง; local source ไม่ถูกลบและไม่มี automatic cutover |
| TH/EN, 360/768/1440px และ public-shell PWA | VERIFIED | 48 route×locale×viewport cases + retakesหลังDrive wrap/tableticons/mobileheader/pollrecovery ผ่าน; cache9 public assets/0 private API และ offline/reconnect เฉพาะlocalPWA ไม่ใช่physical-phoneหรือcloud-offlineproof |
| Supabase/cloud control-plane foundation | PREPARED | opt-in adapter, durable queue/lease contracts และ review-only SQL; ไม่มี hosted deployment/schema migration |
| Mobile สั่ง cloud job ขณะ notebook offline | NOT_IMPLEMENTED | ยังไม่มี approved HTTPS host/Supabase deployment และ disconnected-notebook acceptance |
| Paired Local Worker และ WAITING_FOR_WORKER cloud bridge | NOT_IMPLEMENTED | Phase2 pure presence/reconnect helper PREPARED; ไม่มี authenticated broker/durable presence CAS/UI/media bridge; cloud export ยังปฏิเสธ CLIPS_REQUIRED |
| Full unattended production / Meta AI supporting integration | NOT_IMPLEMENTED | ไม่แสดงเป็นความสามารถที่พร้อมใช้; final content ไม่ถูก publish อัตโนมัติ |

## สิ่งที่ Owner ต้องทำ

1. Local3006 ใช้บัญชีเดิมและ Mock ต่อได้ ผล Gemini ใน isolated canary ผ่านแล้ว ให้ตรวจบทและ prompts จากผล cached ก่อนผลิตวิดีโอ การเปิด Gemini บน Owner3006 ต้องอนุญาตขั้นถัดไปตามข้อห้ามเปลี่ยนแอปรอบนี้ งบ live ที่อนุมัติใช้ครบ1/1 ไม่มีคำขอเพิ่มโดยไม่มี approval ใหม่ และไม่ใช้ OpenAI
2. ตรวจและสร้างคลิปด้วย Google Flow เอง; ตั้ง credit rate/model/duration/budget จากข้อมูลบัญชีที่ตรวจจริงก่อนใช้งาน การคำนวณในแอปไม่หักเครดิต
3. ตั้ง OAuth ผ่าน private environment manager และ consent ตาม [คู่มือ Drive](../DRIVE_STORAGE.md) แล้วตรวจ small-file round trip ก่อนใช้เก็บ media จริง
4. เลือกและอนุมัติ host/Supabase project/schema สำหรับ cloud แยกจาก local lane; ยังไม่ deploy หรือเปลี่ยนข้อมูลเดิมเพียงเพราะมี SQL draft

## ขอบเขต release

Local3006 พร้อมใช้ด้วย Mock text และคลิปที่ Owner นำเข้าเอง; Owner3006 ยังไม่ activate Gemini ตามคำสั่งรักษาแอปเดิม Isolated Phase2 canary ผ่าน real ten ideas/one selection และ selected expansion/bibles/scenes/prompts บนsource8f95c16ด้วยหนึ่งคำขอ FreeTier ตรวจ canonical Flow compiler แบบ offline จาก real cached package แล้ว ยังไม่มีคลิป Flow ของเรื่องนี้หรือ MP4 ที่สร้างจากคลิปเหล่านั้น หลักฐาน MP4 เดิมใช้สื่อสังเคราะห์ ไม่ใช่ live Drive/cloud Antigravity published QA ddccf9c/PASS ครอบคลุม release3e9c1aa; ยังต้อง Owner approval ก่อน merge `main` ดู [visual QA handoff](../ANTIGRAVITY_VISUAL_QA_HANDOFF.md)

Drive จำกัดไฟล์ที่โอนผ่าน adapter ปัจจุบันที่ 128 MiB; ไฟล์ใหญ่เกินนั้นยังใช้/ดาวน์โหลด local ได้ การ transition เป็น fade-in/out ที่รักษาความยาวฉาก ไม่ใช่ motion หรือ generative editing. ดูสัญญาปัจจุบันใน [API contract](../API_CONTRACT.md)

## หลักฐานและคำสั่งที่รันจริง

Backend baseline: b271855; latest frontend repairs 0b35cea82d7e7867e11c653df0d6d790a6b66f19. Full145/144/0/1 atde59fe6 followed by scopedlint/build/typechecks after modal focus repair; current-source targeted browser evidence is in [Final review](FINAL_REVIEW.md). Published Antigravity PASS is pre-patch3e9c1aa. ดู [QA record](QA_RESULTS.json) และ [คู่มือข้อมูลOwnerเดิม](LOCAL_OWNER_RUN.md). `npm.cmd test`145total/144pass/0fail/1WindowsPOSIXskip; `npm.cmd run lint`, `npm.cmd run build` (3typechecks), `validate:pwa`, `validate:docs`, `validate:secrets` และ staged diff-check ผ่าน. Browserregression `tests/browser/network-recovery.js` ผ่านด้วยPlaywrightCLIแยกจาก145Nodecases; จะเกิดคำขอที่ถูกinterceptเฉพาะfixtureQA ไม่มีjob/datawrites.

VERIFIED หมายถึงขอบเขตที่ทดสอบจริง; MOCK_ONLY คือworkflowด้วยsynthetictext; PREPARED คือsource/injectedtestsพร้อมแต่ยังไม่มีliveproof; BLOCKED ต้องexternalOwnerinput; NOT_IMPLEMENTED ยังไม่มีเส้นทางทำงานจริง. แหล่งกำเนิดtext, media และบริการแต่ละตัวต้องแยกกันเสมอ.
