# ขั้นตอนผลิตวิดีโอจริงและสิทธิ์ที่ยังต้องใช้ — 2026-10-13

Local V1 ผ่านการทดสอบด้วย Mock text และ synthetic media; ยังไม่มีวิดีโอ Flow จริง
ใน Owner project งานที่ต้อง Owner ทำมีรายการเดียวด้านล่าง ไม่ต้องส่ง key/token ในแชต

## 1. เปิดแอป Owner

อนุมัติแผน [Owner3006](OWNER3006_ACTIVATION_TH.md) ก่อนเปิด pinned build จาก PR #3
ข้อมูลเดิมจะคงอยู่และเริ่มใน Mock Mode การเปิดแอปไม่ใช่การอนุมัติเรียก Gemini เพิ่ม
หลังเปิด Owner ต้อง login ด้วยรหัสผ่านเดิมและตรวจ project ของตนเอง

## 2. คลิปจริงชุดแรก 20 วินาที

มี package จาก canary Gemini ที่ทดสอบสำเร็จแล้ว 10 ไอเดีย/1 selection/3 ฉาก
ความยาว 6+6+8 วินาที การเตรียมชุดส่งต่ออ่าน cache เท่านั้น ไม่สร้าง AI ใหม่
เป็นคนละ project กับเรื่องแม่หมาป่าของ Owner; ไม่ย้ายหรือเขียนทับ project เดิม
private bundle อยู่ใต้ `.tmp/production-acceptance/` ใน integration worktree
ให้ใช้ชุดล่าสุดที่ระบุใน HANDOFF; ข้อความและ prompts ไม่ถูกส่งเข้า GitHub

- ตรวจ Story Bible/บท/ตัวละคร/สถานที่/continuity และบทสรุปก่อนผลิต
  รายละเอียดการเติมตู้ปันสุขใน Bible ยังไม่ได้แยกเป็นภาพจบต่างหากในสามฉาก
  จึงต้อง Owner ตรวจ editorial; ห้ามรายงานว่าผ่านการรับงานด้านเนื้อหาแล้ว
- เตรียม reference ภาพเดิมสำหรับตัวละครและสถานที่ พร้อมสิทธิ์ใช้งาน
  บันทึก reference ใน Production panel และแนบภาพจริงใน Flow ด้วย
  การใส่ชื่อภาพใน prompt อย่างเดียวไม่ใช่การแนบภาพหรือรับประกัน continuity
