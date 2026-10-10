# Antigravity — ตรวจ UI ของ V1 Release Candidate จริง

ANTIGRAVITY_STATUS: READY_FOR_IMPLEMENTATION_VISUAL_QA
APP_IMPLEMENTATION_VISUAL_QA: PENDING
Updated: 2026-10-10 (Asia/Bangkok)

ให้ตรวจแอปจาก branch `release/v1-real-world`, source checkpoint `b271855dfa535bf4a1b18afef5917f8b1280c925`, worktree `.worktrees/release-v1`. RELEASE_PR: [Draft PR#2](https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/2). Draft PR#1 และ main ยังไม่ merge; บันทึก HEAD ที่รันจริงทุกครั้ง เพราะ commit เอกสารอาจอยู่หลัง source checkpoint.

ฐานที่รวมแล้วคือ reviewed integration cfa6554 + Premium Cinematic V2 be29e0a พร้อม backend/core เดิมของ main dfe2b2c ไม่มี redesign หรือ migration. ตรวจแอปที่รวมแล้วเทียบ [UI_SPEC](UI_SPEC.md), [DESIGN_SYSTEM](DESIGN_SYSTEM.md), [MOBILE_UX](MOBILE_UX.md), [MOTION_SPEC](MOTION_SPEC.md) และ [VISUAL_QA](VISUAL_QA.md). PASS ของ prototype/design branch ไม่ใช่ acceptance ของ candidate นี้.

Engineering ผ่าน [QA record](release/QA_RESULTS.json): 144 tests/1 Windows skip, lint/build/3typechecks/PWA; 48 route×locale×viewport cases และ retake เพิ่มสำหรับ tablet rail/mobile heading/Drive wrap/poll recovery; real synthetic MP4 12.021029s เล่น/ดาวน์โหลด/เปิดกลับได้. ภาพจาก actual candidate: [Clips TH360](release/clips-360-th.png), [Preview EN768](release/preview-768-en.png). ต้องเปิดแอปจริงร่วมกับภาพ ไม่ใช้ prototype แทน.

## เปิด fixture ที่ปลอดภัย

จาก release worktree รัน `npm.cmd run build` แล้วใช้ port ว่างสำหรับ QA เท่านั้น:

```powershell
$env:ACF_QA_PORT='3005'
Remove-Item Env:ACF_QA_DATA_DIR -ErrorAction SilentlyContinue
node scripts/release-qa-server.mjs
```

เปิด `http://127.0.0.1:3005`; helper สร้าง ignored database ใหม่ มี injected quota failure + Mock และไม่มี paid provider call/default login. ตั้ง synthetic username/password ของผู้ตรวจเอง. โปรเจกต์ QA ที่ใช้ browser regression ควรมีชื่อพร้อมคำว่า QA. ทดลองสร้าง brief → 10 ideas ใน Real test mode จะได้ quota error สังเคราะห์ จากนั้นสลับ Mock แล้วกด Retry หนึ่งครั้งเอง → เลือกหนึ่ง → expand → scenes/prompts → import synthetic/owned clips → export.

Owner app3006 ใช้ original populated data และบัญชีเดิม จึงใช้เฉพาะ Owner ตรวจผ่าน loginปกติ. ห้าม reset/seed/ใช้ QA harness กับ original Owner storage. Fixture3004ในเครื่องนี้มีบัญชี QA ของ Root; ถ้าต้องการบัญชีของผู้ตรวจให้ใช้ fresh3005ตามด้านบน. หยุดเฉพาะ QA serverเมื่อเสร็จและเก็บหลักฐานแยกจาก owner data.

## จุดที่ต้องตรวจ

- 360/768/1440px ใน UI ไทยและอังกฤษ พร้อม TH/EN/TH+EN content; Thai default, overflow, text wrapping, readable focus/header spacing และ tablet icon rail
- Login/setup, dashboard, brief, ten radios/one saved selection, selected-only expansion, four bibles/keyboard tabs, scenes/EN copy+TH explanation/refs/duration/ratio
- Queue progress/errors/manual Retry/Cancel; explicit Mock/Real และ persisted result provenance; pending worker/network/offline/auth states ต้องไม่ปลอมว่าบริการจริงพร้อม
- Clip matching ที่ต้อง confirm, missing clips, audio/images, editor settings/order/music/SFX/subtitles, MP4 playback/download/reopen
- Settings/modal/mobile drawer/editor picker, keyboard/Escape/focus return, native browser controls, long text,44px targets และ physical-mobile/assistive-technology coverage ที่ DOM testsยังไม่พิสูจน์
- Drive OAuth instructions callbackตรงorigin, upload/restore/error/progress presentation; ตรวจกับ prepared state ได้ แต่ไม่ทำ consent/billing/live transfer โดยไม่มี Owner authorization
- Planned modules/Publish/Meta/direct Flow/cloud pairingต้องไม่เป็น fake functional controls; ค่าเครดิตต้องระบุว่ามาจาก Owner rate ไม่ใช่ราคา/chargeที่ตรวจแล้ว

รักษา existing cookie/CSRF/auth, private media และ SQLite/FFmpeg lane. รายงาน security/API issueให้ Root; visual QAไม่อนุญาต schema/endpoints/migration/paid generation/public deployment. ดู [readiness](release/V1_READINESS.md) เพื่อแยก local, mock, prepared, blocked และ not implemented.

## ผลที่ต้องส่งคืน

| รายการ | ผล |
| --- | --- |
| Candidate/source/HEAD + launch command | Source b271855; บันทึกจริงตอนตรวจ |
| Browser/device/viewport/locale/content mode | PENDING |
| Screenshots และ reproduction/expected behavior ตาม severity | PENDING |
| Retest หลังแก้ | PENDING |
| Actual candidate visual acceptance | PENDING จน Antigravity ตรวจจริงและ Root รับหลักฐาน |

เอกสารนี้เป็น handoff พร้อมตรวจ ยังไม่ได้ส่งข้อความภายนอกถึง Antigravity และยังไม่มี visual acceptance หรือ main merge.
