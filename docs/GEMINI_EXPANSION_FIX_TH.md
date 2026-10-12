# Gemini expansion — ผลแก้ไขและตรวจแบบ offline

ตรวจ offline: 2026-10-11; อัปเดต checkpoint: 2026-10-12 (Asia/Bangkok)

สถานะ: **OFFLINE_EXPANSION_FIX_VERIFIED_LIVE_APPROVAL_PENDING**

Source ที่ทดสอบ: `921ce7b32b795defd41e784ff893b31df2588dfa`

แก้เฉพาะ Gemini adapter และการตรวจผลภายใน backend ไม่เปลี่ยน React/Vite,
Express/SQLite, API, Shared StoryPackage, queue, UI หรือฐานข้อมูลเดิม
Checkpoint นี้ **0 live Gemini requests / 0 Models API requests / 0 OpenAI requests**
ไม่มี automatic retry, paid fallback หรือการเปลี่ยน Billing

## หลักฐานและข้อจำกัดของ root cause

การสร้างสิบไอเดียจริงก่อนหน้านี้สำเร็จ แต่ expansion ล่าสุดบน source `1538c58`
ได้ HTTP 400 / `INVALID_ARGUMENT` / `PARSED_ERROR` ข้อมูลที่เก็บไว้ไม่มี
Google message, reason หรือ invalid field จึง **ยังพิสูจน์พารามิเตอร์ที่ถูกปฏิเสธไม่ได้**
ผลนี้เป็นข้อมูลย้อนหลัง ไม่ใช่ผลทดสอบ source ที่แก้ใน checkpoint นี้
ดู [ผล live เดิม](GEMINI_DIAGNOSTIC_RESULT_20261011_TH.md)

เปรียบเทียบ request ที่สร้างจาก source ก่อนแก้กับ request ใหม่โดยใช้ injected
transport และข้อมูลสังเคราะห์ ไม่มีการส่งไป Google:

| ตัวชี้วัด schema ที่ส่ง | Ideas เดิม/ใหม่ | Expansion เดิม | Expansion ใหม่ |
| --- | ---: | ---: | ---: |
| ไบต์ JSON UTF-8 | 689 / 689 | 2,281 | 1,568 |
| object schemas | 5 / 5 | 11 | 5 |
| properties รวม | 11 / 11 | 36 | 26 |
| ความลึก JSON สูงสุด | 8 / 8 | 8 | 7 |
| คู่ minItems/maxItems | 1 / 1 | 5 | 0 |
| คู่ minimum/maximum | 0 / 0 | 2 | 0 |

Ideas wire schema มี SHA256 ตรงกับเดิม ส่วน expansion ลดจำนวน properties,
localized wrappers และ constraints ที่ส่งออก ค่าข้างต้นนับจาก JSON จริงที่ adapter
สร้าง ไม่ใช่การประมาณจากจำนวนบรรทัด หลักฐานและ hashes อยู่ใน
[audit แบบปิดบังข้อมูล](GEMINI_EXPANSION_REDUCTION_AUDIT.json)

