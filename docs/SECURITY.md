# Security baseline and boundaries

## Credentials and authentication

No default account or password. First-run setup creates exactly one owner from loopback,
closes permanently after setup, and uses a >=12-character password. Hash with Node crypto
scrypt and a random salt; constant-time verification and generic login failure; bounded
login attempts. Random opaque session tokens are stored hashed server-side, expire and are
revoked on logout. HttpOnly/SameSite cookie; Secure on HTTPS. No auth token in localStorage.

Bind loopback by default. Mutating API routes require allowed same-origin JSON/multipart
and CSRF header after login. Setup/login enforce origin and content type too. Never trust
forwarded IP/origin headers without an explicitly reviewed proxy configuration. Apply
prepared statements, strict body schemas/length limits and owner-filtered resource access.
Return safe error codes and never raw exceptions, provider bodies, paths, keys or passwords.

## AI and external access

OPENAI_API_KEY stays in the existing server environment. Never copy/print/store it in
the client or repository. Use the official HTTPS endpoint, bounded timeout/output, no
automatic paid retry or price escalation. The Owner approved reuse; billing/account
changes still require human action. Google Flow operates in the creator's authorized
account; no automated sign-in, invented endpoint or bypass of provider controls.

## Private files, queue and PWA

No uploads or outputs under public/. Size limit 128 MiB, allowlisted extension plus actual
ffprobe validation, random internal name, reject path traversal and arbitrary filesystem
paths. Spawn ffmpeg/ffprobe with argument arrays and shell:false; enforce timeouts and
bounded capture, only operate on managed files. Serve files through authenticated,
owner-filtered routes, no-store, with correct content type and range support. Jobs are
owner-filtered, transactional and persistent; one active job per project, no retry loop.

PWA caches only public shell assets. Never cache /api, uploaded media, exported video,
authenticated JSON or credentials. Logout clears client state. Offline mode cannot
enqueue paid operations. XSS prevention uses React plain-text rendering, no raw HTML.
Avoid secrets in dev logs/test fixtures. Git ignores env files, credentials, media and DBs.

## Deployment and review

This checkpoint targets local loopback use. Production requires HTTPS, reviewed CSP,
origin/proxy rules, durable backups, quotas, abuse controls, multi-user provisioning,
monitoring and approved hosting. Do not claim production hardening from local tests.
An independent read-only reviewer must examine auth/CSRF, ownership, media paths,
queue transitions, error redaction and service-worker caching before checkpoint acceptance.
