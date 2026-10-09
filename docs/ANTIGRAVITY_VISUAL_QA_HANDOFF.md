# Antigravity visual QA handoff — integrated Story Factory

ANTIGRAVITY_STATUS: READY_FOR_IMPLEMENTATION_VISUAL_QA
APP_IMPLEMENTATION_VISUAL_QA: PENDING
Updated: 2026-10-09 (Asia/Bangkok)

Please visually review the **actual integrated candidate application** in Root's
`integration/v1-ui-core` worktree against [UI_SPEC](UI_SPEC.md), [DESIGN_SYSTEM](DESIGN_SYSTEM.md),
[MOBILE_UX](MOBILE_UX.md), [MOTION_SPEC](MOTION_SPEC.md), and [VISUAL_QA](VISUAL_QA.md).
Do not review only `docs/design/` or reuse its screenshots as implementation evidence. The
design branch's `APP_IMPLEMENTATION_VISUAL_QA: PASS` marker does not accept this combined
candidate; app implementation QA remains pending.

Root reports that the integrated candidate combines main `dfe2b2c89599fec84472840b4934e5e1604a0805`
with design branch `cad482e906f2dcc6db172c085196643a75f70c4f` without conflicts. Root has
completed core/browser functional checks described in
[INTEGRATION_REVIEW](INTEGRATION_REVIEW.md) and [QA record](integration/QA_RESULTS.json).
Engineering checks passed:63 automated passes/1 POSIX skip,216 responsive+6 login cases,
clipboard, dialog/drawer/picker, offline/cache/auth and real synthetic MP4. Review the current
candidate commit SHA before capturing
evidence, since UI fixes may advance it.

From `D:\xampp\htdocs\Ai-content-factory\.worktrees\integration-v1-ui-core`, run
`npm.cmd run build`, then `node scripts/integration-qa-server.mjs`. Open
`http://127.0.0.1:3004` and create synthetic credentials of your choice. The helper creates
a fresh ignored `.tmp` database each launch, forces labelled Mock mode, removes live provider
environment credentials and does not touch the owner's database. No default login is shipped.
The existing3004 fixture already has Root's synthetic test owner; for a
fresh fixture set PowerShell `$env:ACF_QA_PORT='3005'` before launching and open that port.
Close the server after review. Record browser/version, viewport, locale/content mode
and a screenshot or observation for each issue. Return findings by severity with reproducible
steps and expected behavior. No external Antigravity message has been sent; this document is
the prepared handoff.

Captures from the actual integrated app: [360px Thai ideas](integration/ideas-360-th.png),
[768px English scenes](integration/scenes-768-en.png), [1440px English preview](integration/preview-1440-en.png).
Please inspect the running application as well as the captures, including failure/busy states
and the visual/physical-mobile/assistive-technology coverage that engineering DOM checks do
not establish. Enter real service consent or publishing only under separate owner authorization.

## Review coverage

- 360, 768 and 1440 px in Thai and English UI; exercise TH, EN and TH+EN content where data is bilingual.
- Auth/setup and shell, dashboard, brief, exactly ten idea choices, one saved selection, selected-only expansion, four bibles, ordered scenes, manual Flow prompt handoff, queue/retry, scene clip import, editor, authenticated preview and MP4 download.
- Keyboard and focus, modal/drawer Escape and focus return, long text, 44px controls, empty/error/busy/offline states, reconnect and logout/private cache behavior.
- Confirm Thai explanations and English prompts retain source language; prompt copy contains only English.
- Confirm the integrated screen reports synthetic Mock content as synthetic and local storage honestly. Google Drive/Supabase/cloud deployment/Local Worker pairing are not live-verified. Cost remains Unknown; review acknowledgement is not durable approval. Flow remains manual. Publishing is unsupported and must not be actionable.

The review must preserve the current authenticated owner cookie/CSRF behavior and real local
SQLite/media/FFmpeg lane. Report API or security regressions to Root; visual review does not
authorize endpoint, schema, migration or service changes. Keep UI acceptance separate from
live AI quota, Google Flow creative quality, Drive authorization, hosted Supabase, cloud
deployment and worker pairing gates.

## Result to return

| Item | Result |
| --- | --- |
| Candidate commit / launch invocation | See integrated SHA inputs and loopback 3004 instructions above; confirm latest candidate SHA with Root |
| Browsers and viewport/locale matrix covered | PENDING |
| Screenshots or observations | PENDING |
| Findings with severity and reproduction | PENDING |
| Retest after fixes | PENDING |
| App implementation visual QA | PENDING until Antigravity reviews the actual candidate and Root accepts evidence |

This file prepares a review handoff only; no external Antigravity message has been sent.
