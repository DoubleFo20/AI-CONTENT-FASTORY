# เตรียม Facebook Page / YouTube publishing — 2026-10-12

สถานะ **PREPARED / executionAllowed=false** เท่านั้น หน้าจอ Publish ยังคง Planned.
เพิ่ม pure planner ที่ `server/publishing/plans.ts` และ synthetic tests ที่
`tests/publishing-plans.test.ts`; ยังไม่มี routes, OAuth, tokens, HTTP adapter,
upload, scheduler, database schema หรือการเผยแพร่จริง การสร้างแผนไม่ได้รับรองบัญชี
ปลายทาง quota หรือสิทธิ์ และไม่เป็นการอนุญาตให้ส่งข้อมูลออกนอกแอป

## Contract สำหรับ Root review

`preparePublishingPlan(rawInput, now, trustedApproval?)` ใช้เวลา UTC epoch milliseconds
จาก backend ที่เชื่อถือได้ ไม่ใช้เวลาที่ browser ส่งมา. input เป็น strict Zod object:

- ทั้งสองแพลตฟอร์ม: `draftId` UUID, `revision` positive safe integer,
  `destinationRef` opaque internal UUID, `mediaSha256` lowercase SHA-256,
  `captions: { th, en }`, `selectedLocale: th|en`, optional `scheduledAt` ISO 8601
  ที่ระบุ offset/Z. captions หมายถึงข้อความโพสต์/description ไม่ใช่ subtitle track.
- Facebook: `platform: facebook_page`, `visibility: unpublished`; ใช้เก็บ local draft
  สำหรับวิดีโอ Page ยังไม่มี external request ที่ยืนยันแล้ว.
- YouTube: `platform: youtube`, `visibility: private`, `neverPublished: true`,
  `titles: { th, en }`, numeric `categoryId`, Owner ระบุ `selfDeclaredMadeForKids`
  และ `containsSyntheticMedia` เป็น boolean โดยชัดแจ้ง ไม่ให้ planner เดา.

Reject unknown keys รวมถึง token, API key, account ID, endpoint override และ flag
อนุมัติจาก client. Error มีเฉพาะ code คงที่ ไม่ส่ง validation input หรือ upstream
body ออกมา. output เก็บ captions และ metadata ที่ตั้งใจเผยแพร่; ไม่ใช่ redactor
สำหรับความลับที่ Owner พิมพ์ไว้ในข้อความ. ไม่ส่ง draft UUID, destination reference,
media fingerprint, credential, approval timestamp หรือ account/profile identity
ออกมาใน JSON ของแผน. output ไม่ใช่ public unauthenticated API และยังไม่ได้ต่อ route.

`publishingPlanDigest(input)` ใช้ SHA-256 ของ normalized strict input รวมไฟล์,
destination reference, revision, เนื้อหาและเวลาที่ canonicalize เป็น UTC.
digest เป็น content binding เท่านั้น ไม่ใช่ authentication หรือ durable idempotency.
trim ข้อความก่อนสร้าง digest; เวลา offset ต่างกันแต่แทน instant เดียวกันได้ digest เดียวกัน.

`trustedApproval` ต้องมาจาก Owner approval store ฝั่ง server ที่ Root อนุมัติแล้ว
และตรวจสิทธิ์ Owner/ปลายทาง ไม่รับ JSON จาก client เป็นหลักฐานจริง. ฟิลด์:
`planDigest`, `platform`, `action: private_upload|scheduled_publication`,
`approvedAt`, `expiresAt`, `firstPublicationApproved`. บันทึกอนุมัติให้มี actor,
media fingerprint, destination binding, exact metadata/time, audit trail และการถอน
อนุมัติก่อน execution ในชั้น durable store ที่ยังไม่ได้ทำ.

