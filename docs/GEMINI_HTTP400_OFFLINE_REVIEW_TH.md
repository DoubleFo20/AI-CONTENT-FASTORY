# วิเคราะห์ HTTP 400 แบบ offline — 2026-10-11

STATUS: OFFLINE_REVIEW_COMPLETE_LIVE_APPROVAL_PENDING

Owner เลือกคง Mock และยังไม่อนุมัติ Gemini request เพิ่ม Checkpoint นี้มี **0 live Gemini requests และ 0 Models API requests** ตรวจ source หลักฐานเดิม และเอกสาร Google ทางการ โดยทดสอบผ่าน injected transport กับข้อมูลสังเคราะห์เท่านั้น ไม่ถอดรหัส private key ไม่เปลี่ยน Billing ไม่เรียก OpenAI และไม่เปลี่ยนแอป Owner ที่พอร์ต 3006

## ข้อสรุปและหลักฐาน

**ยังพิสูจน์ root cause ของ expansion HTTP 400 ไม่ได้** Runtime `bf276fb` เก็บเพียง HTTP 400, phase `http` และ `AI_REQUEST_FAILED` เมื่อ `2026-10-11T01:42:47.427Z` ไม่เก็บ Google error body, status หรือ reason จึงไม่มี response ที่นำมาปิดบัง key ย้อนหลังได้ ไม่สร้างข้อความ Google สมมติขึ้นมาแทนหลักฐานจริง ส่วน expansion รอบแรกยังไม่ทราบ HTTP status

| สิ่งที่ตรวจ | ผล offline และข้อจำกัด |
| --- | --- |
| Model ID | `gemini-3.5-flash-lite` ตรงกับ stable model ทางการและรองรับ structured output ไอเดียจริงเดิมใช้ ID เดียวกันและสำเร็จ ไม่ได้เรียก Models API เพื่อตรวจสิทธิ์บัญชีปัจจุบัน |
| Endpoint/version | POST `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent` ตรงกับ REST reference; key อยู่ header ไม่อยู่ URL หรือ body |
| Payload | `store:false`, text-only `systemInstruction`/`contents`, `candidateCount:1`; ไม่มี tools, grounding หรือ paid service tier ไอเดียและ expansion ใช้ envelope เดียวกัน ต่างที่ prompt, schema และ budget |
| Generation config | Budget 6,000/12,000 ต่ำกว่า output limit 65,536; `responseMimeType`/`responseJsonSchema` ยังอยู่ใน reference แต่ Google แนะนำ `responseFormat.text` แทน ความต่างนี้ยังไม่พิสูจน์ว่า request เดิม invalid เพราะไอเดียผ่านด้วยรูปแบบเดิม |
| Generated schema | Ideas: 689 bytes/23 JSON containers/depth 8; expansion: 2,281 bytes/64 containers/depth 8 Keywords และ bounds อยู่ใน subset ที่รองรับ และ server ยังตรวจ full schema กับ semantic constraints |
| Google error response | หลักฐานเดิมมี HTTP 400 แต่ไม่มี status/reason/body จึงแยก `INVALID_ARGUMENT` จาก `FAILED_PRECONDITION` ไม่ได้ และยังไม่ยืนยัน schema complexity, region หรือ quota |
| Free Tier/project rights | โมเดลมี Standard Free Tier แต่ tier ของ project และ Billing disabled เป็นคำยืนยันเดิมของ Owner ไม่มี account/billing telemetry หรือการตรวจสิทธิ์ใหม่ การสร้างไอเดียเดิมสำเร็จไม่พิสูจน์สิทธิ์หรือ quota ปัจจุบัน |