- Google Flow เป็นเครื่องมือหลักแบบ Owner ดำเนินการเอง ใช้ English prompt ในชุด
  ตรวจ model/feature/aspect ratio/ความยาวที่บัญชีใช้ได้ก่อนสร้างทุกครั้ง
  ใช้ภาพอ้างอิงซ้ำ และ start/end frame ที่ต่อกันตาม
  [คู่มือ Flow ทางการ](https://support.google.com/flow/answer/16353334?hl=en)
  และ [การจัดฉาก/บันทึก frame](https://support.google.com/flow/answer/16935718?hl=en)
- อัตราเครดิตและงบต้อง Owner ตรวจจากบัญชีและบันทึกเอง
  `rateVerifiedByOwner=false` ยังให้ค่า estimatedCredits=null; ไม่เดาราคา
  ไม่มี Flow credits ถูกใช้โดย Codex และไม่มีหลักฐานสิทธิ์ documented Flow API
  ของบัญชีนี้ จึงยังไม่เปิด direct automation หรือใช้ Veo API แทน Flow
- ดาวน์โหลดและตั้งชื่อคลิป **ตาม scene ID ใน manifest/English prompt**
  เช่น `<sceneId>.mp4` เพื่อให้ Clip Import แนะนำฉากที่ตรงกันได้
  Owner ยืนยันฉากอีกครั้ง หากฉากต้องรวมหลาย generation ให้ต่อส่วนก่อน import
- Import คลิปจริงให้ครบ ตรวจ missing clips/ฉาก/เวลา/continuity จากภาพที่ได้จริง
  เลือกเพลง/SFX ที่มีสิทธิ์ใช้ ปรับระดับเสียง ลำดับฉาก transition และ subtitle
  จากนั้น export MP4 ดูภาพ/ฟังเสียง/ดาวน์โหลด และเปิด project ใหม่ยืนยัน persistence
- หาก generation ล้มเหลว เก็บคลิปสำเร็จและบันทึก error/notes; ไม่ retry AI,
  สร้างเรื่องใหม่ หรือใช้เครดิตเพิ่มอัตโนมัติ

หากต้องสร้างเรื่องใหม่ใน Owner3006 ให้ Owner เลือก Gemini และสั่งงานอย่างชัดเจน
ใช้ Free Tier เท่านั้น การอนุมัติ canary ที่ใช้ครบแล้วไม่ครอบคลุมคำขอใหม่
Mock ยังคงเป็นตัวเลือกและผลต้องแสดงที่มาตามจริง

## 3. Google Drive — ต้องตั้ง OAuth และให้ consent

ตรวจ environment แบบ presence-only แล้วไม่พบ OAuth client, token-encryption key
หรือ callback ใน Process/User scope; ยังไม่เริ่ม OAuth หรือส่งไฟล์เข้า Google
integration มีใน source แต่สถานะจริง **PREPARED / BLOCKED_FOR_OWNER_OAUTH**
รายละเอียด implementation อยู่ใน [Drive storage](DRIVE_STORAGE.md)

1. Owner เลือก Google Cloud project ของตน เปิด Drive API และสร้าง OAuth client
   แบบ Web application ใน Google Console พร้อม consent screen/test user ตามบัญชี
   ไม่เปิด Billing หรือสร้างบริการเสียเงินเพื่อทำขั้นตอนนี้
2. ลงทะเบียน callback ตรงตัว:
   `http://127.0.0.1:3006/api/integrations/drive/callback`
   ใช้ `127.0.0.1` ใน browser ให้ตรงกับ callback และ session เดิม
3. ตั้งเฉพาะ backend process/service private environment:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
   `ACF_DRIVE_ALLOWED_REDIRECT_URIS` (callback เดียวกันทั้งสองตัว),
   `ACF_TOKEN_ENCRYPTION_KEY` (canonical Base64 ของ random 32 bytes)
   `GOOGLE_DRIVE_FOLDER_ID` เป็น optional; อย่าส่ง client secret/encryption key ในแชต
4. เก็บ encryption key ใน private credential manager และสำรองแยกจาก encrypted vault
   ใช้ key เดิมข้าม restart; ห้ามเปลี่ยน key เพื่อแก้ error เพราะจะอ่าน tokens เก่าไม่ได้
   ไม่ใส่ `VITE_` prefix ไม่เขียน secret ลง Git หรือ frontend
   Environment ที่ใช้เปิด Owner3006 ครั้งแรกยังไม่ส่ง Drive credentials
   ต้องเปิดใช้ Drive กับ backend ที่ได้รับอนุมัติในขั้นแยกหลังตั้งค่าครบ
5. Owner login แล้วกดเชื่อมต่อ Google Drive ใน Storage และให้ consent เอง
   Scope ของ implementation คือ `drive.file`; ไม่ automating Google login/consent
6. อนุมัติ canary file ขนาดเล็กหนึ่งไฟล์เพื่อทดสอบจริง:
   prepare folder → upload → download → compare bytes/MD5/SHA-256 → restore
   ให้ใช้ storage ของ canary แยกสำหรับทดสอบ missing-cache restoration
   ไม่ลบ media ของ Owner และไม่สลับ primary storage
7. บันทึก file IDs/progress/checksum/failures และตรวจ reservation เดิมก่อน retry
   หากผลคลุมเครือให้ reconcile ไม่สร้างไฟล์ซ้ำ ไม่ cleanup remote อัตโนมัติ

Root เป้าหมาย `AI-CONTENT-FACTORY/` มี AI Story, Product Review, Kids & Toy,
Investment, Shared Assets, Archives. การอัปโหลดผ่านปัจจุบันจำกัด 128 MiB ต่อไฟล์
local media ยังคงอยู่จนตรวจ remote integrity และ Owner อนุมัติ cutover แยก

## 4. Cloud และมือถือ — ยังไม่ deploy

ตรวจ connected Supabase projects แล้วไม่มี project ของ AI Content Factory ที่อนุมัติ
มีเพียงโปรเจกต์อื่นที่ INACTIVE; ไม่ reuse/resume หรือ query databases เหล่านั้น
ไม่มี Supabase URL/server secret ใน environment ที่ตรวจ

- Owner ต้องเลือก app-specific Supabase project และ HTTPS host พร้อมขอบเขตค่าใช้จ่าย
  ก่อนสร้าง/เปิดใช้ infrastructure; ไม่มีการ provision, จ่ายเงิน หรือ expose local API
- คง Express/SQLite local V1; SQL ที่มีเป็น review-only ไม่ใช่ migration ที่ apply แล้ว
- ก่อน production ต้องปิดช่องว่าง broker/worker enrollment, scoped revocable credentials,
  atomic presence/claim, media bridge/checksum receipts และ provider frozen ต่อ durable job
- WAITING_FOR_WORKER ปัจจุบันเป็น pure projection ที่ทดสอบด้วย fixtures
  ยังไม่ใช่ cloud-to-local transport/UI ที่ deploy แล้ว
- Acceptance ต้องมี HTTPS owner authentication, durable cloud AI job และดูสถานะบนมือถือ
  ขณะ notebook disconnected จริง; ยังไม่มีหลักฐานนี้

ดู [Cloud control plane](CLOUD_CONTROL_PLANE.md) สำหรับ contracts และ deployment gates
ไม่มี automatic migration หรือ service-role key ฝั่ง browser

## 5. Facebook Page / YouTube

[Publishing preparation](PUBLISHING_PREPARATION_TH.md) เป็น planner ที่ไม่ส่ง HTTP
และคืน `executionAllowed=false` เสมอ Publish UI ยัง Planned
YouTube เตรียม metadata TH/EN, private resumable upload และ schedule ที่ผูก Owner approval
แต่ยังไม่มี OAuth/upload/scheduler จริง Facebook contract ยังต้องตรวจ official docs
ที่เข้าถึงไม่สำเร็จ ไม่เดา API version/scopes หรือ schedule policy

ก่อน activation ต้อง Owner ยืนยัน Page/channel, credentials/scopes, verified final MP4,
สิทธิ์เพลง/ภาพ, disclosure/audience และ scoped approval การเผยแพร่ครั้งแรก
ไม่อัปโหลด/โพสต์/ตั้งเวลา/publication จากเอกสารหรือ planner เพียงอย่างเดียว
