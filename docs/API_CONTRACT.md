# API contract

สถานะเอกสาร: สัญญาตาม implementation ใน worktree นี้; บริการภายนอกและ deployment ยังไม่ผ่านการตรวจจริง

API อยู่บน same origin ใต้ `/api`; ต้องมี owner session สำหรับ endpoint ที่ระบุว่า session และ mutation ป้องกันด้วย Origin/CSRF ตาม middleware ปัจจุบัน เว้นแต่ OAuth callback ที่ใช้ one-time state ผูกกับ owner session เดิมแทน. Response error ใช้ `{error:{code:string}}`; เวลาส่งเป็น ISO UTC. ID project/job/media เป็น UUID; idea/character/location/scene ID เป็นรหัสภายใน package.

## Auth, project และงาน

| Method/path | Request | Response/ผล |
|---|---|---|
| GET `/health` | — | `{ok, aiConfigured}`; `aiConfigured` บอกเฉพาะว่ามี key ใน environment ไม่ได้ยืนยัน quota หรือการเรียกสำเร็จ |
| GET `/auth/status` | session cookie | `AuthState {user,csrfToken,setupRequired}` |
| POST `/auth/setup` | `{username,password}` | AuthState และ session cookie; first owner only, loopback only |
| POST `/auth/login` | `{username,password}` | AuthState และ session cookie |
| POST `/auth/logout` | empty body + CSRF | `{ok:true}` และล้าง cookie |
| POST `/integrations/ai/mode` | `{mode:"mock"|"openai"}` + CSRF | `{ai:AiRuntimeStatus}`; เลือก provider อย่างชัดเจนและบันทึกใน private data directory |
| GET `/dashboard` | session | `Dashboard` |
| GET `/projects` | session | `{projects:ProjectSummary[]}` |
| POST `/projects` | `ProjectInput` | 201 `{project:Project}` |
| GET `/projects/:id` | session | `{project:Project}` |
| POST `/projects/:id/ideas` | empty body + CSRF | 202 `{job:Job}`; สร้าง 10 ideas; ไม่มีงาน active หรือ selection อยู่ก่อน |
| POST `/projects/:id/select` | `{ideaId}` + CSRF | `{project}`; ต้องเป็นหนึ่งใน 10 ideas |
| POST `/projects/:id/expand` | empty body + CSRF | 202 `{job}`; ขยายเฉพาะ selection ที่บันทึกไว้ |
| GET `/projects/:id/prompt-pack` | session | ดาวน์โหลด JSON ของ project, story bible และ scenes |
| POST `/projects/:id/clips` | multipart `clip`, `sceneId` + CSRF | 201 `{clip:Clip}` |
| POST `/projects/:id/export` | empty body + CSRF | 202 `{job}`; ทุก scene ต้องมี clip |
| GET `/jobs` | session | `{jobs:Job[]}` |
| GET `/queue/status` | session | `{worker:WorkerStatus}` |
| POST `/jobs/:id/cancel` | empty body + CSRF | `{job}`; queued/running cancellation ไม่เริ่มงานใหม่อัตโนมัติ |
| POST `/jobs/:id/retry` | empty body + CSRF | 202 `{job}`; retry เฉพาะ failed job ที่ prerequisites ยังครบ และเป็นการกระทำโดยเจตนา |
| GET `/clips/:id/file`, `/exports/:id/file` | session | stream/download ที่ตรวจ ownership; รองรับ Range ตามชนิดไฟล์ |

`ProjectInput` รับ `name`, `brief`, `genre`, `audience`, `aspectRatio` (`9:16`, `16:9`, `1:1`) และ `targetDurationSeconds` ซึ่ง optional และต้องเป็นจำนวนเต็ม 12–180. `ProjectSummary.generation` เป็น optional provenance ของ idea/expansion (`mock` หรือ `openai`) ไม่ใช่การยืนยันคุณภาพหรือ billing.

Production state แยกจาก stage ของ project. Stage คือ `draft → ideas_ready → selected → expanded → clips_ready → exported`; งาน queued/running และ progress อยู่ใน Job แยกต่างหาก. เมื่อ process หยุด งานที่ active ถูกทำเครื่องหมาย interrupted; ไม่มี automatic paid retry. ความล้มเหลวไม่แทนที่เนื้อหาที่ valid. การเปลี่ยน idea หลัง expand เป็น conflict.

