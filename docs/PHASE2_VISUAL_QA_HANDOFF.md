# Phase2 — ตรวจ UI บน source ที่รวมแล้ว

ANTIGRAVITY_STATUS: READY_FOR_PHASE2_VISUAL_QA
SOURCE: de462843a2847e850334730c004f8b1d8f01e0b6
PR: [Draft PR#3](https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/3), target release/v1-real-world

Release PR#2 ผ่าน published Antigravity QA ddccf9c/PASS ที่ source3e9c1aa แล้ว. การยอมรับนั้นไม่ครอบคลุม Phase2 provider controls/usage/error copy และการแก้ Drive help/native modal contrast/visible-opener focus นี้; ให้ตรวจ actual Phase2 app จาก PR#3 ด้วย Premium Cinematic V2 baseline โดยไม่ redesign.

## เปิด fixture แยกจาก Owner

จาก Phase2 worktree build แล้วใช้พอร์ตว่างที่ไม่ใช่3006. ล้างเฉพาะ environment ของ QA shell ไม่เปลี่ยนค่าที่ Owner เก็บถาวร:

```powershell
npm.cmd run build
$taskQaVars = @('OPENAI_API_KEY','GEMINI_API_KEY','ACF_OPENAI_REQUESTS_APPROVED',
  'ACF_GEMINI_FREE_TIER_CONFIRMED','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI','ACF_DRIVE_ALLOWED_REDIRECT_URIS','ACF_TOKEN_ENCRYPTION_KEY',
  'SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY')
foreach ($taskQaVar in $taskQaVars) { Remove-Item -LiteralPath "Env:$taskQaVar" -ErrorAction SilentlyContinue }
$env:ACF_QA_PORT='3012'
Remove-Item Env:ACF_QA_DATA_DIR -ErrorAction SilentlyContinue
node scripts/release-qa-server.mjs
```

Fixture สร้าง synthetic DB ใหม่ใน ignored .tmp, ไม่ใช้ Owner storage/session และไม่มี default password. ตั้งบัญชี synthetic ผ่าน UI ปกติ. OpenAI stub เป็น injected แต่ approval=false จึงต้องถูกปฏิเสธ; Gemini ไม่มี key ต้อง AI_NOT_CONFIGURED. เลือก Mock ผ่าน Settings ก่อนสร้างสิบไอเดีย → บันทึกหนึ่ง → ขยาย → bibles/scenes/prompts/Preview. ไม่มี live provider/consent/billing/publishing.

## จุดตรวจบน actual app

- UI ไทยและ English แยกจาก TH/EN/TH+EN content controls; Thai default, 360/768/1440px, Settings dialog เปิดจริงและ provider controls อ่านได้
- Provider mode กับ saved output provenance ต่างกันอย่างชัดเจน; cached Mock ต้องไม่ถูกเรียกว่า live; missing-key/Free Tier/OpenAI-approval errors ไม่เงียบ
- Bilingual ideas/one selection/selected-only expansion, Thai scene explanations + English Flow prompts, unknown token costs/credit rate ตามข้อมูลจริง
- Preview360 Google Drive help อ่านเป็น block เต็มความกว้าง ไม่บีบ heading/list/env names เป็นสามคอลัมน์; callback ตรง origin จริง และไม่มี horizontal overflow
- Premium Cinematic V2 spacing/colors/navigation/focus/mobile drawer ยังคงเดิม; Planned modules/assisted Flow ไม่แสดงเป็น automation ที่พร้อมใช้

Engineering regression และข้อจำกัดอยู่ใน [PHASE2_QA](PHASE2_QA.json). รายงาน QA ต้องระบุ tested SHA, route/locale/width และ actual screenshots; ไม่ใช้ prototype หรือ PASS ของ PR#2 แทน. Physical phone/assistive technology/live Gemini/Drive/cloud ยังต้องหลักฐานแยก. Owner app3006 คง RC/Mock/original data; ห้าม seed/reset/migrate หรือทดลองกับข้อมูลนั้น.

ให้ส่ง QA evidence ผ่าน branch/handoff ที่ Owner อนุมัติ; เอกสารนี้ไม่ได้ส่งข้อความให้บุคคลอื่นหรืออ้างว่ามี Antigravity QA รอบใหม่แล้ว. Main merge/deploy ต้อง explicit Owner approval.

## Engineering evidence ล่าสุด

Latestsourcede462843a2847e850334730c004f8b1d8f01e0b6:12/12actualdialogTH/EN×360/768/1440ผ่านcontrast/Tab/Escape/Close/focusreturn. ไฟล์[modalregression](../tests/browser/modal-focus.js)รันจริงทั้งPhase2/RC12/12. Previous36casematrixผูกsource86dbbb5;อย่าเหมารวมว่ารัน36ใหม่หลังfocuspatch. ภาพที่Rootตรวจ: [SettingsTH360](release/phase2-evidence/settings-360-th.png), [SettingsEN360](release/phase2-evidence/settings-360-en.png), [PreviewTH360](release/phase2-evidence/preview-360-th.png), [PreviewEN360](release/phase2-evidence/preview-360-en.png). Engineeringproofไม่แทนAntigravityvisualapproval;ยังไม่มีphysicalphone/liveproof.
