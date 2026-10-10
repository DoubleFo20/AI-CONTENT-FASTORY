# Google Drive project storage

สถานะ: IMPLEMENTED_AND_PREPARED; ยังไม่มี OAuth credentials/grant หรือ live Drive verification. Local SQLite และ managed media path ยังคงเป็นแหล่งข้อมูลทำงาน. Storage integration เป็น sidecar private index ที่เตรียมโครงสร้างโฟลเดอร์และ upload/restore แบบ explicit; ไม่ใช่การตัดไปใช้ Drive เป็น primary store.

## Behavior ที่มีใน source

Express endpoint ทั้งหมดอยู่ใต้ `/api` และ owner-authenticated; POST ต้องผ่าน CSRF/Origin policy.

| Method/path | Behavior |
|---|---|
| GET `/projects/:id/storage` | คืน private index state `{storage}` ของ project |
| POST `/projects/:id/storage/prepare` | รับ `{}` แล้วจัดเตรียม root, categories และ project folder ตามที่ owner ขอ |
| POST `/projects/:id/storage/uploads` | รับ `{kind,mediaId}` สำหรับ `clips`, `exports`, `audio`, `images`; ต้อง prepare ก่อน; เริ่ม transfer และคืน 202 `{transfer}` |
| GET `/projects/:id/audio/:assetId/file`, `/images/:assetId/file` | อ่าน local cache; หากหาย จะ restore จาก managed Drive item เมื่อมี index entry และ verify ผ่าน |
| POST `/integrations/drive/authorize` | เริ่ม OAuth consent ที่ owner เปิดเอง |
| GET `/integrations/drive/callback` | รับ OAuth redirect และตรวจ session-bound one-time state |
| GET `/integrations/drive/status` | คืน local grant metadata; ไม่เรียก live health check |
| POST `/integrations/drive/backups` | explicit backup ของ media ที่ระบุและจัดการโดย app |
| GET `/integrations/drive/files/:id` | download เฉพาะ Drive file ที่มี app owner marker และอยู่ใน My Drive ส่วนตัว |

## Folder layout และข้อมูล transfer

Root ที่ app จัดการชื่อ `AI-CONTENT-FACTORY`, มีหกหมวด: `AI Story`, `Product Review`, `Kids & Toy`, `Investment`, `Shared Assets`, `Archives`. Project folder สร้างภายใต้ `AI Story` และตั้งชื่อจาก project name กับ UUID. การ prepare เป็นการกระทำแบบ manual; ไม่สร้าง folder เพียงเพราะมี project.

Private index อยู่ใน `server/project-storage.ts` และ `server/storage/projects.ts`, แยกจาก SQLite schema. มันบันทึก owner/project, folder IDs, source catalog reference, checksums และ transfer state. Transfer รองรับ progress `queued → running → completed/failed`. Files จำกัด 128 MiB ต่อไฟล์สำหรับ managed Drive media ปัจจุบัน. Source ถูกตรวจ file type/path/size และคำนวณ MD5 กับ SHA-256; upload ต้องตรงกับ owner marker, metadata และ checksum ของ source. ไฟล์เกิน 5 MiB ใช้ resumable upload แบ่ง chunk 4 MiB; เล็กกว่านั้นใช้ multipart upload.

Drive file IDs ถูก preallocate และเก็บ reservation ใน private receipt ก่อน upload. หากผล upload คลุมเครือ ระบบไม่ replay เอง; การ retry ต้องเกิดจาก explicit owner action และใช้ reservation เดิมเมื่อ source fingerprint เหมือนเดิม. เปลี่ยน bytes หรือ metadata ระหว่าง retry ถูกปฏิเสธ. ในการ restart, transfer ที่ค้าง queued/running จะกลายเป็น failed `INTERRUPTED`; การ retry สร้าง attempt ใหม่ที่ fence ผลลัพธ์ attempt ก่อนหน้า.

เมื่อต้องอ่าน/ส่งออกและ local cache หาย ระบบ restore เฉพาะไฟล์ที่มี managed index entry; ตรวจ remote owner marker, size, bytes/checksum ก่อนเขียน. การ restore ไม่ overwrite existing local file และไม่มีการลบ source local โดยอัตโนมัติ. Upload ที่สร้าง project folders และ files จะวางไฟล์ใน project folder; explicit backup endpoint เป็นเส้นทางสำรองต่อไฟล์ที่ app จัดการ.