## Production, editor และ assets

| Method/path | Request | Response/ผล |
|---|---|---|
| GET `/projects/:id/production` | session | `{state,estimate,scenes}`; scenes มี prompt ภาษาอังกฤษที่ประกอบจาก scene, character/location references และ continuity |
| POST `/projects/:id/production` | patch `{flow?,editor?,scenes?}` + CSRF | `{state,estimate}`; บันทึกเฉพาะ private sidecar เมื่อ project idle และ worker พร้อม |
| POST `/projects/:id/clip-match` | `{filenames:string[]}` | `{matches:[{filename,sceneId:string|null}]}`; เป็นเพียงคำแนะนำให้ผู้ใช้ยืนยัน import |
| POST `/projects/:id/audio` | multipart `audio` + CSRF | 201 `{asset:AudioAsset}`; รองรับ mp3/wav/m4a/ogg, สูงสุด 32 MiB และ probe media จริง |
| GET `/projects/:id/audio/:assetId/file` | session | authenticated audio stream; ใช้ Drive restore เมื่อ local cache หายและมี managed copy |
| POST `/projects/:id/images` | multipart `image` + CSRF | 201 `{asset:ImageAsset}`; รองรับ png/jpg/jpeg/webp, สูงสุด 16 MiB และตรวจภาพจริง |
| GET `/projects/:id/images/:assetId/file` | session | authenticated image stream; ใช้ Drive restore เมื่อ local cache หายและมี managed copy |
| GET `/projects/:id/storage` | session | `{storage:ProjectStorageState}`; อ่าน transfer state จาก private index |
| POST `/projects/:id/storage/prepare` | `{}` + CSRF | `{storage}`; เตรียม Drive folders ที่ผู้ใช้สั่ง |
| POST `/projects/:id/storage/uploads` | `{kind:"clips"|"exports"|"audio"|"images",mediaId}` + CSRF | 202 `{transfer:TransferInfo}`; ต้อง prepare ก่อน |

Editor settings รองรับ `resolution` 720p/1080p, `quality` draft/standard/high, `transition` cut/fade, audio normalization, clip volume, music asset/volume, subtitle locale off/th/en, scene order และ sound effects ต่อ scene. อ้าง asset ได้เฉพาะ audio ของ project เดียวกัน. Scene order ที่ส่งมาต้องเป็น permutation ครบทุก scene. Export ใช้ค่าเหล่านี้เมื่อประกอบไฟล์; editor settings และ Flow settings ถูก persist ใน private JSON sidecar ต่อ project โดยไม่เปลี่ยน schema SQLite.

Flow settings เป็นข้อมูลประมาณการ/บันทึกของผู้ใช้: model label, generation duration 4/6/8 วินาที, optional credits per generation และ budget; `rateVerifiedByOwner` ต้องเป็น true จึงแสดงค่าประมาณเครดิต. API ไม่สร้างวิดีโอ ไม่เรียก Flow และ `spendsCredits` เป็น false. ผู้ใช้เป็นผู้เปิด Flow และส่ง prompt เอง.

## Drive OAuth และ cloud namespace

| Method/path | Request | Response/ผล |
|---|---|---|
| GET `/integrations/capabilities` | session | `{capabilities}`; รายงาน runtime config, ไม่ใช่ live service proof |
| GET `/integrations/drive/status` | session | `{storage:DriveStatus}`; local credentials/status เท่านั้น |
| POST `/integrations/drive/authorize` | `{}` + CSRF | `{authorizationUrl}` สำหรับ consent ที่ผู้ใช้ทำใน browser |
| GET `/integrations/drive/callback` | `state` + `code` หรือ OAuth error | ตรวจ one-time state และ session เดิมก่อน/หลัง token exchange; redirect กลับ app |
| POST `/integrations/drive/backups` | `{kind:"clips"|"exports",mediaId}` + CSRF | 201 `{file}`; legacy explicit backup สำหรับคลิป/MP4; audio/images ใช้ project storage uploads |
| GET `/integrations/drive/files/:id` | session | private managed file attachment; ต้องผ่าน owner marker |
| GET `/cloud/projects` | session | `{projects:CloudProjectSnapshot[]}` |
| POST `/cloud/projects` | `ProjectInput` + CSRF | 201 `{project}` |
| GET `/cloud/projects/:id` | session | `{project}`; foreign/missing ID ตอบ 404 |
| POST `/cloud/projects/:id/select` | `{ideaId,revision}` + CSRF | `{project}`; revision CAS |
| POST `/cloud/projects/:id/ideas`, `/expand` | `{}` + CSRF | 202 `{job:CloudJob}` |
| GET `/cloud/projects/:id/jobs` | session | `{jobs:CloudJob[]}` |
| POST `/cloud/projects/:id/jobs/:jobId/retry` | `{}` + CSRF | 202 job ใหม่จาก failed job โดย explicit retry |
| POST `/cloud/projects/:id/export` | `{}` + CSRF | ยังตอบ `CLIPS_REQUIRED` จนกว่าจะมี private cloud media catalog และ paired worker |

