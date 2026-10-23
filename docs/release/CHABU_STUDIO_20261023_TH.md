# CHABU Studio — ผลการพัฒนาและตรวจจริง 2026-10-23

## A. สรุปสำหรับ Owner

สถานะ: Local Release Candidate สำหรับตรวจรับ ไม่ใช่การยืนยันทั้งโครงการพร้อม production
สร้าง CHABU ภายใน React/Vite + Express/SQLite เดิม รักษา Premium Cinematic V2
ไม่เปลี่ยน architecture, dependencies, lockfile หรือ schema ของฐานข้อมูลเดิม
Owner3006 เชื่อมต่อไม่ได้ตั้งแต่ตรวจ baseline; รอบนี้ไม่ได้เปิดใหม่หรือเปลี่ยนข้อมูล Owner
พัฒนาและทดสอบบน branch `codex/chabu-studio-mvp` จาก checkpoint `193e8b4`

## B. ทีมและ skills ที่ใช้จริง

- Root: shared contracts, Store/app wiring, integration, export freshness, queue projection, browser QA, Git และเอกสาร
- `chabu_backend_audit` / Sol High: audit auth/media/queue, CHABU backend+11 tests, independent integration review และแบบ Drive loader
- `chabu_ui_audit` / Luna Medium: audit UX, CHABU UI+TH/EN, mobile drawer และ form/recovery follow-up
- `baseline_qa` / Luna Medium: baseline checks, independent auth/file/queue review และ FFmpeg acceptance test
- ใช้ `ponytail-audit`, `ponytail`, `ponytail-review`, `frontend-design`, `web-design-guidelines`, `typescript-best-practices` และหลัก type-system-discipline
- อ่าน computer-use และใช้ CUA browser ที่รองรับจริง ไม่พบ REA MCP ที่เรียกใช้ได้ จึงไม่ได้อ้างว่าใช้ REA
- [Web Interface Guidelines ที่ใช้ตรวจ](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)

## C. สิ่งที่ implement

- เพิ่ม navigation และหน้าจอ CHABU แสดงจำนวนจริงของ character/product/episode/draft/waiting/imported clips/failed jobs
- Character/Product library แบบ append-only versions และภาพหลายมุม ใช้ uploads เดิมโดยไม่เขียนทับต้นฉบับ
- ปุ่ม CHABU/CHABUNG เติม metadata ตาม Owner เท่านั้น ไม่ seed ตัวละครหรืออ้างว่ารูปทรงผ่านการยืนยัน
- เก็บ verified/unverified/prohibited claims แยกกัน ไม่แต่ง specification หรือ affiliate URL
- ตอนตรึง character/product versions และ reference asset IDs ไม่ดึงเวอร์ชันล่าสุดมาเปลี่ยนตอนเก่า
- พรอมป์ต์ deterministic เริ่มต้น 4×10 วินาที แนวตั้ง 9:16; ปรับ 3–12 คลิป, 4–20 วินาที/คลิป, รวมไม่เกิน 180 วินาที ตามขอบเขต editor เดิม
- Character/Product/scene/lighting locks, Thai female narration/captions, affiliate CTA และ AI-content disclosure ในตอนใหม่
- Flow เป็น primary, Meta เป็น supporting manual handoff ผ่าน typed adapter metadata; ไม่มี video API ที่แต่งขึ้น
- คัดลอกพรอมป์ต์รายฉาก ดาวน์โหลด reference ต้นฉบับ และเปิดระบบนำเข้าคลิป/editor/preview/download เดิม
- Stable request ID ป้องกัน duplicate episode; retry ใช้ package ที่บันทึกไว้ ไม่ regenerate
- Explicit recovery ซ่อมเฉพาะ prepared project ที่ยังไม่ materialize จาก episode snapshot เดิม ไม่แก้ project ที่มีอยู่ ไม่เรียก AI
- แยก manual waiting/cancelled จาก queued/processing/completed/failed ที่คำนวณจาก durable project/job records
- ตรวจ clip duration ±0.75 วินาทีและ aspect ratio ก่อนบันทึก CHABU clips; rejects จะล้าง temporary upload
- ยกเลิกแบบ terminal ป้องกัน import/export/retry ใหม่; queue/FFmpeg ใช้กลไกเดิม
- Internal reference library ถูกซ่อนจาก public project list/dashboard และห้าม enqueue AI/export; flag อยู่ใน JSON ของ project ใหม่เท่านั้น
- เก็บ sidecar `settings/chabu/<ownerId>.json` แบบ bounded 4 MiB, schema/owner/version checks, atomic replace, no symlink/hardlink

ขอบเขต: local single-writer ตาม application lock เดิม; ยังไม่ใช่ cloud queue หรือ worker pairing
ภาพใน library จำกัด 50 รายการตาม upload lane เดิม และ UI ระบุว่า storage bytes ยังไม่ได้วัด

### API ใหม่

ทุก endpoint อยู่หลัง owner cookie authentication และ CSRF/origin protection เดิม:

| Method/path | หน้าที่ |
|---|---|
| GET `/api/chabu` | owner library + episode/project/job projection; ไม่เขียนเพื่อ repair |
| POST `/api/chabu/library` `{}` | เตรียม reference library แบบ idempotent |
| POST `/api/chabu/characters`, `/products` | สร้าง resource/version แรก |
| POST `/api/chabu/characters/:id/versions`, `/products/:id/versions` | append version ไม่แก้ของเก่า |
| POST `/api/chabu/episodes` | validated snapshots + deterministic prepared project; stable requestId |
| GET `/api/chabu/episodes/:id` | อ่าน owner episode/project |
| POST `/api/chabu/episodes/:id/stage` | เปลี่ยน manual waiting/draft/cancelled; ไม่เรียก provider |
| POST `/api/chabu/recover` `{}` | repair missing materialization อย่างชัดเจน โดยไม่ replay AI/jobs |

## D. UI/UX และ audit

แก้ P1: เปลี่ยน editor settings หลัง export แล้วเคย preview/download วิดีโอเก่า
ตอนนี้ stage/validate settings file ก่อน invalidate current export แล้ว atomic rename; ไม่ลบไฟล์ MP4 ต้นฉบับ
มี crash window ที่ invalidate สำเร็จแต่ rename ไม่สำเร็จ: แอปจะต้อง export ใหม่แทนการโฆษณาไฟล์ผิด settings

แก้ P1: More drawer เดิมไม่จัด focus/Escape/Tab loop; ใช้ native Modal เดิมและคืน focus ให้ปุ่มเปิด
เพิ่ม safe-area padding และแก้ transition: all โดยรักษา visual baseline; หลัง workflow ผ่านแล้วรวม 10 metric cards เป็น semantic definition list เดียวเพื่อลดความซ้ำและพื้นที่บนมือถือ
แก้ notice ค้างภาษาเดิมด้วย translation keys; required references และ validation แจ้ง TH/EN
ไม่ได้ทำ refactor ทั้ง repository หรือ redesign หน้าที่ยังทำงานอยู่; App ก่อน/หลัง 408/408 บรรทัด, CHABU component382บรรทัด, dependenciesเปลี่ยน0, metriccards10→0/definitionlist1 ([metrics](chabu-qa/code-metrics.json))

หลักฐาน synthetic canary เท่านั้น ไม่มี Owner credentials/content ในภาพ:

- [Before dashboard — ความกว้างจริง 1600px](chabu-qa/before-dashboard-1600.png)
- [CHABU desktop — ความกว้างจริง 1440px](chabu-qa/after-chabu-1440.png)
- [CHABU mobile TH — ความกว้างจริง 360px](chabu-qa/after-chabu-360-th.png)
- [ค่าที่วัดทั้ง 6 กรณี TH/EN](chabu-qa/responsive-results.json), [copy proof](chabu-qa/copy-proof.json), [playback proof](chabu-qa/browser-playback.json)

ภาพ Before/After เป็นคนละหน้าที่ต่างความกว้าง ไม่ใช่ pixel comparison ที่อ้างว่า viewport เท่ากัน
ตรวจจริง 360/768/1440px ทั้ง TH/EN ไม่พบ horizontal overflow; ภาษาและข้อมูลคงอยู่หลัง reload
ตรวจ More dialog: focus เข้า dialog, Escape ปิด, focus กลับปุ่มเดิม ผ่าน
ยังไม่ได้ตรวจ contrast ด้วยเครื่องมืออัตโนมัติทุก element หรือ physical-phone/PWA install acceptance ครบทุกกรณี

## E. ผลทดสอบจริง

| คำสั่ง/การตรวจ | ผล |
|---|---|
| `npm test` ชุดสุดท้าย | 273 tests: 272 PASS, 0 FAIL, 1 Windows POSIX skip |
| `npm run typecheck` | PASS ทั้ง client/server/tests |
| `npm run lint` | PASS, max warnings 0 |
| `npm run build` | PASS API/Vite/PWA; 9 public shell assets |
| CHABU component/recovery + queue projection | 12/12 PASS |
| Root synthetic 40s video acceptance | PASS import/export/FFprobe/full decode/reopen/auth download; 0 provider calls |
| Browser | login, reference upload, character/product/episode creation, copy 4 prompts, reload, navigation, 6 layouts, preview playback และ MP4 download ผ่าน |

Baseline ใน worktree เก่าเคย fail จาก sandbox EPERM สร้าง `.tmp`; worktree ใหม่รัน serialized suite ได้
การรัน narrow ครั้งแรกค้างหลัง failure; หยุด runner ของงานนี้และรันซ้ำแบบ bounded/serialized แล้วผ่าน รวมถึง final full suite ข้างต้น
Browser file chooser และ download tool บางครั้งใช้เวลาหลายนาที มี click timeout ที่ภายหลังตรวจพบว่าบันทึกสำเร็จ จึงไม่ส่งซ้ำสุ่ม
ยังไม่ได้พิสูจน์ upload คลิปทั้งสี่ผ่าน mobile browser chooser; ทดสอบ import ทั้งสี่ผ่าน actual API และ editor/preview ใน browser แยกกัน