แผน private/local draft เตรียมได้โดยไม่อนุมัติ แต่ `externalWrite` ยังคง
`OWNER_APPROVAL_REQUIRED`. private-upload approval ไม่ผ่าน first-publication gate.
แผน YouTube ตั้งเวลาต้องมี approval สำหรับ `scheduled_publication` ที่ bind digest
ตรงกันและ `firstPublicationApproved=true`; approval ต้องไม่อยู่ในอนาคตและหมดอายุ
หลัง scheduled time ตามกฎแอปแบบ conservative. การเปลี่ยนข้อความ title ภาษา
audience/disclosure revision destination/media หรือเวลา ทำให้หลักฐานเดิมใช้ไม่ได้.
แม้หลักฐานตรงกันยังคง `BLOCKED_PREPARATION_ONLY` และ `executionAllowed=false`.
ไม่รองรับแผน public/unlisted ในขอบเขตนี้.

## YouTube — เอกสารทางการที่อ่านได้

ใช้ API **v3**; `POST https://www.googleapis.com/upload/youtube/v3/videos` โดย
เลือก scope ขั้นต่ำสำหรับ upload `https://www.googleapis.com/auth/youtube.upload`.
planner allowlist เฉพาะ `part`, `uploadType`, `notifySubscribers`,
`snippet.title/description/categoryId/defaultLanguage`, TH/EN localized title/description,
`status.privacyStatus/publishAt/selfDeclaredMadeForKids/containsSyntheticMedia`.
ใช้ `part=snippet,status,localizations`, `uploadType=resumable`,
`notifySubscribers=false`, และส่ง `privacyStatus=private` ทุกครั้ง;
title/description ภาษาที่เลือกเป็น default และอีกภาษาเป็น localization.
ไม่เพิ่ม partner impersonation fields, arbitrary URL หรือ credentials.
[videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)

ตรวจ title <=100 Unicode characters ไม่รับ `<`/`>`; description <=5000 UTF-8 bytes
ทั้งสองภาษา. category ID ยังต้องยืนยันกับรายการ category จริงก่อน execution.
`publishAt` ใช้ได้เฉพาะ private ที่ไม่เคยเผยแพร่; เวลาในอดีตทำให้เผยแพร่ทันที
จึง reject past/current และเวลาที่ไม่ตรง whole second. planner แปลง BKK offset
เช่น `2026-10-12T10:00:00+07:00` เป็น `2026-10-12T03:00:00.000Z`.
ตรวจ future ด้วยเวลาที่ inject ตอนสร้างแผน และต้องตรวจซ้ำก่อนส่งคำขอจริง.
ไม่สมมติ minimum/maximum scheduling window ที่เอกสารไม่ได้ระบุ.
[video resource](https://developers.google.com/youtube/v3/docs/videos)

อัปโหลดอนาคตต้องเริ่ม resumable session, เก็บ Location URI แบบ private,
progress/confirmed offset และ remote ID อย่าง durable; ตรวจ session หลัง interrupted
upload ก่อนส่ง bytes ต่อ. planner ไม่รับ session URI และยังไม่มี tracking จริง.
[Resumable protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)

เตรียม status read reference: `GET https://www.googleapis.com/youtube/v3/videos`
ด้วย `id` และ `part=status,processingDetails`. processingDetails ต้องเป็น Owner
ของวิดีโอ. scope อ่านเสนอให้ตรวจแยก `youtube.readonly`; upload scope ไม่ถูกอ้างว่า
เพียงพอสำหรับการอ่านทุกส่วน. ไม่มี polling หรือเพิ่ม scope จริงในงานนี้.
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list)

ไม่ hardcode quota หรืออ้างว่า project ผ่าน audit: ข้อความ quota/review ในเอกสาร
เปลี่ยนได้และบาง page summary ไม่ตรง body ปัจจุบัน. ตรวจ Google Cloud Console
ของ project จริงและข้อกำหนด policy/audit ก่อน activation; ไม่ขอ quota เพิ่มหรือเปิด
billing อัตโนมัติ. plan แสดง `QUOTA_UNKNOWN` และ account/policy eligibility unknown.
[Quota and compliance](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)

