# ตั้งค่า Drive OAuth แบบ private ในเครื่อง

สถานะ **PREPARED**. Helper เก็บ credentials แบบเข้ารหัสเท่านั้น ยังไม่โหลดเข้าสู่
Owner3006 ไม่ restart แอป ไม่เริ่ม OAuth/upload และไม่เปิด Billing
ต้องใช้ Google OAuth Web client; Gemini API key ใช้แทน client ID/secret ไม่ได้

## Owner เตรียมใน Google Console

1. เลือก Google Cloud project ที่ต้องการใช้กับแอป เปิด Drive API และตั้ง OAuth
   consent screen/test user สำหรับบัญชี Owner ตามสิทธิ์ของ project
2. สร้าง OAuth client แบบ Web application และลงทะเบียน redirect URI ตรงตัว:
   `http://127.0.0.1:3006/api/integrations/drive/callback`
3. เก็บ client ID และ client secret ไว้ส่วนตัว ห้ามส่งในแชตหรือ Git
   ขั้นตอนนี้ไม่ต้องให้ Codex ซื้อบริการ/เครดิตหรือเปิด Billing

## ตำแหน่งและคำสั่ง

เปิด PowerShell ด้วยตนเองในเครื่องที่ใช้ Owner3006 แล้วรัน:

```powershell
Set-Location -LiteralPath 'D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\drive-local.ps1 -Action Configure
```

โปรแกรมถาม client ID และ client secret ด้วย hidden input ทั้งสองค่า
สร้าง random vault encryption key 32 bytes ครั้งเดียว และเข้ารหัส secret/key ด้วย
Windows-user DPAPI เก็บในไฟล์:

`D:\xampp\htdocs\Ai-content-factory\.worktrees\phase2-real-integrations\.tmp\drive-private\credentials.local`

client ID อยู่ใน private JSON; secret และ vault key เป็น ciphertext ไม่มี plaintext key
ใน source, command-line, frontend, logs หรือ Git ไฟล์/โฟลเดอร์ใหม่มี current-user ACL
และ protected permissions; existing `.tmp` ต้องมี ACL ที่ปลอดภัยอยู่แล้ว
helper ไม่แก้ ACL ของ shared directory เดิม หากพบ unsafe ACL จะหยุดให้ Root ตรวจ
ไม่ใช้ Configure ซ้ำเพื่อเปลี่ยน/หมุน key และไม่เขียนทับไฟล์ที่มีอยู่

ตรวจสถานะโดยไม่ decrypt หรือส่ง network:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts\drive-local.ps1 -Action Status
```

ผลแจ้งเฉพาะ presence booleans และ callback; `oauthVerifiedByThisTool=false`
เสมอ Status ตรวจ schema และรูปแบบ DPAPI envelope เท่านั้น ไม่พิสูจน์ authenticity
ของ ciphertext, สิทธิ์ client, บัญชี Google หรือการเชื่อมต่อจริง

## สิ่งที่ต้องทำหลังตั้งค่า

ตอบเพียงว่า **ตั้ง Drive OAuth private configuration แล้ว** ไม่ส่งค่าใดในแชต
Root จะเตรียม approved loader/runtime environment และขออนุมัติ restart Owner3006
แยกก่อนเปิดใช้งาน ห้ามรัน Gemini canary launcher หรือ startup receipt ที่ใช้แล้วซ้ำ
ไฟล์ private helper นี้ไม่ได้ set environment ของ process ที่เปิดอยู่ให้เอง

Mapping สำหรับ backend ที่ได้รับอนุมัติ:

| Private field | Backend environment |
|---|---|
| clientId | GOOGLE_CLIENT_ID |
| decrypted encryptedClientSecret | GOOGLE_CLIENT_SECRET |
| callbackUri | GOOGLE_REDIRECT_URI และ ACF_DRIVE_ALLOWED_REDIRECT_URIS |
| decrypted encryptedVaultKey | ACF_TOKEN_ENCRYPTION_KEY (canonical Base64 32 bytes) |

รักษา vault key เดิมข้าม restart และสำรองอย่างปลอดภัยแยกจาก token ciphertext
DPAPI file ผูก Windows user/เครื่อง ไม่ใช่ portable plaintext credential backup
หากย้ายเครื่องหรือ credentials เสีย ต้องวางแผน recovery กับ Owner ไม่สร้าง key ใหม่ทับ
เพื่อแก้ปัญหา เพราะจะอ่าน token vault เดิมไม่ได้

จากนั้น Owner login ที่ `http://127.0.0.1:3006` และ authorize Drive consent เอง
implementation ใช้ `drive.file`; ไม่ automate Google login/consent
ต้องอนุมัติ canary upload/download/checksum/restore แยกก่อนใช้จริง
ไม่ลบ local media ไม่ cleanup remote ไม่ switch storage และไม่ claim live success
จนมีหลักฐาน [Drive storage](DRIVE_STORAGE.md) และ [Owner actions](PRODUCTION_OWNER_ACTIONS_TH.md)

## Verification และข้อจำกัด

Helper/fixtures ตรวจ offline ด้วย Windows PowerShell 5.1 + th-TH ใน worktree แยก
ตรวจ hidden inputs, DPAPI roundtrip ด้วย synthetic values, no-decrypt Status,
validation, no-overwrite, ACL/reparse และไม่มี network/runtime actions
Root รันทดสอบซ้ำหลังรวม และรายงานผลใน PROJECT_STATUS
ไม่มี OAuth credentials จริง, consent หรือ live round trip จาก tests นี้

Review P2: existing-directory validator ไม่บังคับ CI/OI inheritance โดยตรง
directory ใหม่ตั้ง inheritance ครบ และไฟล์สร้างด้วย explicit private ACL จึงไม่มี
การเปิดเผยจากช่องว่างนี้ใน behavior ปัจจุบัน ต้องทบทวนก่อนเพิ่ม loader/ไฟล์ชนิดอื่น

## ข้อจำกัดของ PowerShell และ sandbox

`-ExecutionPolicy Bypass` ในคำสั่งข้างต้นมีผลเฉพาะ process ที่รัน local helper ที่ตรวจแล้ว ไม่เปลี่ยน policy ของเครื่องหรือ registry หาก helper ปฏิเสธ ACL ให้ตรวจว่าเปิดด้วยบัญชี Windows Owner เดิม: sandbox อาจใช้ SID ต่างกัน ห้ามแก้ ACL ให้กว้างขึ้นหรือสร้าง credentials ซ้ำเพื่อข้ามการตรวจ สถานะ absent ต้องยืนยันด้วย Status ภายใต้บัญชี Owner; Status ไม่ decrypt และไม่ยืนยัน OAuth