Model/capabilities/limits: [Google model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) Endpoint/request fields: [GenerateContent reference](https://ai.google.dev/api/generate-content) รูปแบบแนะนำและข้อจำกัด schema: [Structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) Free Tier ของโมเดลไม่ได้ยืนยัน tier ของ project: [Pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), [Billing](https://ai.google.dev/gemini-api/docs/billing) HTTP 400 มีหลาย status: [API errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors)

ตัวอย่าง `responseFormat.text` ใน structured-output guide ใช้ MIME string แต่ TextResponseFormat reference อธิบายเป็น enum จึงยังไม่ทดลองเปลี่ยน wire format บน model/account ที่ไม่มี live approval รักษารูปแบบที่เคยสร้างไอเดียสำเร็จ พร้อม endpoint, model, schema และ budget เดิม บันทึกความต่างของเอกสารไว้พิจารณาร่วมกับ error ที่ตรวจได้ในอนาคต ไม่อ้างว่าเป็นสาเหตุ HTTP 400

## ส่วนที่แก้โดยไม่เรียก Google

แก้ช่องว่างของ diagnostics ที่เคยกลืน JSON parse failure เพิ่ม `errorResponse` enum: `PARSED_ERROR`, `INVALID_ENVELOPE`, `MALFORMED_JSON`, `BODY_READ_FAILED` และ `invalidField` enum จาก trusted `google.rpc.BadRequest` เฉพาะ `INVALID_ARGUMENT` ไม่เก็บ field path, description, actual message, key, prompt หรือ header Unknown/malformed data ไม่ถูกสรุปเป็น root cause

จำกัด metadata ที่ตรวจเป็น 16 details, 16 violations และ field ไม่เกิน 512 characters ส่วน raw HTTP body ยังใช้ `Response.json()` และ deadline เดิม ไม่มี byte cap ใหม่ `PARSED_ERROR` หมายถึงอ่าน envelope ได้เท่านั้น และ `invalidField` รายงานหนึ่ง category ไม่ใช่ทุก field ที่ผิด

Tests ตรวจ schema ที่ provider สร้างจริงสำหรับ ideas/expansion, keywords, object required, additional properties, bounds และ token limit พร้อม fixtures สำหรับ malformed/untrusted/private Google errors ทั้งหมดใช้ injected transport และไม่มี retry/fallback เพิ่ม [Offline audit JSON](GEMINI_HTTP400_OFFLINE_AUDIT.json) บันทึก request ที่ปิดบัง header key และละ story data พร้อม schema และ source hashes; artifact นี้เป็น synthetic capture ไม่ใช่ Google response ใหม่

## ผลตรวจที่รันจริง

| Command / การตรวจ | ผล |
| --- | --- |
| `node --import tsx --test --test-concurrency=1 tests/gemini-provider.test.ts tests/ai-provider-routing.test.ts tests/gemini-live-verifier.test.ts tests/ai-integration.test.ts tests/ai-usage.test.ts` | 56/56 ผ่าน, 0 failed/0 skipped; injected/synthetic |
| `npm.cmd run build` | ผ่าน รวมสาม typechecks, API compile, Vite และ PWA build |
| `npm.cmd run lint` ครั้งแรก | พบ `no-useless-escape` 6 จุดใน diagnostic regex; แก้เป็น alternation ที่มีความหมายเดิม |
| `node --import tsx --test --test-concurrency=1 tests/gemini-provider.test.ts` หลังแก้ regex | 21/21 ผ่าน, 0 failed/0 skipped |
| `npm.cmd run lint` หลังแก้ regex | ผ่าน |
| Injected audit capture | 2 injected calls; 0 Google calls; source/schema hashes ถูกบันทึกใน audit JSON |
| GET Owner3006 | `/`, `/api/health`, `/api/auth/status` = 200; anonymous `/api/projects` = 401 |
| Read-only Owner preservation | 1 owner/1 project/4 jobs/10 cached Mock ideas/0 active/0 clips/0 exports; baseline preserved, ไม่มี database writes |
| Independent source review | READY, ไม่มี P1/P2; source/tests review เท่านั้น ไม่ใช่ live proof |

Full suite/MP4/browser/responsive evidence ยังผูกกับ checkpoint เดิม ไม่ได้รันใหม่สำหรับ delta นี้ เพราะ UI/editor/request generation behavior ไม่เปลี่ยน Build ก่อนแก้ regex ผ่าน ส่วนการแก้ regex ตรวจด้วย narrow provider tests และ lint หลังแก้แล้ว ดู validation เพิ่มเติมใน [PHASE2_QA.json](PHASE2_QA.json)

## ขั้นตอนต่อไปที่ต้องอนุมัติ

คง Owner3006 RC/Mock/Premium UI และรักษา 10 real ideas, selection, 3 canary jobs, markers และ backups เดิม Runtime3013 ที่ตรวจครั้งก่อนเป็น PID17440/source `bf276fb` ยังไม่โหลด diagnostics ใหม่ Checkpoint นี้ไม่ restart หรือ enqueue

เสนอทดสอบ **selected-only expansion เพียง 1 Gemini request** บน canary เดิม เพื่อเก็บ structured status, invalid-field category, canonical issue หรือ package ที่ validate แล้ว โดยต้องได้รับ Owner approval ใหม่ก่อน ไม่ generate ideas ใหม่ ไม่เรียก Models API ไม่ส่ง POST ซ้ำเมื่อ response กำกวม ไม่เปลี่ยน provider/model/Billing

ก่อนส่งต้องใช้ reviewed source, consistent backup, ตรวจ 0 active jobs/schema/pinned history และ marker ใหม่ที่จำกัดหนึ่ง attempt Helpers ที่ใช้ไปแล้วห้าม reset/rerun การเพิ่ม diagnostics ไม่รับรองว่า request ถัดไปจะสำเร็จ และยังไม่ได้แก้สาเหตุที่ไม่ทราบของ HTTP 400

Drive ยังต้อง OAuth/consent และ live upload/download/restore ส่วน Cloud ต้อง approved Supabase/HTTPS/schema/deployment และ notebook-offline proof Foundation กับ injected tests เดิมพร้อม ไม่อ้างว่าบริการจริงครบแล้ว PR#2/PR#3 คง Draft/unmerged ไม่มี main merge, public deploy หรือ content publish