## Facebook Page — blocked ทางเอกสาร

วันที่ตรวจ 2026-10-12 (Asia/Bangkok) Meta official docs ผ่าน web retrieval ตอบ HTTP 429
หรือเข้าถึงไม่ได้. ไม่อ้างว่าได้ยืนยัน current Graph API version, field permissions,
resumable protocol หรือ scheduling window แล้ว. API output `version/endpoint/method/request=null`,
`requiredScopes/allowedRequestFields=[]` พร้อม `META_OFFICIAL_DOCUMENTATION_UNVERIFIED`.

`referenceOnly` เป็นรายการสำหรับ research ต่อ ไม่ใช่ live request contract:
candidate `https://graph.facebook.com/{verified-version}/{page-id}/videos`,
candidate scopes `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`,
candidate fields `title`, `description`, `published`, `scheduled_publish_time`, `upload_phase`.
รายการนี้ต้องทวนกับ official docs ของเวอร์ชันที่เลือกก่อนใช้. ไม่ตั้ง v25/v26
จากผลค้นหาบุคคลที่สาม และไม่เดา 10-minute/30-day/75-day bounds.
Facebook schedule ทุกกรณี reject ด้วย `PUBLISHING_PLATFORM_RULES_UNVERIFIED`.
local unpublished draft/captions ยังเตรียมได้.

Root ต้องตรวจ Page token ฝั่ง server, Owner Page task/access, scope dependencies,
App Review/access level/business verification ที่เกี่ยวข้อง, version lifecycle,
quota/rate-limit และ exact upload/scheduling rules ก่อนรับ architecture:
[Page videos reference](https://developers.facebook.com/docs/graph-api/reference/page/videos/),
[Video publishing guide](https://developers.facebook.com/docs/video-api/guides/publishing/),
[Graph changelog](https://developers.facebook.com/docs/graph-api/changelog/).
ลิงก์เหล่านี้เป็นแหล่งที่ต้องอ่านต่อ ไม่ใช่ citation ยืนยันค่าที่ fetch ไม่ได้.
personal profile, Instagram, Reels และ Marketing/Ads APIs ไม่อยู่ใน contract นี้.

## Upload status / recovery ที่เตรียมไว้

`preparePublishingRecovery(observation)` คืน guidance เท่านั้น ไม่รับ upstream JSON,
ไม่บันทึก state และไม่แปลว่า API ยืนยัน status จริง. มี not_started, uploading,
processing, private_ready, scheduled, published, ambiguous, rejected, quota_exhausted,
authorization_required และ failed_confirmed.

- ambiguous: reconcile durable resumable session/remote ID ก่อน; ห้าม new upload
  หรือ automatic retry เพราะอาจสร้าง duplicate/เผยแพร่ซ้ำ.
- quota_exhausted: STOP_FOR_QUOTA; ไม่มี provider fallback/billing/quota request.
- authorization_required/rejected/failed_confirmed: Owner recovery/review แยก.
- private_ready: ต้อง first-publication approval; published: verify existing result
  ห้ามใช้การอัปโหลดใหม่เพื่อแก้ uncertainty.

ทุก recovery คืน `automaticRetry=false`, `executionAllowed=false`. ก่อน live activation
ต้องเพิ่ม durable intent/idempotency record, atomic concurrency control, immutable media
digest, approval revalidation/revocation, credential vault, request/status validation,
bounded timeouts, error-code-only logs และตรวจสิทธิ์อ่าน session/remote IDs. ยังไม่มี
ส่วนใดในรายการนี้ที่อ้างว่าทำงานแล้ว ไม่มีการแก้ SQLite, migration, UI หรือ Supabase.

## Verification

ใช้ synthetic metadata และเวลาที่ inject เท่านั้น ไม่มี network/provider/account access
ใน tests. ผล/คำสั่งจริงส่งคืน Root เพื่อ independent review และรวม verification;
ไม่เปิด integration หรือเปลี่ยน Publish Planned จากผล unit tests.
