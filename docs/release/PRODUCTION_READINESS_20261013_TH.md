# Production V1 checkpoint — 2026-10-13

สถานะ **Owner app เปิดแล้วใน Mock / Gemini backend configured / วิดีโอ Flow จริงยังไม่ผ่าน acceptance**

หลัง checkpoint7f759f7 OwnerอนุมัติเปิดและRootเปิด pinnedaadf62d/PID10944 สำเร็จ
health/authstatus200, anonymousprojects401, setupRequiredfalse, assetsSHAและข้อมูลก่อน–หลังตรง
ไม่มีAIrequests/Billing/modechange Ownerpasswordlogin/Gemini generationบนOwnerappยังต้องตรวจ
หัวข้อผลเตรียมด้านล่างเก็บ historicaloffline/pendingapproval ไว้ตามลำดับเหตุการณ์
ไม่ merge main, ไม่ deploy, ไม่ใช้เครดิตหรือคำขอ AI เพิ่ม

## ผลที่ทำและตรวจจริง

1. Fetch/review PR #2 และ #3: ยัง Draft/OPEN, release source 6a9386e,
   Phase2 base aadf62d. ตรึง build candidate aadf62d และ rollback 6a9386e
   แยกจาก source งานเตรียมชุดผลิต ไม่มีการเปลี่ยน Premium Cinematic V2
2. Owner3006 ปัจจุบัน offline. ตรวจฐานข้อมูลเดิมแบบ read-only พบ
   1 Owner/1 project/4 jobs/0 active/0 clips/0 exports, saved Mock
   ทำ consistent SQLite backup, คัดลอก storage ทุกไฟล์, ตรวจ checksum/integrity/schema
   และคืนสำเนาเทียบทุกตารางกับต้นฉบับ ตรวจ user-only NTFS ACL
3. Candidate บน restored copy 3014 ผ่าน auth status, synthetic copied session,
   history, 401/403, logout, Mock และ static asset hashes; หยุด child แล้ว
   ข้อมูลทุกตารางและ sidecar/media ทั้งต้นฉบับและสำเนาไม่เปลี่ยน
   ไม่ได้ทดสอบ password ของ Owner หรือเปิด app3006
4. เพิ่ม CLI ออฟไลน์สำหรับ Flow handoff: จำกัด private workspace, no-overwrite,
   10 ideas/1 selection/20–60s, bibles/continuity/ref checklist, EN prompts/TH guidance,
   missing clips, verified-owner credit rates และแยก provenance
   Root แก้ชื่อคลิปให้ตรง scene ID/canonical prompt/matchClip แล้ว
5. ใช้ cached real Gemini canary เดิมสร้าง private bundle 3 ฉาก 6+6+8s
   โดยไม่เรียก AI/Models และไม่เปลี่ยน DB. ยังขาดภาพอ้างอิงและ Flow clips จริง 3 ฉาก
   ชุดล่าสุด `cached-gemini-20s-20261013-v2`; ชุดก่อนหน้าระบุ superseded และเก็บไว้
6. เพิ่ม API acceptance 20s บน synthetic DB: Mock ideas/expansion อย่างละ 1 ครั้ง,
   normal login, references upload/download, canonical prompts, clip matching/import,
   music/SFX, scene reorder/fade/TH subtitles, queue/export/download และ reopen persistence
   ตรวจ bytes เดิมหลัง restart, ลำดับสีและความถี่เสียงจริง
   MP4 20.021029s, 1280×720, H.264/AAC เป็น **MOCK_TEXT / SYNTHETIC_MEDIA**
7. เพิ่ม pure Publishing planner: TH/EN metadata, YouTube private resumable request plan,
   approval ผูก content/media/destination/revision/time, schedule gate และ recovery guidance
   executionAllowed=false เสมอ ไม่มี OAuth/HTTP/scheduler/upload/publication
   Facebook current contract ยัง unverified; ไม่เดา version/policy
8. ตรวจ Drive/cloud environment แบบ presence-only: ไม่พบ credentials ใน Process/User
   อ่าน Supabase project inventory เท่านั้น ไม่มี app-specific target ที่อนุมัติ
   ไม่เปลี่ยนโปรเจกต์อื่นหรือ apply SQL; อัปเดตขั้นตอน Owner ใน
   [Production actions](../PRODUCTION_OWNER_ACTIONS_TH.md)

## Verification ที่รันจริง

| คำสั่ง/วิธีตรวจ | ผล |
|---|---|
| `npm.cmd test` หลังรวมงานครั้งแรก | 249 total / 248 pass / 0 fail / 1 skip |
| `npm.cmd test` หลังแก้ชื่อคลิปครั้งสุดท้าย | **250 total / 249 pass / 0 fail / 1 skip** |
| `npm.cmd run lint` | ผ่าน; lint เฉพาะไฟล์หลัง filename fix ผ่านอีกครั้ง |
| `npm.cmd run build` | ผ่านสาม typechecks + API compile + Vite + PWA public shell 9 assets |
| `tsc --noEmit -p tsconfig.tests.json` หลัง filename fix | ผ่าน |
| CLI/planner narrow tests | ก่อนแก้ 21/21; CLI หลังแก้ 7/7; รวมอยู่ใน full suite สุดท้าย |
| restored-copy 3014 test | ผ่าน, no provider credentials, process stopped |
| FFmpeg/FFprobe + authenticated downloads | ผ่านทั้ง existing tests และ new 20s acceptance |
| Node syntax / PowerShell parser ของ prepared opener | ผ่าน; **opener ยังไม่รัน** |

