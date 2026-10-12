# แผนเปิด Owner3006 อย่างปลอดภัย — 2026-10-13

สถานะ **START_VERIFIED / RUNNING_MOCK**. Owner อนุมัติเปิดแล้วเมื่อ checkpoint นี้
เปิด frozen aadf62d ที่3006/PID10944 ด้วยข้อมูลเดิมและคงMock ตรวจhealth/auth/401/assets
และข้อมูลก่อน–หลังผ่าน Gemini configอยู่เฉพาะbackend ไม่ได้เรียกAIเพิ่มหรือBilling
Owner password login ยังต้อง Owner ตรวจ การอนุมัติทดสอบ canary รอบก่อนใช้ครบแล้ว

ข้อความในหัวข้อหลักฐานด้านล่างบันทึกช่วงเตรียมก่อนเปิด ปัจจุบันไม่ใช่สถานะ offline
rollback ยัง PREPARED เท่านั้น ไม่มีการ rollback หรือคืนข้อมูลจาก backup

## สิ่งที่ Owner อนุมัติแล้ว

เปิดแอปเฉพาะ `http://127.0.0.1:3006` จาก build ที่ตรึงกับ PR #3
`aadf62d7a791f09bf8b6da8fd0ceb4f2cc04f158` โดยใช้ storage เดิมของ Owner
และคง **Mock Mode** ที่บันทึกไว้ Gemini จะพร้อมให้ Owner เลือกภายหลังใน Settings
การเปิดแอปและตรวจ health/authentication ไม่สร้างงาน AI หรือใช้เครดิต
ไม่ merge PR #2/#3 และไม่ deploy สู่สาธารณะ

PR #2 ยังเป็น Draft ที่ `6a9386eac19719e25932d8485bae36cd5312b37a`;
PR #3 ยังเป็น Draft การเตรียม Flow/Publishing ใน checkpoint ถัดไปไม่เปลี่ยน
build ที่ตรึงไว้สำหรับการเปิด Owner3006

## หลักฐานที่ตรวจแล้ว

- ตอนตรวจไม่พบ listener 3006 หรือ process เดิม จึงยังตรวจ password login
  ของ Owner ผ่านแอปจริงไม่ได้ ห้ามรายงานว่าระบบ Owner online แล้ว
- ฐานข้อมูลเดิม: Owner 1 คน, project 1, jobs 4, clips 0, exports 0;
  jobs ที่ queued/running = 0, saved mode = mock, SQLite integrity = ok
- สำรอง SQLite อย่างสอดคล้อง พร้อมไฟล์ทั้งหมดใน storage ยกเว้น runtime lock
  และ SQLite auxiliary files; ตรวจ checksum ของทุกไฟล์และคืนสำเนาเปรียบเทียบ
  schema/ข้อมูลทุกตาราง/sidecar สำเร็จ ไม่มีการลบหรือ reset ฐานข้อมูลเดิม
- สำเนาและ build candidate/rollback อยู่ใต้ private `.tmp` ใน integration worktree
  ตรวจ NTFS ACL ให้มีสิทธิ์เฉพาะ Windows user ปัจจุบันและ inheritance แล้ว
  ตัวชี้ตำแหน่งจริง: `.tmp/owner-gemini-activation-20261012.location.json`
  ชื่อวันที่ 12 หมายถึงวันที่เริ่มเตรียม; ตรวจสำเนาวันที่ 13
- รัน candidate บน **สำเนาเท่านั้น** ที่ 3014 แบบไม่มี provider keys:
  setupRequired=false, anonymous projects=401, authenticated history ตรงต้นฉบับ,
  missing CSRF=403, logout เพิกถอน session, Mock active และ static assets ตรง build
  ใช้ session สังเคราะห์ในสำเนา ไม่ใช่การทดสอบ password ของ Owner
- หยุด process ทดสอบแล้ว; logical DB และไฟล์ sidecar/media ของทั้งสำเนาและต้นฉบับ
  ไม่เปลี่ยน ตรวจ hardlink/path aliases และยืนยัน listener เป็น child ที่สร้างเอง
- `npm.cmd test` ของ **activation baseline aadf62d ก่อนเพิ่มงานเตรียมผลิต**:
  227 tests, ผ่าน 226, ไม่ผ่าน 0, skip 1 (Windows ไม่ใช้ POSIX mode assertions)
  รวม synthetic FFmpeg/FFprobe tests. หลังเพิ่ม CLI/planner/20s acceptance และแก้
  filename ผล final suite ของ checkpoint ใหม่คือ 250 tests, ผ่าน 249, ไม่ผ่าน 0,
  skip 1; build ที่จะเปิด Owner ยังคงตรึงกับ aadf62d ไม่ใช้ source ที่เปลี่ยนตามงานเตรียม
