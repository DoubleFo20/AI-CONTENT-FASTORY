# External integrations and release readiness

วันที่สรุป: 2026-10-10 (Asia/Bangkok)
สถานะ: IMPLEMENTATION PREPARED; external integrations not live-verified. งานนี้เป็นรายงานสถานะ ไม่ใช่การตั้งค่า, deploy, migration หรือการเรียก paid provider.

## สถานะจากหลักฐานที่มี

- Express + SQLite local lane ยังคงใช้งานและไม่ถูกเปลี่ยน. Production/editor settings, media imports, Drive private sidecar index และ endpoints ถูกเตรียมใน source; การมี implementation ไม่ใช่หลักฐานว่าบริการจริงพร้อม.
- `OPENAI_API_KEY` เดิมได้รับอนุมัติให้reuse. Rootตรวจliveหนึ่งคำขอแยกจากOwnerเมื่อ2026-10-10T08:21:09Z ได้HTTP429/insufficient_quota (AI_QUOTA_EXCEEDED), ไม่มีretryหรือbillingchange. งานเดิมสามครั้งยังpreserve. ยังไม่แยกได้ว่าcreditbalanceหรือspendlimitจากaccountsettings จึงให้Ownerตรวจเองก่อนsuccessfullivecanary. ไม่มีGemini key.
- Google OAuth/Drive ยังไม่มี credentials/grant และ live upload/download round-trip. Drive folder/index/transfer logic เป็น PREPARED; ไม่มี verified remote storage หรือ Drive-primary cutover.
- Supabase URL/secret ยังไม่ configured; SQL draft/adapter code ไม่ได้ถูก deploy. Hosted grants/RLS/PostgREST, multi-host concurrency และ production persistence ยังไม่มีหลักฐาน.
- Always-on cloud host และ paired Local Worker ยังไม่ verified/implemented as a deployment path. Lease RPC/code tests ไม่พิสูจน์ laptop-offline operation หรือ worker pairing.
- Google Flow ยังคงเป็น user-operated handoff. ไม่มี Flow API ที่ได้รับอนุมัติหรือ billing integration; ห้ามสร้าง Flow endpoint/automation หรือแสดงราคาเครดิตที่ไม่ได้ยืนยันจาก owner.

ผลสรุป: core source เตรียมความสามารถและ contracts เพิ่มขึ้น แต่ยังไม่มี external service ที่ถือว่า live verified. คง local SQLite/auth/FFmpeg lane ไว้จน credential, hosting/schema verification และ migration ที่ Owner อนุมัติพร้อม.

## AI mode และ quota gate

`POST /api/integrations/ai/mode` รับ `{mode:"mock"|"openai"}`; เปลี่ยน mode อย่างชัดเจนและบันทึกใน private state. Environment mode ยังรองรับ `openai` (default), `mock`, `auto`; mock output ต้องแสดงเป็น synthetic. `auto` fallback เฉพาะ missing configuration, quota หรือ access failure ตาม code; ไม่ fallback/refire เมื่อ refusal, invalid output, rate limit, timeout หรือ network result กำกวม. `GET /api/health.aiConfigured` มีความหมายแค่ตรวจ key presence.

สถานะ quota ที่มีรายงานเป็น blocker ของ paid AI. ก่อนทดสอบ live ต้องแก้ project access/credits ในช่องทางที่ Owner ดูแล และ Owner อนุมัติ canary แบบจำกัด: 10 ideas → เลือกหนึ่ง → expand selected story. ไม่ควร retry ซ้ำจนกว่าจะมีหลักฐานว่า quota พร้อม. ไม่มีการเก็บหรือเปิดเผย key ในเอกสารนี้.

## Flow, prompts และ media production

แอปสร้าง English Flow prompt จาก scene prompt, aspect ratio, character/location references และ continuity rules พร้อม Thai scene explanation. ผู้ใช้เปิด Flow และสร้างแต่ละ clip เอง; แอปช่วย import/จัดเรียง/edit/export หลังผู้ใช้ได้ไฟล์แล้ว. Scene clip นำเข้าตรวจด้วย media probe. Audio/image imports เก็บใน private local data พร้อม probe/metadata จริง.

Editor รองรับ 720p/1080p, cut/fade, audio normalization, clip volume, music/SFX, subtitle off/TH/EN และ scene reorder; settings persist ใน private per-project JSON sidecar โดยไม่เปลี่ยน populated SQLite schema. Flow estimate แสดงจำนวน generation โดยอิง duration ที่ user บันทึก; ราคาจะปรากฏได้ต่อเมื่อ owner ยืนยัน rate. ไม่มี Flow billing ledger และไม่มีการใช้เครดิตจากแอป.

## Drive readiness

