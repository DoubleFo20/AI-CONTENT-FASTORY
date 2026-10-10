# V1 Release Candidate — สถานะสำหรับการใช้งานจริง

วันที่: 2026-10-10 (Asia/Bangkok) · branch `release/v1-real-world`

React/Vite + Express/SQLite/FFmpeg และ Premium Cinematic V2 เป็นฐานเดิมของ release นี้ ไม่มีการย้าย schema หรือสร้างแอปใหม่ บัญชี โปรเจกต์ ประวัติงาน และสื่อเดิมถูกเก็บไว้

| ความสามารถ | สถานะ | หลักฐาน / ขอบเขต |
| --- | --- | --- |
| Owner login, session, project persistence และ owner isolation | VERIFIED | ทดสอบ API และ browser; logout ปิดสิทธิ์ project/clip/export/audio/image ด้วย 401 และ no-store |
| สร้าง 10 ไอเดีย → บันทึกหนึ่งไอเดีย → ขยายเฉพาะที่บันทึก → 4 bibles → scenes/prompts | MOCK_ONLY | Workflow ผ่านด้วย Mock ที่แสดงแหล่งกำเนิดชัดเจน; ไม่ใช่ live text generation |
| กู้โปรเจกต์ Owner ที่ไม่แสดงไอเดีย | VERIFIED | สำรอง SQLite แบบ consistent + integrity_check ก่อนกู้; ได้ 10 Mock ideas, completed 100%, ไม่มี active job; บัญชี/session/media/schema และ 3 quota-failed jobs เดิมยังอยู่ |
| Retry/Cancel, progress, restart interruption และ late-result fencing | VERIFIED | regression tests แบบ isolated; ไม่ replay paid AI โดยอัตโนมัติ |
| OpenAI real text adapter | BLOCKED | Live diagnosticหนึ่งคำขอเมื่อ2026-10-10 ได้ HTTP429/insufficient_quota → AI_QUOTA_EXCEEDED; ไม่มี retry/billing change หรือ successful live generation |
| Gemini text adapter | NOT_IMPLEMENTED | ไม่มี Gemini credential ที่ได้รับอนุญาต; ไม่ได้สร้าง/ซื้อ key หรือเปิด billing |
| Google Flow assisted production | PREPARED | English prompts + Thai explanations, reference/scene IDs, duration/ratio, copy/download, per-scene status, filename matching และ missing-clip checks ผ่าน; ยังไม่ได้ทดสอบบัญชี/คลิป Flow จริง |
| Flow direct API / automatic credit consumption | NOT_IMPLEMENTED | ไม่พบ authorized documented account integration; ไม่ invent endpoint หรือ automate authentication |
| Flow credit estimates | VERIFIED | คำนวณจาก rate ที่ Owner กรอกและยืนยันเอง; QA ใช้ rate สังเคราะห์ ไม่ใช่ราคา Flow ปัจจุบันหรือการใช้เครดิตจริง |
| Clip/audio/image import และ Auto Editor | VERIFIED | ใช้ไฟล์สังเคราะห์จริง + FFprobe; จัดฉาก เสียง/music/SFX normalization, cut/fade, TH/EN subtitles, 720p/1080p และ ratio settings |
| MP4 preview/play/download และ reopen | VERIFIED | Browser เล่นและดาวน์โหลด H.264 720×1280, yuv420p + AAC 48kHz stereo, 12.021029 วินาที; order/settings/media อยู่ครบหลัง server/browser restart |
| Google Drive folders/index/manual upload/verified restore | PREPARED | owner/project-bound private sidecar, 6 categories, checksums/progress/idempotency/interrupt/retry/restore ผ่าน fake-adapter tests; ยังไม่มี OAuth/live round trip |
| Google Drive ใช้จริงเป็น primary media | BLOCKED | ต้อง OAuth consent และตรวจ upload/download/restore จริง; local source ไม่ถูกลบและไม่มี automatic cutover |
| TH/EN, 360/768/1440px และ public-shell PWA | VERIFIED | 48 route×locale×viewport cases + retakesหลังDrive wrap/tableticons/mobileheader/pollrecovery ผ่าน; cache9 public assets/0 private API และ offline/reconnect เฉพาะlocalPWA ไม่ใช่physical-phoneหรือcloud-offlineproof |
| Supabase/cloud control-plane foundation | PREPARED | opt-in adapter, durable queue/lease contracts และ review-only SQL; ไม่มี hosted deployment/schema migration |
| Mobile สั่ง cloud job ขณะ notebook offline | BLOCKED | ยังไม่มี approved HTTPS host/Supabase deployment และ disconnected-notebook acceptance |
| Paired Local Worker และ WAITING_FOR_WORKER cloud bridge | NOT_IMPLEMENTED | ไม่มี worker enrollment/heartbeat/media bridge จริง; cloud export ยังคงปฏิเสธ CLIPS_REQUIRED อย่างชัดเจน |
| Full unattended production / Meta AI supporting integration | NOT_IMPLEMENTED | ไม่แสดงเป็นความสามารถที่พร้อมใช้; final content ไม่ถูก publish อัตโนมัติ |

