# Gemini Free Tier — Selected Story Expansion สำเร็จ

ตรวจจริงวันที่ 2026-10-12 (Asia/Bangkok) บน source `8f95c1640d461d6ddf8f47dbc778988b19f83c7c`
จาก Draft PR #3 ซึ่งรวม compact expansion implementation `921ce7b`

STATUS: **LIVE_GEMINI_SELECTED_EXPANSION_VERIFIED**

Owner อนุมัติหนึ่งคำขอใหม่ ทดสอบเฉพาะเรื่องที่เลือกใน Canary เดิม
ใช้สิทธิ์ครบ **1/1 Gemini generateContent request** ไม่มีการสร้าง ideas ใหม่,
automatic retry, Models API, OpenAI, paid fallback หรือเปลี่ยน Billing
คำตอบยืนยันการอนุมัติที่ส่งมาภายหลังถือเป็นรอบเดียวกัน ไม่เพิ่มงบคำขอ

## ผลจริง

Job `94d8afeb-66e7-4c7f-99b6-b15f1899e782`:
queued 0% → running 15% → completed 100% ผ่าน Shared StoryPackage validation
ใช้ `gemini-3.5-flash-lite` บน official v1beta generateContent ตาม adapter เดิม

| รายการ | ผลตรวจ |
| --- | --- |
| สิบ real ideas เดิม / selected idea เดิม | คงเดิม; ไม่สร้างหรือเลือกใหม่ |
| Story Bible | ไทยและอังกฤษ พร้อม premise, ปริศนา, เฉลย และบทสรุป |
| Character Bible | 2 ตัวละคร พร้อมลักษณะภาพอังกฤษและ background สองภาษา |
| Location Bible | 1 สถานที่ พร้อมลักษณะภาพอังกฤษและคำอธิบายสองภาษา |
| Continuity Bible | 2 กฎสองภาษา |
| Scene Breakdown | 3 ฉาก ลำดับ 1–3, 6 + 6 + 8 = 20 วินาที, references ถูกต้อง |
| Narration / scene title | ไทยและอังกฤษทุกฉาก |
| Scene explanations / Flow prompts | คำอธิบายไทยและ prompt อังกฤษครบทุกฉาก |
| Canonical assisted Flow prompt compiler | เติม appearance/สถานที่/continuity/scene ID/9:16/duration/ชื่อ scene_N.mp4 ครบ โดยไม่แก้ raw AI prompt |
| Expansion usage ที่ Google ส่งกลับ | input 624 / output 1,291 / total 1,915 tokens |
| Ideas usage เดิม | input 254 / output 1,307 / total 1,561 tokens; receipt เดิมคงอยู่ |

ตรวจเนื้อหาจริงแบบ read-only: บทขยายไอเดียที่เลือกเรื่องตู้ปันสุข,
ตัวละครหลักและสถานที่สอดคล้องกับไอเดีย ไม่มีการปะปน alternative ideas หรือ Mock label
สามฉากครอบคลุมการตั้งตู้ ของที่หายไป และการเฉลย ช่วงบทสรุปชาวบ้านร่วมเติมตู้
อยู่ใน Story Bible แต่ไม่ได้แยกเป็นฉากท้ายเพิ่มเติม จึงควรให้ Owner ตรวจจังหวะการเล่าเรื่อง
ก่อนผลิตวิดีโอจริง การตรวจนี้ไม่ใช่การรับรองคุณภาพภาพ/เสียงจาก Google Flow

## Free Tier และ Billing

ตรวจ Google AI Studio ผ่าน browser แบบ read-only ก่อนคำขอ:
หน้า Projects และแถว API key ที่ตรงกับ backend แสดง **Free tier**;
หน้า Billing แสดง **No billing account** ไม่กด Set up billing หรือเปลี่ยนบัญชี
เปรียบเทียบ suffix ของ key ที่ UI ปิดบังกับ key ฝั่ง backend ภายในเครื่อง
และรายงานเพียง boolean; ไม่แสดง full key หรือข้อมูลบัญชีใน GitHub
นี่เป็นหลักฐาน dashboard ณ เวลาตรวจ ไม่ใช่ independent key-identity API query

ไม่มีค่าใช้จ่ายที่พิสูจน์จาก invoice/ledger และไม่ได้คำนวณราคาเป็นศูนย์
เก็บ `estimatedCostUsd: null`; token receipt ไม่รวม usage ของ expansion ที่ล้มเหลวก่อนหน้า
การมี Gemini subscription หรือ environment flag เพียงอย่างเดียวไม่ยืนยัน API tier

## การรักษาข้อมูลและขอบเขต

ก่อนส่ง: latest PR #3 ตรง Git HEAD, clean worktree, build/typecheck ผ่าน,
consistent SQLite backup และ integrity/schema check ผ่าน, 0 active jobs,
10 ideas/selection/history ถูก pin และ independent helper review READY/no P1/P2
ใช้ normal canary session/CSRF, exclusive attempt marker ก่อน POST เดียว และ logout สำเร็จ

หลังส่งตรวจ read-only เทียบ backup/hashes:
schema, accounts, สิบ ideas, selection, 4 historical jobs, clips, exports และสื่อคงเดิม
เพิ่มเพียง completed expansion job ที่ห้า กับ package และ receipt ของผลใหม่ตาม API
Canary มี 0 active jobs ข้อมูล Owner และสื่อทุกไฟล์ตรง baseline
Owner พอร์ต 3006 ยัง process/release เดิมใน Mock Mode/Premium Cinematic V2;
health 200 และ anonymous projects 401 ไม่มี restart, activation, UI หรือ schema change