[คู่มือ structured output ของ Google](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
ระบุว่า schema ขนาดใหญ่หรือซ้อนลึกอาจถูกปฏิเสธ และแนะนำลด nesting/constraints
นี่เป็น **สมมติฐานที่ใช้เลือกวิธีลดความเสี่ยง** ไม่ใช่หลักฐานว่า error เดิมเกิดจาก schema
ข้อจำกัด min/max ที่เอาออกจาก wire ไม่ได้ถูกพิสูจน์ว่าเป็น parameter ที่ไม่รองรับ
[REST reference](https://ai.google.dev/api/generate-content) ยังระบุ
`responseJsonSchema`/`responseMimeType`; จึงไม่เปลี่ยน endpoint/version/envelope
พร้อมกันโดยไม่มีหลักฐาน

## สิ่งที่แก้

- `server/ai/gemini.ts`: expansion ใช้ draft ที่แบนลงและส่งเฉพาะ structural schema
  keywords ได้แก่ type, properties, required, additionalProperties และ items
  Ideas request ไม่เปลี่ยน Prompt ส่งเฉพาะ brief และ idea ที่เลือก พร้อมกำหนด field,
  จำนวนฉาก/ตัวละคร/สถานที่ ระยะเวลา และความต่อเนื่อง
- `server/ai/gemini-expansion.ts`: ตรวจ draft แบบ strict แล้วประกอบเป็น StoryPackage
  ด้วยสี่ขั้นตอนภายในเครื่อง: A เรื่องและโครงเรื่องสองภาษา; B ตัวละคร/สถานที่;
  C ฉาก/continuity; D คำอธิบายไทย/Flow prompts อังกฤษและ final contract validation
- backend สร้าง `character_1`, `location_1`, `scene_1` และลำดับจาก array
  จึงไม่ให้โมเดลสร้าง ID/ลำดับซ้ำซ้อน อ้างอิงตัวละครและสถานที่ด้วย integer แบบ 1-based
  แล้วตรวจว่าชี้ไปยัง bible จริง ไม่ซ้ำ ไม่เป็นเศษส่วน และไม่อยู่นอกช่วง
- ใช้ขอบเขต field จาก Shared schemas เดิม และตรวจจำนวนสมาชิก, ความยาว,
  total duration <=180 วินาที และ references **ภายใน backend ทั้งหมด**
  ผลผิดจะเป็น `AI_INVALID_OUTPUT` ไม่เติมข้อความ ตัดข้อความ clamp ค่า
  ซ่อม JSON หรือสร้างเนื้อหาทดแทนเอง
- บท/คำแปล/คำอธิบาย/Flow prompt ยังคงเป็นเนื้อหาที่ AI แต่งจาก draft เดียว
  คง complete English prompt ตามที่ได้รับ ไม่สร้าง action/camera จาก fragment
  หรือแอบใช้ Mock เป็นผลจริง

ทั้ง A–D เป็นการตรวจและแปลงในเครื่อง **ไม่ใช่สี่คำขอ AI**
หนึ่ง expansion ยังคงหนึ่ง `generateContent` เท่านั้น ใช้ fixed model
`gemini-3.5-flash-lite`, `v1beta`, `store:false`, candidateCount=1,
maxOutputTokens=12000 และ deadline 120 วินาทีเหมือนเดิม
การบันทึก usage, diagnostics, cancellation, cache, owner isolation และ queue เดิมคงอยู่
โมเดลอยู่ใน [เอกสาร Google](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
และเคยสร้าง ideas ได้จริง แต่ยังไม่ได้ยืนยันว่า request ใหม่จะถูกยอมรับหรือผ่านคุณภาพจริง

## ผลตรวจที่รันจริง

- ชุดเจาะจง provider/expansion/routing/integration/verifier/usage: **62/62 ผ่าน**
  ใช้ injected transports, fixtures และ loopback API บนฐานข้อมูลทดสอบ
- `npm.cmd test`: **227 รายการ / 226 ผ่าน / 0 ล้มเหลว / 1 ข้าม**
  รายการข้ามเป็น POSIX vault permission test บน Windows
  รวม auth/owner isolation/persistence/queue interruption/cancel/retry,
  cached ten ideas, selected-only expansion, safe failure preservation,
  Drive/cloud mock regression และการสร้าง MP4 จริงจาก synthetic assets ด้วย FFmpeg/FFprobe
- `npm.cmd run build`: ผ่าน รวม typecheck ทั้ง frontend/backend/tests, API compile,
  Vite และ PWA build; `npm.cmd run lint`: ผ่าน ไม่มี warnings
- independent source review: READY / ไม่พบ P1/P2 ใน adapter และ local assembler
  hashes ที่ reviewer ตรวจตรงกับ source ที่รันทดสอบ
- เพิ่ม regressions ใน `tests/gemini-provider.test.ts` และ
  `tests/gemini-expansion.test.ts`: wire keyword allowlist, Ideas ไม่เปลี่ยน,
  multi-character/location refs, strict output, exact prompt preservation,
  one-attempt HTTP/quota failure, cancellation, failed output preservation,
  explicit injected retry, duplicate-job guard และ reopen persistence

การ retry ใน tests เป็น transport สังเคราะห์ที่ทดสอบ owner action เท่านั้น
ไม่มีสิทธิ์ retry live โดยอัตโนมัติ ไม่ rerun browser/responsive/actual playback ใหม่
เพราะ UI/editor ไม่เปลี่ยน หลักฐาน browser เดิมยังผูก source เดิม
ไม่มี live Google Drive, Supabase, cloud deployment หรือ notebook-offline verification

คำสั่งเจาะจงที่รัน:

```text
node --import tsx --test --test-concurrency=1 tests/gemini-provider.test.ts tests/gemini-expansion.test.ts tests/ai-provider-routing.test.ts tests/ai-integration.test.ts tests/gemini-live-verifier.test.ts tests/ai-usage.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run lint
node .tmp/capture-gemini-expansion-reduction.mjs
node .tmp/check-gemini-expansion-offline-preservation.mjs
```

## ข้อมูลเดิมและการใช้งาน local

Canary เดิม `cc629e54-668e-4ff1-82fe-c5904b4edbcc` ยังมีสิบ real ideas,
หนึ่ง selection, สี่ jobs, ศูนย์ active jobs และยังไม่มี package
ตรวจ schema/users/projects/jobs/clips/exports ทั้งแถวด้วย read-only hashes
ก่อน–หลังงาน offline ตรงกัน ไม่มีการแก้ SQLite โดยตรงหรือ migration
ไม่อ่าน/เผยแพร่ API key, private credentials, raw Google error หรือเนื้อหาเรื่องจริงใน audit

Owner storage และ Premium Cinematic UI แยกจาก canary เดิม
ตรวจบัญชี/ข้อมูล/สื่อด้วย read-only baseline; การกลับมารัน Local V1 ใช้ release เดิม
ใน Mock Mode พร้อม environment ที่ไม่มี AI/Drive/Supabase credentials
สถานะ runtime และผล preservation ล่าสุดดู `geminiExpansionReduction.owner3006`
ใน [QA record](PHASE2_QA.json)

## แผน live ที่ต้องได้ Owner approval ใหม่

**คาดหมายสูงสุดหนึ่ง Gemini Free Tier request เฉพาะ expansion ของเรื่องที่เลือกเดิม**
ยังไม่มีสิทธิ์ส่งตอนนี้ สิทธิ์เก่าใช้ครบแล้ว แม้ผลเก่าจะเป็น HTTP400

1. เมื่อ Owner อนุมัติชัดเจน ให้ยืนยัน API project ยัง Free Tier/Billing disabled
   และ private `GEMINI_API_KEY` + `ACF_GEMINI_FREE_TIER_CONFIRMED=true`
   key เพียงอย่างเดียวและ Gemini subscription ไม่ยืนยัน API tier
2. ใช้ source ที่ commit/review/tests ผ่าน ตรวจ consistent backup/integrity/schema,
   cached ten ideas/selection/history และ active jobs=0 ก่อน start isolated canary3013
   ไม่เปลี่ยน Owner3006 เป็น Gemini
3. สร้าง helper/marker/log ใหม่แบบ exclusive สำหรับ budget=1
   ห้าม rerun/reset used helpers/markers ของ diagnostic ครั้งก่อน
4. ใช้ normal canary login/CSRF ส่ง POST retry ของ failed expansion เดิม
   `3d7b6ca4-00e8-4523-8d7f-78fef2c1038c` เพียงครั้งเดียว แล้วใช้ GET polling
   ค่า ambiguous timeout ไม่ถือเป็นเหตุให้ส่ง POST ซ้ำ
5. เกณฑ์ผ่าน: package ผ่าน Shared contract, story/bibles/continuity/scenes,
   คำอธิบายไทย/English Flow prompts ครบ และข้อมูลเดิมอยู่ครบ เก็บ usage
   เฉพาะค่าที่ Google รายงานจริง ไม่สมมติ token/cost ที่หายเป็นศูนย์
6. หาก HTTP/validation/quota/timeout ล้มเหลว ให้หยุดและรายงาน diagnostics ที่ปิดบังข้อมูล
   ไม่ retry, ไม่ Models probe, ไม่สร้างสิบไอเดียใหม่, ไม่เรียก OpenAI,
   ไม่สลับ paid tier/model และไม่เปิด Billing

Drive ยังรอ OAuth/consent/live round trip; Cloud รอ approved Supabase/HTTPS/schema/deployment
และ disconnected-notebook proof คง Local V1 ไว้ ไม่ cutover media, ไม่ publish,
ไม่ deploy และไม่ merge PR #2/#3 ก่อน Owner approval