## สิ่งที่ Owner ต้องทำ

1. ใช้บัญชีเดิมใน local Release Candidate เลือกหนึ่งไอเดีย แล้วขยายเรื่องใน Mock หรือเปลี่ยน Real Mode หลังแก้ quota ของ OpenAI project โดยไม่ส่ง key ใน chat
2. ตรวจและสร้างคลิปด้วย Google Flow เอง; ตั้ง credit rate/model/duration/budget จากข้อมูลบัญชีที่ตรวจจริงก่อนใช้งาน การคำนวณในแอปไม่หักเครดิต
3. ตั้ง OAuth ผ่าน private environment manager และ consent ตาม [คู่มือ Drive](../DRIVE_STORAGE.md) แล้วตรวจ small-file round trip ก่อนใช้เก็บ media จริง
4. เลือกและอนุมัติ host/Supabase project/schema สำหรับ cloud แยกจาก local lane; ยังไม่ deploy หรือเปลี่ยนข้อมูลเดิมเพียงเพราะมี SQL draft

## ขอบเขต release

ใช้เป็น local V1 ได้ด้วย Mock text หรือ real text เมื่อ quota พร้อม พร้อมคลิปที่ Owner นำเข้าเอง การทดสอบ MP4 ใช้สื่อสังเคราะห์ ไม่ใช่หลักฐาน live Flow/Drive/cloud. ต้องให้ Antigravity ตรวจ UI ที่รวมแล้ว และ final integration review ก่อน merge `main` ดู [visual QA handoff](../ANTIGRAVITY_VISUAL_QA_HANDOFF.md)

Drive จำกัดไฟล์ที่โอนผ่าน adapter ปัจจุบันที่ 128 MiB; ไฟล์ใหญ่เกินนั้นยังใช้/ดาวน์โหลด local ได้ การ transition เป็น fade-in/out ที่รักษาความยาวฉาก ไม่ใช่ motion หรือ generative editing. ดูสัญญาปัจจุบันใน [API contract](../API_CONTRACT.md)

## หลักฐานและคำสั่งที่รันจริง

Source checkpoint: `b271855dfa535bf4a1b18afef5917f8b1280c925`. ดู [QA record](QA_RESULTS.json) และ [คู่มือข้อมูลOwnerเดิม](LOCAL_OWNER_RUN.md). `npm.cmd test`145total/144pass/0fail/1WindowsPOSIXskip; `npm.cmd run lint`, `npm.cmd run build` (3typechecks), `validate:pwa`, `validate:docs`, `validate:secrets` และ staged diff-check ผ่าน. Browserregression `tests/browser/network-recovery.js` ผ่านด้วยPlaywrightCLIแยกจาก145Nodecases; จะเกิดคำขอที่ถูกinterceptเฉพาะfixtureQA ไม่มีjob/datawrites.

VERIFIED หมายถึงขอบเขตที่ทดสอบจริง; MOCK_ONLY คือworkflowด้วยsynthetictext; PREPARED คือsource/injectedtestsพร้อมแต่ยังไม่มีliveproof; BLOCKED ต้องexternalOwnerinput; NOT_IMPLEMENTED ยังไม่มีเส้นทางทำงานจริง. แหล่งกำเนิดtext, media และบริการแต่ละตัวต้องแยกกันเสมอ.
