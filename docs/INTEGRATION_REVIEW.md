# UI and core integration review

STATUS: INTEGRATED_CANDIDATE_REVIEW_PENDING
ENGINEERING_QA: PASS
APP_IMPLEMENTATION_VISUAL_QA: PENDING
Updated: 2026-10-09 (Asia/Bangkok)

This checklist applies to the combined UI/core candidate on `integration/v1-ui-core`.
Backend/core and design changes were merged without conflicts; protected backend/shared/public/
package files and lockfiles were unchanged. The design branch's earlier PASS does not
accept this combined candidate. Use the actual integrated application
and isolated synthetic fixtures only; never enter a real owner's data or treat mock content
as live generation.

## UI-to-core contract map

| UI surface | Existing behavior/API to verify | Boundary |
| --- | --- | --- |
| Setup, login, session | Cookie auth, `/auth/status`, setup/login/logout and CSRF-protected mutations | Keep the current owner cookie/CSRF model; do not introduce client secrets or tokens in browser storage. |
| Brief and ideas | `POST /projects`, then ideas job; project detail and jobs refresh | Exactly ten ideas; visibly synthetic when Mock is active. |
| Selection and expansion | Saved single `selectedIdeaId`, then selected-only expansion job | Expansion uses only the saved selection; failed work retains prior valid package. |
| Bibles, scenes, Flow prompts | Project package and `GET /projects/:id/prompt-pack` | Thai scene explanation and English prompt remain separate; copy only the English prompt. Flow is an external, user-operated handoff. |
| Queue and retry | `GET /jobs`, `POST /jobs/:id/retry` | Show actual status/progress; deliberate eligible failed-job retry only. No inferred worker health or ETA. |
| Clip import | `POST /projects/:id/clips`, authenticated clip file route | Keep scene binding, server media validation, 128 MiB limit and real local media handling. Preserve prior valid clip on rejection. |
| Editor and export | `GET /projects`, existing `#story/{id}/clips`, export operation, authenticated `/exports/:id/file` | Local FFmpeg assembly remains the working path. Export requires every scene clip; show real MP4 only. |
| Optional integration surfaces | Authenticated capabilities/Drive/cloud routes and `shared/integrations.ts` | Mock must be labelled synthetic. Drive, Supabase, cloud deployment and worker pairing are not live-verified. |

## Functional and visual review matrix

Record an observation or screenshot per failed case. Review the actual integrated app at each
viewport, in both UI locales; content-language checks apply to bilingual fields.

| Area | Required review |
| --- | --- |
| Layout | 360 / 768 / 1440 px; TH / EN chrome; TH / EN / TH+EN content; no page overflow; 16px / 24px / 32px gutters and responsive nav; controls have 44px targets. |
| Auth and shell | First-owner setup and login states, session refresh/expiry, logout clears rendered private state, route and direct hash navigation, responsive menu/dialog, focus return and visible keyboard focus. Use an isolated test owner/data directory; no shipped login exists. |
| Story workflow | Create brief, generate exactly ten ideas, save one, navigate away/back, expand only saved idea, confirm locked/unsaved states, bibles and scene ordering. Verify errors do not erase prior valid content. |
| Language and accessibility | UI locale and content mode remain independent; TH+EN stacks Thai above labelled English. Prompt copy is English-only. Check long Thai/English wrapping, labels, status announcements, dialogs, keyboard operation and 200% zoom. |
| Manual Flow | Review plan and prompt pack; external Flow link opens manually. No app-side generation, paid call, cost estimate, saved approval or claim of Flow connection. Cost remains Unknown. |
| Queue and recovery | Queued/running/completed/failed states reflect API; retry is deliberate and eligible only. Offline blocks operations and reconnect refreshes truthfully; no invented progress, worker status or ETA. |
| Media and editor | Valid/invalid/wrong-scene/oversized imports, replacement and interrupted upload; prior valid media remains clear. Assemble only with all scene clips; inspect authenticated playback and downloaded MP4 from local FFmpeg. |
| Privacy/cache | Inspect localStorage and service-worker cache through login, private screens, media, offline and logout. Only public `acf-locale` and `acf-content-mode` preferences may persist; no private content, credentials or media. Cache only public shell. |
| Planned services and publishing | Drive shows disconnected/unavailable unless actual API evidence says otherwise. Supabase/cloud and Local Worker remain unverified. Publishing is unsupported; no publish action. Secondary factories remain planned. |

