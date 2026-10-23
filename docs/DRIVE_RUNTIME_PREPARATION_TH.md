# Drive runtime loader — แบบเตรียมงานที่ยังไม่ implement

สถานะ NOT_IMPLEMENTED; authoritative Status ตรวจด้วย Windows Owner เดิมแล้ว private configuration ยัง ABSENT. ไม่มี OAuth, network, decrypt actual keys หรือ restart Owner3006 รอบนี้

NEXT_TASK สำหรับ backend writer ใน worktree แยก:

1. แยก path/ACL/strictJSON/SecureString/DPAPI-envelope validation เดิมจาก scripts/drive-local.ps1 เป็น internal helper ร่วม คง Status/Configure-only และ no-network/no-start invariant ของ helperเดิม
2. loader รับ Root-validated ProcessStartInfo ของ frozen Node/backend build กับ canonical configuration root เดิมที่ phase2 ไม่เปลี่ยนไปสร้าง configใหม่ตาม worktree
3. decrypt current-user DPAPI เฉพาะ approved launch scope ใส่ GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, ACF_DRIVE_ALLOWED_REDIRECT_URIS, ACF_TOKEN_ENCRYPTION_KEY ให้ child environmentเท่านั้น ไม่แก้ parent environment ไม่ใส่ใน CLI/.env/log/file
4. ตรวจ fixed callback3006/current SID/protectedACL/no-reparse/strictboundedUTF8JSON/canonical32byte vaultkey คง ciphertext/vaultkeyเดิม ล้าง secret dictionary/buffers/BSTR และ Dispose secure strings ใน finally
5. public launch wrapper เรียก Process.Start ภายใน secret lifetime เดียว ไม่ส่ง config object/plaintext ออก pipeline ไม่รัน arbitrary callbacks/NODE_OPTIONS/inspectors
6. Owner authorization ต้องเป็น launch approval ใหม่หลัง backup/frozen build/rollback ห้ามหยุด listenerเดิมหรือเปิด OAuth อัตโนมัติ สำเร็จ startup ไม่เท่ากับ Drive connected
7. ใช้ synthetic DPAPI fixtures ทดสอบ success/failure: child-only5mapping/parent unchanged/ciphertext unchanged/fail-before-spawn/wrongSID+ACL+links+JSON+callback+DPAPI/no plaintext output พร้อม independent security review

เมื่อ Ownerตั้งconfigแล้ว ต้อง consent และ separately approved live canary upload/download/size/SHA256/MD5/restore verification ก่อนอ้าง VERIFIED ห้ามลบ local media หรือ storage cutover โดยไม่อนุมัติ