- `npm.cmd run build` ผ่านทั้ง candidate และ rollback ใน worktree แยก
  stylesheet และ production/editor/storage panels คง Premium Cinematic V2

## ขั้นตอนเปิดที่ทำแล้วและการตรวจต่อโดย Owner

1. ตรวจ source/build/dependency/Node fingerprints, schema, integrity, mode,
   บัญชี/ประวัติ/ไฟล์ และ jobs ที่ active ซ้ำก่อนเปิด หากเปลี่ยนให้หยุดตรวจใหม่
2. หาก port 3006 มี process อยู่ ห้ามหยุดหรือแทนที่โดยเดา PID
   บันทึกสถานะแล้วตรวจ Owner app ที่มีอยู่ก่อน
3. เปิด pinned candidate ด้วย clean backend environment, host 127.0.0.1,
   data directory เดิม, `ACF_AI_MODE=mock`, `ACF_CLOUD_WORKER=false`.
   อ่าน Gemini key จาก private Windows-user DPAPI configuration ที่ Owner ตั้งไว้
   ส่งเฉพาะ `GEMINI_API_KEY`, `ACF_GEMINI_FREE_TIER_CONFIRMED=true` และโมเดล
   `gemini-3.5-flash-lite` ให้ backend; ไม่พิมพ์ key หรือใส่ command-line/source
4. ไม่ส่ง OPENAI_API_KEY, OAuth/cloud keys หรือ NODE_OPTIONS;
   `ACF_OPENAI_REQUESTS_APPROVED=false`. Free Tier confirmation เป็นคำยืนยันของ
   Owner ไม่ใช่การตรวจ billing ผ่าน API หากสถานะ Free Tier เปลี่ยนให้หยุดใช้ Gemini
5. ตรวจ process/listener identity, health, setupRequired=false, anonymous access,
   บัญชี/project/job history และ assets โดยไม่เรียก generation endpoints
6. Owner login ด้วย username/password เดิม ตรวจ project แล้วเลือก Gemini ใน Settings
   เมื่อพร้อมสร้างงานจริง บันทึก mode ชัดเจนและยังเลือก Mock ได้
   อย่ากดสร้าง canary ideas ใหม่หรือ retry งานเดิมโดยอัตโนมัติ

## Rollback โดยเก็บข้อมูลปัจจุบัน

- ตรึง rollback build กับ `6a9386e...` แล้ว หยุดเฉพาะ process candidate
  ที่ยืนยันตัวตนได้และตรวจว่าไม่มีงานกำลังทำก่อนสลับ
- ใช้ **storage ปัจจุบันเดิม** กับ rollback build; ไม่เอา backup ทับข้อมูล
  เพราะ Owner อาจสร้างงาน/คลิปใหม่หลังเปิดแอป
- หาก saved mode ยังเป็น Mock ให้เปิด rollback แบบ clean environment
  โดยไม่มี external provider keys; OPENAI_API_KEY ต้องไม่มีจริง เพราะรุ่นเก่า
  ไม่มี approval guard รุ่นใหม่
- หาก Owner เปลี่ยน saved mode เป็น Gemini แล้ว รุ่นเก่าอ่าน mode นี้ไม่ได้
  ต้องขออนุมัติการเปลี่ยนกลับ Mock แยกก่อน rollback (ใช้ Settings ของรุ่นใหม่
  ขณะ idle หากทำได้) ห้ามแก้ sidecar หรือคืน DB ทับเอง
- การคืนข้อมูลจาก backup เป็น recovery อีกประเภท ต้อง Owner อนุมัติแยก
  ไม่ใช่ rollback อัตโนมัติ เก็บ backup และ checksum ไว้จน Owner ยอมรับ
- รุ่นเก่าอาจไม่แสดง Gemini provenance/usage; metadata และข้อมูลยังต้องเก็บไว้

## ยังไม่ยืนยัน

Owner password login หลังเปิดจริง, Gemini generation ใน Owner3006,
วิดีโอจาก Flow จริง, Drive OAuth/upload/download, cloud notebook-offline และ
การเผยแพร่ Facebook/YouTube ยังต้องตรวจ/อนุมัติแยก
ผล synthetic หรือ cached canary ไม่ใช่หลักฐาน live ของ Owner app