## Evidence record

Root executed the checks below on the combined candidate with isolated synthetic data.
See the bounded [QA record](integration/QA_RESULTS.json) for exact dimensions and limits.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Merge and protected-path review | PASS | `integration/v1-ui-core` merged without conflicts; backend/shared/public/package/lock unchanged. Candidate base: `dfe2b2c89599fec84472840b4934e5e1604a0805`; design input: `cad482e906f2dcc6db172c085196643a75f70c4f`. |
| Automated checks | PASS | `npm.cmd test`: 64 total, 63 passed, 0 failed, 1 POSIX-only skip on Windows; full lint; build including all three typechecks; `validate:pwa`; compiled mock smoke; docs validation (27). |
| Browser functional workflow | PASS | Chrome synthetic isolated flow: setup/project, ten ideas, save idea 10, unsaved idea 9, expansion still uses 10, four Bible tabs/keyboard, English-only copy across 3 content modes, prompt pack, invalid clip 400, three valid 8-second clips, export 202, completed queue, preview/play/download. |
| MP4 output | PASS | `ffprobe`: H.264, 1080×1080, yuv420p + AAC, 24.021333 seconds. Synthetic clips only. |
| Modal/drawer/picker interaction | PASS | Review:12 Tab+12 Shift+Tab; drawer/picker:16 each direction per dialog. No escape; Escape/focus return and44px controls passed at360px EN. Actual project picker navigated to saved clips;6 planned modules disabled. |
| Responsive216-case matrix | PASS |12 views ×3 widths ×2 UI locales ×3 content modes; no document overflow, missing heading, undersized enabled DOM control, bad paired language order or incorrect idea count. Six additional login layout/draft cases passed. |
| Offline/cache/auth final checks | PASS | Seven clip controls and MP4 download disabled offline; cached-shell reload restored no private project. Online Refresh restored saved data. Failed401/valid200 login, password toggle, missing-session reload and logout cleared state. Projects/clip/MP4401 after logout. Nine public cache entries; only two preference keys; sessionStorage empty. |
| QA helper launch | PASS | Guarded fresh database on3005, health/first-owner state verified, then process stopped. Original apps/owner storage untouched. |
| Staged hygiene | PASS |27 documents/local links,109 tracked files secret/ignore validation without printing values, and staged whitespace passed. |
| Antigravity implementation visual QA | PENDING | Must inspect actual integrated app, not the prototype. |
| Live Drive / Supabase / cloud / worker / Flow | NOT VERIFIED | Credentials, deployment, pairing and user-operated creative acceptance are separate gates. |

For a safe review launch from the integration worktree, run `npm.cmd run build`, then
`node scripts/integration-qa-server.mjs`. It serves loopback at `http://127.0.0.1:3004`
with a fresh ignored `.tmp` database per launch, strips live provider credentials and forces
Mock mode. Enter synthetic credentials of your choice; there is no default login. This server
does not use the owner's database. Stop the process after review; current Root review server
is on port3004, while ports3001/3003 are separate and untouched. That existing fixture already
has a synthetic test owner. For a fresh review on a free port, set PowerShell
`$env:ACF_QA_PORT='3005'` before starting the helper, then choose your own synthetic credentials.

Actual combined-app captures (TH+EN content): [360px Thai ideas](integration/ideas-360-th.png),
[768px English scenes](integration/scenes-768-en.png), [1440px English preview](integration/preview-1440-en.png).
These captures support engineering evidence; they do not replace Antigravity's actual-app review.

Do not mark overall implementation visual QA complete until Antigravity's visual review
covers the actual integrated app, with defects
fixed and evidence recorded. Preserve the existing SQLite/auth/local-media/FFmpeg lane until
separately approved migration and verified cloud services.