**ห้าม rerun/reset helper หรือ marker ที่ใช้แล้ว**; งบอนุมัติรอบนี้เหลือ 0
ไม่มี live Gemini request เพิ่มโดยไม่มี approval ใหม่

## Root cause และข้อจำกัด

compact draft/local A–D assembler ทำให้ expansion ครั้งนี้สำเร็จจาก request เดียว
เป็นหลักฐานว่าทางแก้ปัจจุบันใช้งานได้ใน canary นี้ แต่พารามิเตอร์ที่ถูกปฏิเสธใน
historical HTTP 400 / INVALID_ARGUMENT ยัง **NOT_PROVEN** เพราะ Google message/
invalid field เดิมไม่ได้ถูกเก็บ ไม่อ้างว่าสาเหตุเดิมถูกพิสูจน์ว่าเป็น schema complexity
ดู [offline audit](GEMINI_EXPANSION_FIX_TH.md) และ
[historical diagnostics](GEMINI_DIAGNOSTIC_RESULT_20261011_TH.md)

ไม่ได้สร้าง Flow clips จริง, ไม่ส่ง prompt ไป Flow, ไม่ export MP4 จากคลิปของเรื่องนี้
และไม่ได้เปิด Gemini บน Owner3006 Live proof นี้เป็น text pipeline ใน isolated canary
Google Drive และ cloud ยังรอ OAuth/authorization/approved hosting และ live acceptance
ไม่มี notebook-offline proof, main merge, production deploy หรือการเผยแพร่ content

## เทสต์ที่รันในรอบนี้

- New one-request harness: **15/15 ผ่าน**, injected transport เท่านั้น
- Gemini/provider/expansion/verifier/integration/usage: **62/62 ผ่าน**, injected/loopback fixtures
- Production/Flow compiler regression: **7/7 ผ่าน**, synthetic assets/fixtures
- Drive/cloud/worker: **69 รวม / 68 ผ่าน / 0 fail / 1 POSIX test ข้ามบน Windows**, mocks เท่านั้น
- `npm.cmd run build`: ผ่าน รวม frontend/backend/tests typecheck, API compile, Vite และ PWA build
- `npm.cmd run lint`: ผ่าน ไม่มี warnings; PowerShell parser checks: ผ่าน
- Read-only post-live preservation และ canonical Flow compiler บน cached real package: ผ่าน
- เอกสาร/PWA/secrets/staged diff checks: ผ่าน; secret scanner ตรวจ 181 tracked files
  public evidence verifier ตรวจ source hashes, historical evidence/QA และ local links ตรงกัน
- independent documentation review: READY / ไม่มี P1/P2 ค้างหลังแก้ข้อความสถานะเก่า

คำสั่งหลักที่รันจริง:

```text
node --test .tmp/approved-compact-expansion-offline.test.mjs
node --import tsx --test --test-concurrency=1 tests/gemini-provider.test.ts tests/gemini-expansion.test.ts tests/gemini-live-verifier.test.ts tests/ai-integration.test.ts tests/ai-usage.test.ts
node --import tsx --test --test-concurrency=1 tests/production.test.ts
node --import tsx --test --test-concurrency=1 tests/drive.test.ts tests/drive-project.test.ts tests/drive-live-verifier.test.ts tests/drive-abort.test.ts tests/cloud.test.ts tests/worker-presence.test.ts
npm.cmd run build
npm.cmd run lint
npm.cmd run validate:docs
npm.cmd run validate:pwa
npm.cmd run validate:secrets
git diff --cached --check
node .tmp/verify-compact-expansion-live-checkpoint.mjs
node .tmp/verify-approved-compact-expansion-result.mjs --review-content
node .tmp/check-compact-flow-production.mjs
```

ชื่อ `tests/ai-provider-routing.test.ts` ที่ระบุในเอกสาร checkpoint ก่อนหน้าไม่มีใน
checkout นี้ จึงไม่ได้อยู่ในคำสั่งจริงรอบนี้; ผล 62/62 ข้างต้นมาจากห้าไฟล์ที่ระบุชัด
ไม่แก้หลักฐานย้อนหลังเพื่อให้ดูเหมือนรันทดสอบใหม่
Full suite 227 รวม / 226 pass / 1 skip และ FFmpeg/FFprobe เป็นหลักฐาน source `921ce7b`
ที่ทำไว้ก่อนหน้า โค้ด application ปัจจุบันตรง source นั้น ไม่ rerun full suite,
responsive/browser/playback ใหม่ในรอบนี้ ไม่เรียก Mock tests ว่า live-provider tests

## ขั้นถัดไป

รักษา cached result และ prepare review ของ PR #3 กับ PR #2 โดยยัง Draft/unmerged
การเปิด Gemini บน Owner3006 ต้องได้อนุญาตขั้นถัดไปเพราะคำสั่งรอบนี้ห้ามเปลี่ยนแอปนั้น
Flow ยังคง assisted production: Owner ใช้ prompt pack, สร้าง/นำเข้าคลิป แล้วใช้ editor เดิม
การทดสอบ Drive จริงต้อง OAuth consent และอนุญาต canary round trip/restore;
cloud ต้อง approved Supabase/HTTPS/hosting/schema/deployment ก่อนพิสูจน์ notebook offline

หลักฐานที่ปิดบังข้อมูล: [ผลตรวจแบบ JSON](GEMINI_EXPANSION_LIVE_RESULT_20261012.json)
ไม่มี credentials, raw story, raw Google response หรือข้อมูลบัญชีในไฟล์นี้