## F. Media และ providers

- Root acceptance MP4: 40.021 วินาที, 720×1280, H.264/AAC, full decode ผ่าน เป็น `SYNTHETIC_MEDIA`
- Browser เล่นถึงท้าย 40.021333 วินาที, readyState 4, error null, 720×1280
- Browser download `story.mp4` ตรงกับไฟล์จาก API ทุก byte/SHA256:
  `C157F22E035955F12825297D3CBA26AC9042C6ABB98BBEAAB4FD8327E1AB0C25`
- API acceptance ยังตรวจ wrong duration/ratio rejection, cleanup, persisted refs/versions/jobs/export หลัง restart และ Story Factory fixture เดิมไม่เปลี่ยน
- FFmpeg/FFprobe 8.1.1 ติดตั้งจริง; Remotion ไม่ได้ติดตั้งเพิ่ม
- ไม่มีการเรียก Gemini, Models API, OpenAI, Flow generation หรือ Meta generation ในรอบนี้
- ไม่ได้ทดสอบ Thai spoken narration จริง, visual identity จาก real clips, final loudness หรือ product fidelity; reference instructions ไม่รับประกันผล provider
- Gemini live expansion ที่เคยผ่านเป็นหลักฐาน canary รอบก่อน สิทธิ์ทดสอบเก่าเหลือ 0 ห้ามใช้ซ้ำ

## G. Git, data และ deployment

Branch แยกจาก PR3; PR2/PR3 ยังคง Draft/unmerged ไม่ merge main, force-push หรือ deploy
ตรวจ original Owner storage แบบ read-only; เทียบ private manifest ก่อน/หลัง: 5 ไฟล์ 139,292 bytes และ SHA256 ของทุกไฟล์ตรงกัน ไม่มี migration/reset/delete
ก่อนเริ่ม Owner3006 ใหม่ต้องเตรียม fresh backup/frozen build/rollback และ Owner approval ใหม่; receipt startup เดิมใช้แล้ว
Production hosting, Supabase migration และ Drive storage cutover ยังไม่ได้รับอนุมัติ

## H. งานคงเหลือและสิ่งที่ต้องใช้ Owner

1. เตรียม activation ใหม่จาก commit ที่ตรวจรับ พร้อม backup/restore-copy/rollback ก่อนขอ Owner อนุมัติเปิด 3006 ข้อมูลเดิม/Mock
2. Owner เพิ่มภาพจริงหลายมุมของ CHABU/CHABUNG และสินค้า ตรวจ claims/affiliate/disclosure แล้วอนุมัติ Flow credit budget; ไม่ใช้ synthetic proof แทนงานจริง
3. Owner ตั้ง Drive Web OAuth private configuration ตาม [คู่มือ](../DRIVE_LOCAL_SETUP_TH.md) แล้ว authorize OAuth; สถานะจริงรอบนี้ ABSENT
4. Drive loader ยัง NOT_IMPLEMENTED: แยก private validation เดิมเป็น helper; inject เฉพาะ child ProcessStartInfo environment หลังอนุมัติ launch ไม่แก้ parent env/ไม่สร้าง vault key ใหม่/ไม่เขียน plaintext พร้อม synthetic security tests
5. Supabase/HTTPS host/worker credentials/schema approval และ disconnected-device proof ยังขาด; publishing transport/scopes/approval ยังไม่เปิดใช้

Product Review, Kids & Toy, Investment และ Publish ยังแสดง Planned อย่างตรงไปตรงมา ไม่ได้ทำเป็นหน้าจอ production ที่มีข้อมูลปลอม

## I. Readiness matrix

| ส่วน | สถานะ | ขอบเขตหลักฐาน |
|---|---|---|
| Story Factory local lane | VERIFIED | regression + existing project fixture preserved; Owner runtime ไม่ได้เปิดใหม่ |
| CHABU local metadata/prompts/queue/editor | VERIFIED | isolated API + synthetic FFmpeg + browser critical flows |
| CHABU real production acceptance | BLOCKED | ต้องภาพ/คลิปจริง/Owner creative review และ mobile clip chooser verification |
| Gemini text | VERIFIED รอบก่อน / BLOCKED การเรียกใหม่ | ไม่มีสิทธิ์ live request ใหม่ในรอบนี้ |
| Google Flow / Meta | PREPARED | manual prompt/reference/import handoff; live provider execution NOT VERIFIED |
| Google Drive | PREPARED / BLOCKED | OAuth adapter เดิม; private config ยังไม่มี, ไม่มี live upload/download/checksum proof |
| Mobile/cloud notebook-offline | PREPARED / BLOCKED | local responsive/PWA shell; ไม่มี approved always-on deployment/paired worker proof |
| Publishing | PREPARED | pure plans เดิม; ไม่มี OAuth/upload/publication |
| Full automation | NOT_IMPLEMENTED | ไม่อ้าง official video API หรือเปิดบริการเสียเงิน |

Local candidate ใช้ตรวจรับได้ แต่ยังไม่ใช่ทั้งระบบ production-ready หรือการส่งมอบวิดีโอจริงจาก AI provider