Cloud project เป็น namespace opt-in ที่แยกจาก SQLite. ไม่มีการ migrate หรือ mirror อัตโนมัติ. Cloud adapter/SQL ที่มีอยู่ยังไม่ยืนยัน Supabase deployment หรือ worker pairing; cloud endpoints ที่ต้องพึ่ง service ที่ไม่มีค่าตั้งค่าตอบ safe conflict. ไม่ส่ง service-role key หรือ OAuth tokens ให้ client/worker.

Drive transfer state มี ID, kind/media ID, queued/running/completed/failed, progress, bytes/total, error code และ verified file metadata. การ restart เปลี่ยน transfer ที่ยัง queued/running เป็น failed ด้วย `INTERRUPTED`. Explicit retry ใช้ reservation/ID เดิมเมื่อ fingerprint ตรงกัน จึงไม่สร้าง remote duplicate โดยอัตโนมัติหรือ replay ambiguous upload. ผู้ใช้ต้องสั่ง retry เอง. การ restore cache ทำเมื่ออ่านไฟล์หรือ export เท่านั้น ตรวจ checksum ก่อนเขียน และไม่ลบไฟล์ local อัตโนมัติ.

## Shared security/behavior

Auth setup ลงชื่อเข้าใช้ owner ใหม่ทันที ใช้ cookie flags เดียวกับ login และ session อายุ 12 ชั่วโมง. Mutation ใช้ CSRF token จาก AuthState และ same-origin/allowed Origin policy. OAuth callback เป็นข้อยกเว้นเพราะ browser redirect อาจไม่ส่ง Strict cookie; ใช้ state แบบใช้ครั้งเดียว ผูก hash ของ session owner และตรวจ session ยังใช้งานอยู่. API ไม่ส่ง API key, OAuth token, lease proof, private path หรือ raw upstream response.

`GET /health.aiConfigured` ยังคงมีความหมาย legacy ว่าพบ `OPENAI_API_KEY` เท่านั้น. AI runtime mode มี `mock`, `openai`, หรือ environment `auto`; endpoint เปลี่ยน mode รับเฉพาะ `mock`/`openai`. `auto` ใช้ mock เมื่อไม่มี config หรือ quota/access fallback ที่ระบุ; refusal, invalid output, rate limit, timeout และ ambiguous network failure ไม่ fallback. ขณะนี้ live OpenAI generation มีหลักฐาน quota failure ที่รายงานจาก owner; อย่าตีความ key presence ว่าใช้งานได้.

Shared source of truth: `shared/contracts.ts`, `shared/production.ts`, `shared/integrations.ts`; route implementations: `server/app.ts`, `server/production.ts`, `server/project-storage.ts`, `server/integrations.ts`.

Setup/login ใช้ allowed Origin และ strict JSON แต่ยังไม่ต้องมี session/CSRF เพราะเป็นเส้นทางเข้าใช้งาน หลัง login mutations ต้องใช้ CSRF ทุกครั้ง. HTTP shutdown ปฏิเสธ admission ด้วย INTERRUPTED503, cancel probes, track actual handlers/parser cleanup และ fence ทุก post-await Store/catalog commit. New application option requestDrainMs ใช้เฉพาะ tests/operations (default5000ms) ไม่เป็น client input.
