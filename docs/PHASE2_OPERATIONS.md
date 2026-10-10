# Phase 2 — real integrations preparation

Latest 2026-10-11: Gemini key DPAPI configured; real ten concepts/one selection VERIFIED, expansion failed AI_REQUEST_FAILED with historical HTTP status unknown. Do not rerun canary or retry automatically. See [actual live result](GEMINI_LIVE_RESULT_20261011_TH.md); next Owner approval is one Free Tier expansion retry on the same cached canary with updated private diagnostics. Owner3006/PR2/PR3 remain unchanged/unmerged.

สถานะ: LIVE_IDEAS_VERIFIED_EXPANSION_BLOCKED; [Draft PR#3](https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/3) target release/v1-real-world. Gemini จริงผ่านเฉพาะสิบไอเดียและการเลือกหนึ่งเรื่อง; expansion ล้มเหลว จึงยังไม่ผ่าน end-to-end live AI. Drive/Cloud ยังไม่มี live proof. Owner app3006 ยังเป็น RC/Mock และ Premium Cinematic V2 คงอยู่. Phase A แยกใน [FINAL_REVIEW](release/FINAL_REVIEW.md); main และ Draft PR#2 ยังไม่ merge.

## AI text

Settings เลือก Mock, OpenAI หรือ Gemini โดย Owner ผ่าน session/CSRF; เปลี่ยนโหมดไม่เริ่ม job. ขณะมี local jobs/outstanding request เปลี่ยนไม่ได้. หากเปิด Cloud repository จะล็อก mode พร้อมข้อความ TH/EN จนมี provider ที่ freeze ต่อ cloud job เพื่อรักษา provider ของงานที่บันทึกไว้.

Official REST/model/pricing contractตรวจซ้ำแล้ว; `store:false`เป็นlogging control ไม่รับประกันzero retentionหรือยกเว้นFree Tier data-use policy. Free Tier/Billing disabled ยืนยันโดย Owner; ไม่มี billing telemetry จากเครื่องมือ. Live canary ผ่านเฉพาะ ideas/selection. Gemini ใช้ official `generateContent` บน fixed host, key header, `store:false`, one candidate, bounded120s/no retries, JSON schema subset แล้ว validate full contract ใน server. Exactly10shortideas และ expandเฉพาะ selected idea; caches/provenance เดิมคงอยู่. Default และ allowlist ideas/expansion เป็น `gemini-3.5-flash-lite` เท่านั้น ตาม Owner Free Tier-only policy. ต้องยืนยัน API project ไม่มี paid billing; API key เพียงอย่างเดียวพิสูจน์ tier ไม่ได้. ไม่มี API flag ที่บังคับ free billing tier. [Official models](https://ai.google.dev/gemini-api/docs/models), [REST contract](https://ai.google.dev/api/generate-content).

Inject `GEMINI_API_KEY` ฝั่ง server ผ่าน private process/service environment; optional `GEMINI_IDEAS_MODEL` และ `GEMINI_EXPANSION_MODEL`. ห้ามใช้ VITE_* หรือส่ง key ใน chat/Git. ต้องมี `ACF_GEMINI_FREE_TIER_CONFIRMED=true` หลัง Owner ตรวจ project Free Tier/Billing disabled ก่อนส่งคำขอ; default ไม่ส่งคำขอ. OpenAI เป็น backup แต่ Owner ระงับการเรียกจนอนุมัติใหม่: `ACF_OPENAI_REQUESTS_APPROVED` default false; quota correction อย่างเดียวไม่ถือเป็น approval. Gemini quotaหมดหยุด/แจ้งเตือน ไม่มี retry/paid upgrade/provider fallback. ไม่ซื้อเครดิตหรือเปิด Billing. Gemini subscription ไม่ถือเป็นหลักฐาน API credits. Real canary หลัง credentials พร้อมเป็นโปรเจกต์สังเคราะห์ใหม่10concepts→เลือกหนึ่ง→expand เพียงหนึ่งครั้งตาม explicit Owner authorization พร้อมบันทึก request count/ผล/usage; injected tests ไม่ใช่ live proof.

OpenAI/Gemini บันทึก token metadata เฉพาะเมื่อเชื่อถือได้ ก่อน validate output; invalid paid result จึงมี receipt ได้. Receipt owner/job-bound, deduplicated, จำกัด50รายการล่าสุดใน private input_json เดิม ไม่มี schema migration; canceled/late callback ถูก fence. Mock หรือ metadata ที่หายไม่สร้าง fake usage/zero cost. Project UI แสดงข้อมูลที่ API รายงานและต้นทุน unknown หรือ estimated USD ไม่ใช่ invoice/balance.

ต้นทุนใช้ optional private `ACF_AI_PRICING_JSON`: JSON array ของ `{provider,model,inputUsdPerMillion,outputUsdPerMillion,cachedInputUsdPerMillion?,verifiedAt}`. ใช้เฉพาะ model ที่ตรง มีหนึ่ง verified rate/date ไม่อยู่อนาคต; cached tokens ต้องมี cached rate จึงประมาณได้. ไม่มีราคาหรือ free-tier default; Owner ใส่อัตราที่ตรวจจาก billing/pricing ที่ใช้จริง. Reasoning รวมใน output tokens อยู่แล้ว ไม่คิดซ้ำ. Retained50receipts ไม่ใช่ lifetime billing total.

## Gemini — checkpoint จริงและการดำเนินงานครั้งต่อไป

Key ตั้งด้วย Windows DPAPI แล้วตาม [คู่มือ backend](GEMINI_LOCAL_SETUP_TH.md). Backend ได้รับ `GEMINI_API_KEY` และ `ACF_GEMINI_FREE_TIER_CONFIRMED=true` ผ่าน private environment; ไม่มี key ใน frontend/Git. [ผลทดสอบจริง](GEMINI_LIVE_RESULT_20261011_TH.md) บันทึกสิบไอเดีย/หนึ่ง selection ที่ผ่าน และ expansion `AI_REQUEST_FAILED` ซึ่งไม่มี HTTP status/reason ของครั้งเดิม.

ห้ามรัน `Start` หรือ verifier แบบสร้าง canary ใหม่ซ้ำ: helper สร้าง storage ใหม่ทุกครั้ง และสิทธิ์ทดสอบหนึ่งรอบใช้แล้ว. ขั้นตอนถัดไปต้อง Owner อนุมัติ retry เฉพาะ expansion อีกหนึ่งครั้งบน canary เดิม. ก่อนดำเนินการ ตรวจไม่มี active jobs, สำรองฐานข้อมูลและตรวจ schema compatibility แล้วเปิด runtime ที่มี diagnostics โดยใช้ storage เดิม. ใช้ normal canary authentication/CSRF; ห้ามอ่าน session จากฐานข้อมูลหรือใช้บัญชี Owner. `POST /api/jobs/:id/retry` หนึ่งครั้งจะสร้าง expand job ใหม่และรักษา failed job เดิม ไม่สร้างสิบไอเดียใหม่.

Verifier `--project-id` เป็นการอ่านสถานะเท่านั้น ไม่ retry/select/enqueue. Failed หรือหลาย expansion jobs จะหยุด `CANARY_STATE_UNSAFE`; ต้องตรวจ retry job ใหม่และ package ผ่าน normal API แยกโดยไม่ส่ง generation เพิ่ม. ตรวจจำนวน/ภาษา/scene references ด้วย contract เดิม และบันทึกเฉพาะ IDs/status/usage/diagnostic allowlist. ถ้าคำขอกำกวมหรือหมดเวลารอ ให้เก็บ IDs และตรวจสถานะ ห้ามส่ง POST ซ้ำ. Usage ที่ไม่มีหลักฐานคง unknown.

คง `ACF_OPENAI_REQUESTS_APPROVED=false`, ไม่มี provider fallback/billing change และไม่เปลี่ยน mode ระหว่างงาน. Gemini/provider/verifier regression 42/42 ผ่านด้วย injected responses; ไม่ใช่หลักฐาน live expansion. [Verifier](../scripts/verify-gemini-live.mjs), [regressions](../tests/gemini-live-verifier.test.ts).

## Google Drive — exact Owner setup

1. เลือก Google Cloud project ของแอป เปิด Drive API และตั้ง OAuth consent; หากเป็น External/Testing เพิ่มบัญชี Owner เป็น test user.
2. สร้าง OAuth Web client ลงทะเบียน `http://127.0.0.1:3006/api/integrations/drive/callback` ให้ตรงกับ origin ที่เปิดจริง.
3. Inject server `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ACF_DRIVE_ALLOWED_REDIRECT_URIS` (สองค่า URI ตรง callback เดียวกัน), `ACF_TOKEN_ENCRYPTION_KEY` (canonical Base64 random32bytes). เก็บ encryption key เดิมอย่างปลอดภัยข้าม restart; ไม่ส่ง key/token/code ใน chat.
4. Restart แบบรักษา original storage ตาม [Owner run guide](release/LOCAL_OWNER_RUN.md), loginปกติ→Storage→Connect→Ownerอนุมัติใน Google. ไม่มี automation consent/login; Testing refresh-token lifetime ต้องตรวจตาม [Google OAuth](https://developers.google.com/identity/protocols/oauth2).
5. เมื่อ grant พร้อม รัน explicit verifier จากสาขา Phase2 โดยส่ง `ACF_VERIFY_USERNAME`/`ACF_VERIFY_PASSWORD` ใน private process environment: `node scripts/verify-drive-live.mjs --origin http://127.0.0.1:3006`. ห้ามใส่ password ใน command line. HTTPS ต้องระบุ `--approved-https-origin` ที่ตรง origin ที่ Owner อนุมัติ.

Verifier login/CSRF ปกติ ตรวจ Drive readiness ก่อนสร้างข้อมูล และสร้าง synthetic canaryใหม่/PNG1×1/prepare6categories/uploadครั้งเดียว/pollbounded/downloadremote+local ตรวจ MD5/SHA256/size/metadata/logout. ไม่มี AI call, mode switch, retry, deletion หรือการใช้ browser/session DB ของ Owner. Canary/local files คงไว้ทั้ง success/failure. ไม่รันใน npm test/build; testsใช้fakeHTTPเท่านั้น.

Verifier รายงาน restore `NOT_TESTED_NO_CACHE_EVICTION_API`: cache ที่มีอยู่ไม่ยืนยัน restoration และไม่มี eviction API. Live restore/interruption/retry acceptance ต้องทำแยกบน canary ที่ Owner อนุมัติ. ห้ามลบ localmedia/cutoverจน verifyremoteintegrityและOwnerอนุมัติ. Adapter จำกัด128MiBต่อไฟล์ ณ checkpoint. [Storage implementation/OAuth](DRIVE_STORAGE.md), [Google consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent).

## Cloud/worker deployment gates

Connected inventory ยังไม่มี approved active AIContentFactory Supabase project; ไม่ reuse/reactivate unrelated projects. ไม่มี app-specific URL/secret/host authorization. Existing SQL/RLS/lease runner เป็น review-only foundation และ injected tests; SQLite/auth/local files/FFmpeg คงเดิม. ห้าม apply draft SQL/migrate/deploy/paid provision จน Owner อนุมัติ.

Hosting ต้อง always-on HTTPS/control-plane+durablePostgreSQL+server-onlyAIcredentials+securecookies/origins+privateDrivecatalog+monitoring. Existing `claim(workerId,target)` เป็น trusted server executor; ห้ามนำไปเปิด public paired-worker endpoint. ก่อน pairingต้อง broker credentialแบบhashed/owner-bound/expiry/revoke และ atomicowner-filteredclaim, ไม่มี Supabase/Drive secrets ส่งไป worker.

เตรียม pure presence/reconnect helper ใน [presence](../server/cloud/presence.ts) และ [contract](../shared/worker.ts): broker-issued epoch, monotonic sequence, server timestamp, owner binding, revoke fence และ TTL90s. Connection ต้อง heartbeat ก่อน eligible; exact TTL ถือ offline. Queued local export ไม่มี eligible worker ของ Owner จึง derive WAITING_FOR_WORKER; cloud/running/terminal job ไม่เปลี่ยน. Ten injected tests ผ่าน รวม lease expiry ไม่ถูก presence/reconnect ต่ออายุหรือ replay. นี่เป็น PREPARED module ไม่มี authenticated broker/routes, durable presence CAS หรือ active UI.

Worker protocolที่ยังต้อง implementหลัง deployment prerequisites พร้อม: outboundHTTPS enrollment→presenceheartbeat→owner-scopedclaim→leasedjobheartbeat/progress→verifiedreceipt. Presenceกับjobleaseเป็นคนละสถานะ. Reconnectอ่านdurablestate/receiptเดิม, fence stalelease, ไม่ replayfailedpaidAI. Media receiptต้องผูก owner/project/job/revision/hash/size และตรวจ actual private file; foundation exportId อย่างเดียวไม่พิสูจน์ไฟล์. ยังไม่มี production pairing/media bridge/WAITING_FOR_WORKER UI. Durable cloud job ต้อง freeze provider/model/provenance ก่อน cloud AI activation; process-local mode lock อย่างเดียวไม่เพียงพอหลัง restart.

Acceptance cloud: approvedHTTPSURL, real durablequeue/auth/cloudAI, mobile statusหลัง notebookdisconnected, offline workerexportwaiting/reconnectพร้อมnonduplicatecompletion. ไม่มี proof นี้จึงไม่เรียก notebook-offlineว่า complete. [Cloud foundation](CLOUD_CONTROL_PLANE.md), [Architecture](SYSTEM_ARCHITECTURE.md).

## Video production

FlowยังprimaryและOwner-operated: scenes/ENprompts/THexplanations/refs/durations/9:16หรือ16:9/verifiedcreditbudget→Flowclips→scene matching/import→deterministiceditor→MP4. Google Flow direct automation, Meta support และ publishingไม่ได้เปิด. Facebook/YouTube ใช้ exportedMP4ตามratioที่เลือก; Ownerตรวจplatformrequirements/creativequalityก่อนpublishเอง. Variable story12–180sไม่บังคับdailyquota; rates/budgetผู้ใช้ตรวจเอง ไม่มีใช้Flowcreditsอัตโนมัติ.

NEXT_TASK: เมื่อ private Gemini key+Free Tier confirmation พร้อม ตรวจ Phase2 runtime แบบแยกแล้วทำ one-request ideas canary/resumeตามด้านบน; Ownerเลือกหนึ่งก่อน expand. Drive ต้อง private OAuth config+consentก่อน live roundtrip/approved restore. App-specific Supabase/HTTPS host/schema/deployment approval และ owner-scoped claim/provider freeze/media bridge ยังเป็น cloud gates. Antigravity evidence ddccf9c/PASS ครอบคลุม RC3e9c1aa. Usage ตรวจหลัง Owner proceed แล้ว ล่าสุดเหลือ45%/32%, ยังไม่ถึง7%; ไม่มี background Codex scheduler.