Skip เป็น POSIX-permission assertion บน Windows; NTFS สำหรับข้อมูลจริงตรวจด้วย native ACL
และ checksum แยก. Source reviewer ยอมรับ backup/copy/opener หลังแก้ hardlink/listener
และ ACL exit-code guard แล้ว Publishing/Flow CLI ผ่าน independent read-only review
Root ตรวจผลก่อนรวม Agent counts 87 ที่ reconcile ไม่ได้ไม่ใช้เป็นหลักฐาน

Browser tool เริ่มไม่สำเร็จ (`failed to write kernel assets`, os error 3) แม้ reset หนึ่งครั้ง
จึง **ไม่ยืนยัน playback/responsive/visual QA ใหม่**. เปิด synthetic MP4 ใน Codex panel
เพื่อให้ Owner ตรวจได้ แต่การเปิด preview panel ไม่ใช่หลักฐาน playback ผ่าน
Antigravity PASS เดิมผูก source 3e9c1aa เท่านั้น; UI source รอบนี้ไม่เปลี่ยน

## Readiness matrix

| ความสามารถ | สถานะ | ขอบเขตจริง |
|---|---|---|
| Local story/import/editor/export/persistence | VERIFIED | isolated Mock text + synthetic media/API/FFmpeg; Owner3006 เปิด Mock แล้ว, password login ยังรอ Owner ตรวจ |
| Gemini text | VERIFIED | canary ที่อนุมัติรอบก่อน; งบ request เดิมเหลือ 0; ยังไม่ใช้บน Owner app |
| Owner3006 activation/rollback | VERIFIED / PREPARED | approved startup/data preservation verified; rollback prepared, not executed; Owner password login pending |
| Google Flow production | PREPARED | cached EN prompts/TH guidance; ภาพอ้างอิง/คลิปจริง/เครดิตและ editorial รอ Owner |
| Google Drive | PREPARED / BLOCKED | implementation/injected tests; OAuth และ live upload/download/restore/checksum ยังไม่ผ่าน |
| Mobile/cloud | PREPARED / BLOCKED | foundation/tests; ไม่มี deployed HTTPS/app-specific Supabase/offline notebook proof |
| Facebook/YouTube publishing | PREPARED | pure planner เท่านั้น; transport/OAuth/scheduler ยัง NOT_IMPLEMENTED |
| Full automation / first real-video acceptance | NOT_IMPLEMENTED / BLOCKED | assisted Flow และ external Owner gates ยังต้องดำเนินการ |

## ขั้นตอนที่ต้องทำต่อ

Owner อนุมัติ [แผนเปิด 3006](../OWNER3006_ACTIVATION_TH.md) แล้ว Rootเปิดและตรวจผ่าน
โดยใช้ข้อมูลปัจจุบันเดิม ไม่ใช้ backup ทับ; ให้ Owner login และสั่งงานจริงเอง
เตรียม Flow refs/clips ตาม private handoff, ตั้ง Drive OAuth และเลือก Supabase/HTTPS host
โดยไม่เปิด billing/deploy/publishเอง ทุก live integration ต้องมีผลตรวจแยก

[หลักฐานปิดบังข้อมูล](OWNER3006_PREPARATION_EVIDENCE.json),
[Owner actions](../PRODUCTION_OWNER_ACTIONS_TH.md),
[Publishing preparation](../PUBLISHING_PREPARATION_TH.md)

## งานอิสระหลังเปิดแอป — Drive private setup และ cached portrait smoke

เพิ่ม Status/Configure helper เข้ารหัสOwnerOAuthแบบlocalเฉพาะ2sourcefiles ไม่มีloader/start/restart/network. Rootscopedtests9/9 WindowsPS5.1/th-TH/narrowlint/teststypecheckผ่าน; full250/249/1ด้านบนเป็นก่อนเพิ่มhelper ไม่สมมติfull259. Source reviewREADY/noP1; P2directoryinheritanceassertiondocumentedพร้อมexplicitprivatefiles. Real Statusconfigabsent. OwnerกำลังเตรียมWebclient/privateinputsตาม [คู่มือ](../DRIVE_LOCAL_SETUP_TH.md) ยังไม่consent/liveverify

CachedrealGemini package render9:16/6+6+8sบนsyntheticmediaผ่าน720x1280/H.264/AAC20.021029s/FFprobe/fullFFmpegdecode musicSFX/THsubtitleencodingenabled ไม่วัดfinalLoudness/visualreadability/browserplayback ไม่ใช่Flowrealclips ไม่มีAI/DB/Ownerappwrites ไม่เปลี่ยนreadinessของliveFlow/Drive/cloud/publishing

## Usage checkpoint

หยุดการพัฒนาที่authoritativeremaining7%/76% ตามOwnerpolicy Owner3006เปิดMockต่อโดยไม่เปลี่ยนapp/privatekeys ข้อมูลและcacheคงอยู่ PrivateTH/ENcaptiondraftจากselectedcacheเตรียมแล้ว แต่ไม่publish/newAI; DriveOwnerpreparingcredentials/Flowrefs+realclips/Cloud+Publishingexternalgatesยังpending ไม่claimV1firstrealvideoacceptanceครบ ไม่มีautomaticresume
