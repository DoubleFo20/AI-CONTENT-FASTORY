# เปิด Local V1 ด้วยข้อมูล Owner เดิม

วันที่: 2026-10-10 (Asia/Bangkok)

แอป candidate เปิดอยู่ที่ `http://127.0.0.1:3006` ให้เข้าสู่ระบบด้วยบัญชีเดิม โปรเจกต์ที่กู้แล้วมี 10 Mock ideas; เลือกและบันทึกหนึ่งไอเดีย → ขยายเรื่อง → ตรวจ bibles/scenes/prompts → สร้างคลิปใน Google Flow เอง → import → ตั้ง editor → export → preview/download. การเปลี่ยน mode ไม่สร้างงานและไม่แปลง cached Mock outputเป็น real.

## คงที่เก็บข้อมูลเดิมเมื่อเปิดใหม่

Current worktree: `D:\xampp\htdocs\Ai-content-factory\.worktrees\release-v1`.
Actual populated storage: `D:\xampp\htdocs\Ai-content-factory-premium-v2\storage`.
Backup ที่ integrity_check ผ่าน: ignored `.tmp/owner-backup-j6CByS/factory.sqlite`. สำรองนี้ไม่ถูกส่งไป GitHub.

Root storage และ default storage ของ worktreeใหม่ไม่ใช่ฐาน Owner ชุดนี้. อย่ารัน first-owner setup/reset หากหน้าจอแสดงว่าไม่พบบัญชี ให้หยุดตรวจ ACF_DATA_DIR แทน. ไม่ต้องคัดลอก/ย้าย/ลบฐานหรือ media.

ก่อนเปิดใหม่ตรวจว่าพอร์ต3006ไม่ถูกใช้งาน ถ้ายังเปิดแอปเดิมอยู่ให้ใช้แอปนั้น. รอให้งานเสร็จหรือ cancel ผ่าน UI ก่อน shutdown/restart. ตรวจ processปัจจุบันจาก private `.tmp/release-owner-process.json` และ listener; PID14516เป็นค่าขณะ checkpointเท่านั้น.

จาก release worktree หลัง build พร้อมและ instanceเดิมปิดแล้ว ให้ตั้งค่าที่ไม่ใช่ความลับดังนี้ แล้วเปิดตามปกติ:

```powershell
$env:ACF_HOST='127.0.0.1'
$env:ACF_PORT='3006'
$env:ACF_DATA_DIR='D:\xampp\htdocs\Ai-content-factory-premium-v2\storage'
$env:ACF_ALLOWED_ORIGINS='http://127.0.0.1:3006,http://localhost:3006'
npm.cmd start
```

ใช้ process environmentเดิมสำหรับ key ที่ Ownerอนุมัติ ไม่ใส่ secretในคำสั่ง/source/chat/VITE_* หรือ GitHub. Persisted private AI modeยังเป็นMock; existing pending paid jobsหลังrestartไม่ถูก replay. หน้าจอที่เปิดค้างก่อนอัปเดตควร reloadเพื่อรับ bundleล่าสุด.

ตรวจ `/api/health` ต้อง200; `/api/auth/status` ต้อง setupRequired=falseสำหรับฐานนี้ และ anonymous `/api/projects` ต้อง401/no-store. Login/session/ข้อมูล Ownerไม่ได้เป็น public PWA cache. เก็บสำรองและ token-encryption keyแยกในช่องทางprivate ไม่ลบlocal sourceจน verifiedremoteuploadและได้รับอนุมัติ.

## เปิด integration จริงภายหลัง

OpenAI live diagnosticล่าสุดตอบ429/insufficient_quota. Ownerตรวจ [Billing](https://platform.openai.com/settings/organization/billing) และ [Limits](https://platform.openai.com/settings/organization/limits) เอง; ยอดเครดิตและเพดานจริงยังไม่ถูกตรวจ ไม่มีการซื้อเครดิต. หลังแก้จึงใช้ Real modeและcanaryในโปรเจกต์ใหม่ เพื่อไม่ regenerate cachedMock10concepts.

Driveต้องตั้ง server-onlyOAuthค่าที่ [คู่มือDrive](../DRIVE_STORAGE.md) แล้วrestartอย่างปลอดภัยและ consentด้วยOwner; callbackจริงต้องตรง `http://127.0.0.1:3006/api/integrations/drive/callback`. เริ่มตรวจsmall-filechecksum upload/download/restoreก่อนตัดสินใจDrive-primary.

Cloud/mobileขณะ notebookofflineยังไม่พร้อม ต้องมีOwner-approved host/Supabase/HTTPS/schema/pairedworkerและtestจริง. Local3006 bindloopbackเท่านั้น ไม่มีการเปิดdev APIสาธารณะหรืออ้างว่าCodexจะทำงานต่อหลังจบsession.

ดู [readiness matrix](V1_READINESS.md), [QA record](QA_RESULTS.json) และ [external gates](EXTERNAL_INTEGRATIONS.md).