มี private index/manifest ภายใต้ `server/project-storage.ts`, `server/storage/projects.ts`, `server/storage/drive.ts`. ผู้ใช้ต้องสั่งเตรียม root และหมวด 6 รายการ, แล้วจึงสั่ง upload media ที่จัดการโดย app. Transfer ใช้ owner/project/media identity, checksums, progress และ bounded size. ค่าสูงสุด 128 MiB ต่อ managed Drive media; resumable chunks 4 MiB. File ID reservation และ explicit retry ลดความเสี่ยง remote duplication; ไม่ replay ambiguous upload อัตโนมัติ. Restart เปลี่ยน queued/running เป็น interrupted. Restore เกิดเมื่อ read/export ต้องใช้ไฟล์ที่ cache หาย; verify checksum และไม่ overwrite local file หรือ auto-delete local copy.

Implementation ไม่ได้ทำ OAuth หรือ Drive round-trip ในสถานะที่รายงาน. ต้องตั้ง private env values ตาม [Drive storage guide](../DRIVE_STORAGE.md), ทำ consent ด้วย owner และตรวจ synthetic upload/download/restore ก่อนใช้จริง. Independent review ยอมรับ abort/shutdown/late-result/late-Multer handling หลังแก้ regression; การยอมรับ source และ mock tests ไม่ยืนยันบริการจริง.

## Cloud / Supabase gates

Cloud endpoints และ SQL draft แยกจาก local SQLite project namespace. ยังไม่มี configured Supabase project, schema deployment, hosted RLS/grant/PostgREST test, always-on control plane หรือ worker pairing. อย่านำ SQL ไป apply กับฐานที่มีข้อมูลโดยไม่มี Owner approval. ก่อน release ต้องเลือก project ที่ถูกต้อง, review SQL บน isolated project, ตรวจ role/grant/RLS/owner isolation และ CAS/active-job uniqueness, ทำ backup/restore และ rollback plan, แล้วทดสอบ always-on job หลัง laptop disconnect. Worker pairing/auth และ media ownership/checksum contracts เป็น gates แยก; service key ไม่ควรส่งให้ worker.

## Gates ที่เหลือ

1. Resolve AI quota/project access ผ่าน owner แล้วรัน approved canary ที่จำกัด; บันทึก mode และ safe outcomes.
2. Owner provision Google OAuth values ผ่าน private manager, consent เอง, ตรวจ transfer round trip, checksum/ownership, interrupted transfer และ restore behavior.
3. เลือก Supabase project/always-on host, review และ approve schema ก่อน apply; verify deployed grants/RLS/PostgREST, persistent jobs และ restart/offline behavior.
4. Implement and review paired Local Worker protocol, enrollment/revocation, scoped credentials, lease fencing และ media bridge ก่อนเปิด cloud export ไป local.
5. รักษา populated SQLite/local files จนมี approved inventory, backup/restore rehearsal, reconciliation, rollback และ migration authorization.

ไม่มี Flow API, Supabase deployment, OAuth grant หรือ paid AI call ถูกทำโดยเอกสารฉบับนี้.

## References in repository

- [API contract](../API_CONTRACT.md)
- [Drive storage guide](../DRIVE_STORAGE.md)
- [Cloud control plane](../CLOUD_CONTROL_PLANE.md)
- `docs/sql/supabase-core.sql` (draft; not applied)

## เอกสารทางการที่ใช้ตรวจขอบเขต

Flow เป็นผลิตภัณฑ์เว็บและ account integration ของแอปนี้ยังไม่ได้รับอนุญาต; เอกสาร Veo API เป็น integration อีกผลิตภัณฑ์ ไม่ใช่สิทธิ์เรียก Flow ของ Owner. ต้องตรวจบัญชี/model/specification จริงก่อนเลือก API หรือค่าเครดิต ไม่กำหนดราคาใน source จากการคาดเดา.

- [Google Flow](https://labs.google/fx/tools/flow), [Flow Help/credits](https://support.google.com/labs/answer/17093911?hl=en)
- [Veo via Gemini API](https://ai.google.dev/gemini-api/docs/veo)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive minimal scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

## OpenAI diagnostic ที่ตรวจจริง

หนึ่งofficialResponsesrequestได้429/insufficient_quota; ไม่ใช่ordinaryrequest-ratefailure. การretryไม่แก้credits/limits ตาม [OpenAI error guidance](https://developers.openai.com/api/docs/guides/error-codes). Ownerตรวจ [Billing](https://platform.openai.com/settings/organization/billing) และ [Limits](https://platform.openai.com/settings/organization/limits) ผ่านaccountเอง; ไม่มีการซื้อ/เพิ่มเพดานโดยCodex. ใช้defaultideasmodel gpt-6-luna; modelaccess/realoutputยังไม่ผ่านเนื่องจากquota. หลังแก้quotaให้test10shortideasในprojectใหม่และexpandเฉพาะconceptที่Ownerเลือก ไม่overwritecachedMockหรือretryเดิมโดยอัตโนมัติ.
