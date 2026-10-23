# CHABU integrated visual QA handoff

สถานะ: READY_FOR_VISUAL_QA ของ implementation บน `codex/chabu-studio-mvp` ไม่ใช่ Final PASS จาก Antigravity

ทดสอบจริงบน canary3017/บัญชีและสื่อสังเคราะห์ แยกจาก Owner3006. Owner app ไม่ได้เปิดใหม่ ไม่อัปเดต main/PR2/PR3 หรือใช้เครดิต AI

ตรวจ candidate หลัง build โดยใช้ isolated storage/Mock เท่านั้น: navigation CHABU, semantic metrics, forms/validation, image/ref versions, episode/4 prompt copies, manual waiting/job states, editor/preview/download, TH/EN และ 360/768/1440px. ตรวจภาพจริงของ interface ไม่ใช้ design prototype แทน

Root ตรวจ 6 layouts/keyboard dialog/actual browser playback/download แล้ว ดู [รายงานและภาพหลักฐาน](release/CHABU_STUDIO_20261023_TH.md). Before actual1600px; after1440/360px ต่าง viewport และไม่ได้อ้าง pixel-perfect comparison. Mobile file chooser บางครั้งช้ามาก; clip imports4ไฟล์ทดสอบผ่านAPI แต่ยังต้อง physicalmobile UI verification

ห้ามใช้ account/media ของ Owner หรือ restart3006 เพื่อ QA โดยไม่มี approval. หลัง visual QA ให้ระบุ sourceSHA/browser/viewport/locale และแนบหลักฐานพร้อม defects. ยังไม่มี authorization ให้ deploy/merge/publish/consume Flow credits

Reviewed implementation source: `5c9fb6e`; Draft PR4 https://github.com/DoubleFo20/AI-CONTENT-FASTORY/pull/4. Subsequent documentation-only checkpoint may update handoff/status without changing tested application source.