`ProjectStorageState` ระบุ `projectId`, `prepared`, folder IDs (เมื่อมี), transfer list และ summary total/active/completed/failed. `TransferInfo` มี `status`, `progress`, `bytes`, `totalBytes`, `errorCode` และ verified remote file metadata เมื่อเสร็จ. สถานะนี้เป็นหลักฐานจาก local sidecar, ไม่ใช่ live network health indicator.

## OAuth setup

ต้องใช้ Google Cloud project ที่ owner เลือก, enable Drive API และ OAuth Web application. Implementation ขอเฉพาะ `https://www.googleapis.com/auth/drive.file`; consent และบัญชี Google เป็นการทำโดย owner ใน browser. ไม่มี automation การ login/consent.

Redirect URI ต้องตรง byte-for-byte ระหว่าง Google Console, `GOOGLE_REDIRECT_URI` และ `ACF_DRIVE_ALLOWED_REDIRECT_URIS`. Local default documented target:

`http://127.0.0.1:3001/api/integrations/drive/callback`

สำหรับ Release Candidate ที่เปิดบน port3006 ต้องลงทะเบียนและตั้งค่าทั้งสามตำแหน่งเป็น `http://127.0.0.1:3006/api/integrations/drive/callback` แทน3001 ให้ตรง URL ที่ใช้จริง หน้า Storage แสดง callback ของ origin ปัจจุบัน. Consent URL/code และ secrets ไม่ต้องส่งใน chat.

Production callback ต้อง HTTPS บน domain ที่ owner ควบคุม. Allowlist เป็น comma-separated exact URIs. Callback state one-time, expires, binds initiating owner and session hash, and session is rechecked before/after exchange. State อยู่ process memory เท่านั้น; restart ทำให้ consent flow เดิมหมดอายุ.

Inject ผ่าน private process/service environment manager เท่านั้น:

| Variable | Use |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret ฝั่ง server |
| `GOOGLE_REDIRECT_URI` | exact registered callback URI |
| `ACF_DRIVE_ALLOWED_REDIRECT_URIS` | comma-separated exact URI allowlist |
| `ACF_TOKEN_ENCRYPTION_KEY` | canonical Base64 encoding ของ random 32 bytes |
| `GOOGLE_DRIVE_FOLDER_ID` | optional; configured folder ต้องตรวจว่าเป็น private, non-shared My Drive folder |

`server/storage/drive.ts` โหลด environment โดยตรวจ canonical Base64 และ key length; vault เก็บ encrypted owner-bound token records. รักษา key เดิมข้าม restart และ backup แยกจาก ciphertext. ตรวจ filesystem ACL ของ private data/vault ด้วยตนเอง; บน Windows code ไม่แก้ ACL. การมี credentials หรือ local status `connected` ไม่ยืนยันว่า API ใช้งานจริงได้.

## Release boundary

สถานะปัจจุบันคือ prepared implementation เท่านั้น: ไม่มี OAuth configured/grant, real upload/download round trip หรือ deployed storage verification. ห้ามรายงานว่า Drive primary, migration หรือ backup verified. ก่อนใช้จริงให้ owner ตั้งค่า credentials/consent และทำ synthetic round-trip โดยตรวจ ownership, bytes/checksum, restore, interruption/retry และ cleanup ที่อนุมัติ. Preserve populated SQLite and local files until a separately approved migration/cutover and rollback plan is executed. ไม่มี Supabase configuration/deployment และไม่มี paired local worker ในสถานะที่ตรวจนี้.

Operational design เป็น single-process coordination; serialization ใน process ไม่ใช่ distributed lock. Independent review ยอมรับ cancellation/late-result fences และ request lifecycle แล้ว; OAuth session validator ที่กลับมาหลัง shutdown จะ fail closed โดยไม่อ่าน Store ที่ปิดแล้ว. RPC/network/stream ยังมี deadlines และไม่มี automatic retry. ไม่มี live OAuth test จาก review นี้.

## Implementation references

- `server/project-storage.ts`: owner-scoped media resolution and read/export cache restoration.
- `server/storage/projects.ts`: private manifest, fingerprinting, transfer lifecycle, restart recovery and fencing.
- `server/storage/drive.ts`: OAuth-backed Drive operations, folders, reservations, uploads and owner-bound validation.
- `server/storage/oauth.ts`, `server/storage/types.ts`: OAuth state, environment contract, limits and interfaces.
- [API contract](API_CONTRACT.md): application endpoints and request/response shapes.
