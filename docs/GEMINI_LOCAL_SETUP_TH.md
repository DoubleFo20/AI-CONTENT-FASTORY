# ตั้ง Gemini Free Tier สำหรับ backend ในเครื่อง

สถานะ: PAUSED_FOR_USAGE_RESET; backend configuration PREPARED — ยังไม่มี successful live Gemini test และยังไม่เปลี่ยน Owner app ที่พอร์ต 3006. ใช้ Premium Cinematic V2 และข้อมูลเดิมต่อได้ใน Mock Mode. PR #2 และ #3 ยังไม่ merge.

## 1. ตรวจบัญชี API ด้วยตนเอง

เปิด [Google AI Studio](https://aistudio.google.com/) ตรวจ **API project ที่เป็นเจ้าของ key** ว่าใช้ Free Tier และยังไม่เปิด Billing. การสมัคร Gemini สำหรับผู้ใช้ไม่ได้ยืนยันเครดิต Gemini API. โมเดลที่ backend อนุญาตขณะนี้คือ `gemini-3.5-flash-lite` สำหรับทั้ง ideas และ expansion; ตรวจสิทธิ์และ Free Tier ของ project ตาม [ข้อมูลโมเดล](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [ราคา](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) และ [Billing](https://ai.google.dev/gemini-api/docs/billing).

ซอฟต์แวร์ไม่มี request flag ที่พิสูจน์หรือบังคับ free billing tier. `ACF_GEMINI_FREE_TIER_CONFIRMED=true` เป็นคำยืนยันของ Owner หลังตรวจบัญชี ไม่ใช่การตรวจ billing จาก API. หากพบ quota/rate limit/access/model error ให้หยุดและเก็บผล ห้ามเปิด Billing หรือสลับไปโมเดล/ผู้ให้บริการที่เสียเงินโดยอัตโนมัติ. `store:false` เป็น logging control; Free Tier ยังอยู่ภายใต้นโยบายใช้ข้อมูลของ Google.

## 2. ตำแหน่งไฟล์และวิธีกรอก key แบบซ่อน

เครื่องมือตั้งค่า backend อยู่ที่:

`D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations\scripts\gemini-local.ps1`

เปิด PowerShell บนเครื่องด้วยบัญชี Windows เดียวกับ Codex แล้วรัน:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations\scripts\gemini-local.ps1" -Action Configure
```

1. เมื่อถามยืนยัน Free Tier ให้พิมพ์ `FREE` หลังตรวจ project และ billing แล้วเท่านั้น.
2. เมื่อถาม Gemini API key ให้กรอก key ใน terminal นี้ ระบบซ่อนค่าระหว่างกรอก. ห้ามใส่ key ในคำสั่ง, แชต, frontend หรือ Git.
3. ผลสำเร็จจะมี `configured:true`, `encryptedForCurrentWindowsUser:true`, `liveRequests:0` และ `billingChanged:false`.

ไฟล์ private ที่สร้างคือ:

`D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations\.tmp\gemini-private\credentials.local`

ไฟล์นี้เก็บ ciphertext ด้วย Windows DPAPI สำหรับบัญชี Windows ปัจจุบัน และอยู่ใน path ที่ Git ignore. เครื่องมือกำหนด ACL ของ `.tmp` และ `gemini-private` ให้บัญชีนี้เท่านั้น ตรวจ ancestor/reparse points และใช้ atomic no-overwrite write. หากมี configuration เดิมอยู่ เครื่องมือจะหยุดเพื่อรักษาของเดิม. Owner ควรเก็บ key ต้นฉบับในที่ปลอดภัยสำหรับการกู้คืน; DPAPI file ไม่ใช่ backup ที่ย้ายข้ามบัญชีได้.

## 3. Environment ที่ส่งให้ backend

Backend อ่าน process environment. เครื่องมือถอดรหัสเฉพาะตอนเปิด Node แล้วใส่:

| ชื่อตัวแปร | ค่า/หน้าที่ |
|---|---|
| `GEMINI_API_KEY` | key ฝั่ง backend เท่านั้น |
| `ACF_GEMINI_FREE_TIER_CONFIRMED` | `true` หลัง Owner ยืนยัน API project |
| `GEMINI_IDEAS_MODEL` / `GEMINI_EXPANSION_MODEL` | `gemini-3.5-flash-lite` |
| `ACF_AI_MODE` | `gemini` สำหรับฐานข้อมูล canary ใหม่ |
| `ACF_OPENAI_REQUESTS_APPROVED` | `false` |
| `ACF_CLOUD_WORKER` | `false` |
| `ACF_HOST` | `127.0.0.1` |

Owner ที่เตรียม environment ไว้แล้วสามารถใช้ key + confirmation จาก **Process scope เดียวกัน** หรือ **User scope เดียวกัน** แทน private file ได้. Private file มีลำดับก่อน environment; confirmation จากคนละ scope จะใช้ร่วมกับ key ไม่ได้. เครื่องมือไม่เขียน plaintext `.env` หรือเปลี่ยน registry environment. Child environment ใช้ allowlist; ไม่ส่ง inherited `NODE_OPTIONS`, OpenAI, Google OAuth, Supabase หรือ verifier password ไป canary.

ตรวจ presence โดยไม่แสดงค่า:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations\scripts\gemini-local.ps1" -Action Status
```

หลังตั้งแล้วตอบ Codex ว่า **พร้อม และตรวจ API project Free Tier/Billing disabled แล้ว** โดยไม่ส่ง key.

## 4. ทดสอบ live หนึ่งรอบหลังพร้อม

Checkpointนี้หยุดตามusage<=7%. ก่อน live ให้ sessionถัดไปตรวจ Windows PowerShell7 th-TH หลัง timestamp/native-probe fixes; WindowsPowerShell5 synthetic14checksผ่านแล้ว แต่ยังไม่ใช่ live API proof. Configure/Statusทำได้โดยไม่ส่งgenerationrequest.

Codex จะ build/check source ที่ review แล้ว และเปิด runtime แยกบน loopback 3013 พร้อมฐานข้อมูลใหม่ `storage/gemini-canary-<random>`. Launcher ปฏิเสธพอร์ตที่มีผู้ใช้ ตรวจ PID/listening owner/health ภายใน deadline และไม่มี generation request ระหว่าง startup. ใช้ normal account setup/login ในฐานข้อมูลสังเคราะห์เท่านั้น. Log/metadata อยู่ใน private directory.

คำสั่งเปิด runtime สำหรับผู้ดูแล:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations\scripts\gemini-local.ps1" -Action Start -Port 3013
```

ต้อง build สำเร็จก่อน Start. Start สร้าง canary storage ใหม่ทุกครั้ง; ไม่รับ path ฐานข้อมูล Owner, ไม่หยุด process เดิม, ไม่เริ่ม AI เอง และไม่ใช่เครื่องมือ resume database เดิม. ให้ใช้ runtime/canary ที่รายงานไว้เพียงชุดเดียวเพื่อป้องกัน generation ซ้ำ.

เมื่อ key พร้อมและ Owner ยืนยันแล้ว Codex จะเรียก explicit verifier ด้วยบัญชี canary ใน private environment (`ACF_VERIFY_USERNAME`, `ACF_VERIFY_PASSWORD`, `ACF_VERIFY_GEMINI_FREE_TIER_CONFIRMED=true`):

```powershell
node scripts/verify-gemini-live.mjs --origin http://127.0.0.1:3013 --expand-first-idea
```

เส้นทางนี้สร้างชื่อ `ACF GEMINI FREE TIER PIPELINE CANARY <UUID>` ใหม่ → ideas POST หนึ่งครั้ง → ตรวจสิบไอเดียไทย/อังกฤษ → เลือกเรื่องแรกใน canary → expand POST หนึ่งครั้ง → ตรวจ bibles/scenes/คำอธิบายไทย/Flow prompts อังกฤษ. สูงสุดสอง generation attempts โดยไม่มี retry, fallback หรือ automatic billing. บันทึกเฉพาะ IDs/status และ usage metadata ที่มีจริง; cost ที่ไม่มีหลักฐานคงเป็น unknown. การใช้ model/key ไม่พิสูจน์บัญชี Free Tier และ tests ที่ injected provider ไม่ใช่ live proof.

หาก timeout/คำขอกำกวม ให้รักษา project/job IDs แล้วตรวจ canary เดิม:

```powershell
node scripts/verify-gemini-live.mjs --origin http://127.0.0.1:3013 --expand-first-idea --project-id <UUID-เดิม>
```

Resume อ่านสถานะเท่านั้น ไม่มี select/ideas/expand POST. หากไม่มี expand job เดิมจะหยุด `CANARY_STATE_UNSAFE` เพื่อให้ตรวจหลักฐานผ่านแอปก่อน. Cached completed package ไม่เรียก provider ซ้ำ. Default verifier ที่ไม่มี `--expand-first-idea` ยังคงตรวจสิบไอเดียเท่านั้น. ไม่เปลี่ยน/เลือก/ขยายเรื่องเดิมของ Owner โดยอัตโนมัติ.

## 5. หลัง canary และงานที่ทำต่อได้

การเปิด Gemini ใน Owner app 3006 เป็นอีก checkpoint: ตรวจไม่มี active job, consistent backup/integrity และ schema compatibility ก่อน restart ด้วย source Phase2/original storage. การ merge PR, deployment, storage cutover หรือ publish ต้องรอ Owner อนุมัติ. Saved Mock mode ของฐานข้อมูลเดิมต้องรักษาไว้ แล้วให้ Owner เลือก provider ผ่าน Settings ตามปกติ.

Google Drive OAuth/encrypted token/folder/upload/download/checksum verifier และ Cloud job/presence/reconnect foundation เตรียมแล้วและทดสอบด้วย mocks. ขั้นตอนจริงยังต้อง Google OAuth/Owner consent และ approved Supabase project/HTTPS host/schema/deployment. อ่าน [Phase2 operations](PHASE2_OPERATIONS.md), [Drive setup](DRIVE_STORAGE.md), [Cloud foundation](CLOUD_CONTROL_PLANE.md). Google Flow ยังคงเป็น video engine หลักแบบ assisted production; notebook-offline operation ยังไม่ได้พิสูจน์.
