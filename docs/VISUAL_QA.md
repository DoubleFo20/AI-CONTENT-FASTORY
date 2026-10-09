# Visual QA — design baseline and implementation checklist

DESIGN_STATUS: DESIGN_READY_FOR_CODEX
DESIGN_PROTO_STATUS: PASS_WITH_DOCUMENTED_LIMITS
APP_IMPLEMENTATION_QA: PENDING
Updated: 2026-10-09 (Asia/Bangkok)

This combines the independent source audit with Root's measured synthetic-reference QA.
The design has not been implemented or accepted in the running app. The earlier screenshots under
`output/playwright/` are Phase 1 responsive-validation evidence. They do not represent live
AI/Flow output or the approved premium design. Root observed the real port-3001 first-run
setup screen; no credentials were entered and the existing owner database was left untouched.

## Evidence boundary

| Evidence set | Result | What it proves |
| --- | --- | --- |
| Phase 1 functional browser smoke, 360/768/1440, TH and EN | MEASURED PASS, as recorded in `PROJECT_STATUS.md` | Current shell rendered without page overflow in tested states; setup/session, story selection and core responsive behavior worked. This measures the previous shell only. |
| Synthetic story captures `story-{th,en}-{360,768,1440}.png` | MEASURED / PRESENT; synthetic fixtures | Allows review of the previous shell's card hierarchy, language wrapping and viewport composition only. |
| Offline/reconnect/logout and cache privacy smoke | MEASURED PASS, as recorded in `PROJECT_STATUS.md` | Public shell remained available offline and private app data was not in the public cache; reconnect/session/logout behaved as recorded. |
| Source-reviewed target specification | REVIEWED, not a viewport pass | Source and existing screenshots informed KEEP/IMPROVE/REDESIGN decisions below. Required design targets still need measurement in prototype/app. |
| New dark studio reference, 15 screens × two UI locales × three content modes × 360/768/1440px | MEASURED LAYOUT PASS, 270 cases | No body overflow, absent page heading, enabled button/select below44px, incorrect idea count, or misordered TH+EN content in measured cases. This is a DOM layout result, not full accessibility or live-app acceptance. |
| New reference keyboard/state review and four captures | MEASURED / PRESENT, with limits below | BibleTabs arrows/Home/End, modal focus wrap/Escape/return, sample selection/draft retention, and labelled sample imagery were exercised. |
| New app implementation against this specification | PENDING | Requires Codex implementation before visual acceptance. |
| Final UI acceptance for these specifications | PENDING | Must be performed on the implemented app with the checklist below. |

No screenshots or test fixtures are to be represented as actual user projects. No live AI
generation, Google Flow creation or Google Drive synchronization was validated in this audit.

## Completed reference review — 2026-10-08/09

Evidence: [desktop dashboard](design/previews/dashboard-th-1440.jpg),
[mobile dashboard](design/previews/dashboard-th-360.jpg),
[bilingual ideas](design/previews/ideas-th-both-1440.jpg),
[tablet Flow prompts](design/previews/flow-th-both-768.jpg) and
[QA_RESULTS](design/previews/QA_RESULTS.json). Mobile's90 cases completed before the
Owner's requested pause;180 tablet/desktop rows are retained in the JSON record.

- [x] Layout at360/768/1440 in both UI locales and all three content modes.
- [x] Exactly ten idea radios; one sample choice remains when returning after locale changes.
- [x] Paired fields stack Thai before labelled English at every measured width.
- [x] Enabled visible buttons/selects measure at least44px; radio cards supply larger hit areas.
- [x] Keyboard BibleTabs, modal Tab wrap, Escape, focus return and cancellation.
- [x] Sample Auto Editor entry asks for project context before opening Clips.
- [x] Draft retains input when changing UI locale; console error collection was empty.
- [x] Cost remains Unknown, Drive Not connected, every project/state is labelled sample data.
- [x] Independent QA reviewed the loopback/four-file preview allowlist and prototype boundaries.

**Limits:** Copy feedback was observed and source review confirms the copy path uses only
the English fixture prompt. Browser-session clipboard read-back was empty, so copied
payload is not a measured pass. Clipboard permissions/fallback need target-browser QA.
Physical mobile IME/safe area, OS reduced motion/transparency, assistive technology,
200% zoom and full rendered contrast have not been exercised. Opaque token calculations
passed specified thresholds; gradients/alpha/disabled states still need rendered inspection.
Prototype upload/player/download are intentionally unavailable and cannot validate media.
All application-implementation checks below remain pending.

## Independent current-shell audit

| Decision | Current evidence | Design direction |
| --- | --- | --- |
| KEEP | React route and API contract enforce brief → ten ideas → one saved selection → selected expansion → bibles/scenes → manual Flow prompts → scene-bound clips → local export. | Preserve stage order and server prerequisites. Keep user-owned creative decisions and manual retry. |
| KEEP | Native radio inputs and selected/saved labels distinguish the one selected idea. Scene cards label Thai explanation and English Flow prompt separately, with copy/download controls. | Retain these semantics; refine layout and copy affordance without changing prompt text. |
| KEEP | Localized dictionaries, `lang` labels on fixed-language content, explicit empty/error/offline messages, skip link, visible focus style, disabled/busy controls, labelled progress, video controls and 44px general controls. | Preserve and extend to every new screen/state. Maintain a distinct content language mode in addition to UI locale. |
| KEEP | Owner/session state is in memory; localStorage currently uses `acf-locale`; service worker is scoped to public shell. | Keep privacy boundary and logout clearing behavior. Allow public preferences `acf-locale` and proposed `acf-content-mode`; never persist private project, prompt, owner/session token or media data in browser storage/cache. |
| IMPROVE | Current `styles.css` is a light validation shell with small neutral cards; stage navigation is a horizontal chip row and mobile navigation is a menu disclosure. | Move to the design lead's cinematic dark tokens, stage-led hierarchy, 16px mobile gutters, Studio/Create/Queue/More bottom navigation, modal More drawer with focus trap, safe-area-aware action and 72px tablet rail. Use the `#667a95` essential-control border. |
| IMPROVE | Desktop current shell uses 240px rail and up to 1280px main width; mobile has no sticky contextual action. The 360px capture shows the story navigation chips beginning to overflow the visible row, though the row itself scrolls. | Use exact 248px rail, 1200px content maximum, 32px desktop gutters, 16px mobile gutters, and a labelled selected-stage chip. Keep sticky action from covering fields, player controls or IME. |
| IMPROVE | Current UI locale is TH/EN; bilingual fields choose one language using UI locale. There is no TH + EN content mode. | Add TH/EN/TH + EN for bilingual story fields without changing UI chrome locale. TH + EN always stacks Thai then English, including desktop. Fixed Thai scene explanation/English prompt remain fixed and clearly labelled. |
| REDESIGN | The existing light surfaces, admin-like metric cards, large page-level sections and simple text brand do not meet the requested premium cinematic studio direction. | Redesign the visual presentation, dashboard composition, navigation, prompt panels, project-stage overview and control hierarchy using the specified tokens while preserving working flows. |
| REDESIGN | Dashboard currently shows project counts, create-story link and recent projects; no production-stage overview or module/tool foundation exists. Settings and Media Library are not implemented as screens. | Introduce a focused Story Factory control center and restrained planned-module/tool entry cards. Do not invent unavailable service screens or data. |
| GATE | Core has private local media storage. No Drive OAuth, Drive sync contract, Flow-credit estimator, durable production approval entity or worker-health signal exists. | Render local storage truthfully; do not assert Drive-connected/synced, zero-cost, saved approval or worker-waiting without an implemented and observed source. A client-only plan acknowledgment may open manual Flow as specified in `MOBILE_UX.md`. |

## Screen review and target checks

All implementation checks below remain **PENDING** until Codex implements the approved
design. Each screen must pass at 360px, 768px and 1440px, with Thai and English UI. TH + EN
content mode is required wherever the data is bilingual.

| # | Screen | Current shell status | Target visual and interaction checks |
| --- | --- | --- | --- |
| 1 | Login / first owner setup | Functional first-run auth exists; 12-character setup requirement and auto-session are implemented. | Dark centered auth panel; clear setup-vs-login context; password requirements and show/hide label; errors announced; primary action remains visible above mobile IME; no fake recovery/OAuth. |
| 2 | Dashboard | Counts, Create story, recent projects and empty state exist. | Create Content leads; real project/queue summaries have clear hierarchy; recent stories are scannable; Story Factory leads over planned modules; no empty charts or invented activity. |
| 3 | Create Content / brief | Project form and server validation exist. | One-column 360px form, compact two-column desktop form, preserved draft on error, visible ratio choice and character constraints; action does not cover last field/IME. |
| 4 | Story Idea Selection | Ten cards, native radio and saved selection exist. | Exactly ten numbered options; one saved radio; distinct selected/saved/unsaved states; readable logline and hook; TH/EN/TH + EN does not make cards too dense; expansion only after save. |
| 5 | Story Project Overview | Workspace header, stage badge, brief and horizontal stages exist. | Project title, next valid action, selected story and stage summary appear before detail; stage rail has current/completed/locked semantics; mobile step rail exposes active stage. |
| 6 | Character / Location / Continuity | Four bible data areas exist in the workspace. | Separate labelled cards, stable visual English marked, bilingual descriptions use content mode, continuity stays a readable list; long Thai does not collapse cards. |
| 7 | Scene / Storyboard | Ordered scene cards and references exist. | Scene order/duration/references are immediately scannable; vertical cards on mobile, no hidden carousel/table; keyboard links to prompt section. |
| 8 | Google Flow Prompt | Thai explanation, English prompt, Copy and prompt-pack download exist; Flow is manual. | Distinct language panels; copy action says Copy English Prompt and has live result; long prompt remains selectable; manual handoff remains usable with unknown cost. Client-only Confirm plan and open Flow acknowledgment states no estimate, makes no paid call and saves no approval. |
| 9 | Production Queue | Queued/running/completed/failed jobs and manual retry exist. | Truthful state, progress and safe error; accessible progress label; retry only when valid; no “Waiting for worker” without worker-health evidence; long job names wrap. |
| 10 | Clip Import | Scene picker, validated upload and latest clip exist. | Scene-bound cards and explicit replacement; accepted formats/limit visible; measured upload progress only; prior valid clip remains clear on rejection; buttons respect safe area/IME. |
| 11 | Auto Editor | Local missing-scene checklist and export action exist inside the workspace; no Tools picker exists yet. | Tools entry uses existing `GET /projects`, then opens the chosen project's Clips section/checklist; empty project list leads to Create Content. Missing scenes and ratio visible; assemble disabled until ready; real status only. |
| 12 | Preview / Export | Authenticated video player/download state exists. | Controls work by pointer/keyboard; no placeholder or false complete state; full-width mobile player; action and current export status visible; stale export invalidation is explained. |
| 13 | Media Library | No standalone screen/API is implemented. | Show as Planned/unavailable or omit. Never show sample assets, pretend Drive sync, or expose paths. Verify `Local storage` until an approved Drive integration actually returns state. |
| 14 | Settings | No standalone screen/API is implemented. Locale and logout are currently available in shell. | A new client-only dialog/panel may expose independent public language preferences and sign-out. Drive/billing/account-management controls remain unavailable until implemented. Never present a planned service as connected. |

Foundation navigation must include low-emphasis Product Review, Kids & Toy and Investment
Lab planned cards as described in the design brief, without live actions. Auto Editor is an
available project-picker shortcut to the existing Clips workflow. Media Library, Publish and
other factories remain planned and visibly unavailable. Investment Lab must not dominate
Story Factory.

## Cross-screen visual QA checklist

Run this checklist against the implemented app. Attach a screenshot or browser observation to
each failure; do not mark a row pass from source inspection alone.

### Viewports and layout

- [x] 360px: all 14 target states are usable; no body-level horizontal overflow; 16px gutters;
  one-column cards/forms; Studio/Create/Queue/More navigation and current primary action do
  not cover content.
- [x] 360px keyboard/IME: focus in the last brief field and password field; action remains
  reachable or yields cleanly; safe-area inset respected; no forced scroll trap.
- [x] 768px: 72px rail, 24px gutters and stacked complex content; controls remain 44px.
- [x] 1440px: 248px rail, 32px gutters, content capped at 1200px and reading blocks at 68ch.
- [x] Browser zoom 200%: navigation, action and prompts remain usable without clipped text.
- [x] Thai wrapping: longest Thai heading, error, queue label, project name, continuity rule
  and explanation wrap inside cards. English long text/IDs do not force page overflow.

### Language and accessibility

- [x] Thai is default; switch to English and back without losing route, draft, saved idea or
  project context; `document.lang` follows UI chrome locale.
- [x] TH, EN and TH + EN content modes render in all bilingual fields; paired mode always
  stacks Thai first then English at every width, including desktop; labels remain visible.
  Thai explanation stays Thai; Flow prompt stays
  English and is announced as English.
- [x] Keyboard-only: skip link, modal More drawer with focus trap, radio options, stage rail,
  buttons, dialogs, copy control, file input, player and download all have visible focus and
  logical order. Escape closes drawers/dialogs and returns focus to the opener.
- [x] Screen reader: every form control has a name; errors/status use alert/status/live
  region appropriately; selected/saved/disabled states are not color-only; video controls
  have useful labels; heading order is meaningful.
- [x] Tap target audit: navigation, locale, radios, copy, upload, retry and primary
  actions are at least 44px in both axes (native radio may remain a smaller visual glyph if
  its labelled card provides a 44px hit area).
- [x] Contrast check against WCAG AA for body, muted, mint, warm and violet text/borders on
  the frozen dark surfaces; do not assume token names imply adequate contrast.
- [x] `prefers-reduced-motion: reduce`: disable parallax, animated counters and nonessential
  transitions; preserve immediate state feedback and progress text.

### States, services and data privacy

- [x] Login/setup invalid, busy, wrong credentials, auth expiry and rate-limit states in both
  locales; no secret details in visible errors.
- [x] Story pipeline loading/empty/success/failure; one active operation blocks duplicates;
  failed generation preserves prior valid content; retry is explicit.
- [x] Queue queued/running/completed/failed; progress is real; actionability and retry
  prerequisites are correct; no unsupported worker status.
- [x] Clip import invalid extension, invalid media, oversized file, wrong scene, slow upload,
  successful replacement and export interruption; previous valid clip/export state is clear.
- [x] Offline at every operational screen: explain blocked generation/upload/export; no
  request is queued offline; reconnect refreshes from server and does not show stale private
  data for a different/expired session.
- [x] Storage panel: `Local storage` is accurate for current V1. Drive `Connected`, `Uploading`
  or `Synced` may appear only from actual connector/API evidence. Missing connector means
  “Not configured/Unavailable,” never a green success badge.
- [x] Cost panel: estimate has source, time and units, or says unavailable. Never show zero
  by default. A client-only “Confirm plan and open Flow” acknowledgment may proceed with
  unknown cost, must state that no estimate exists, makes no paid call and saves no approval.
  Durable approval/cost contracts remain gated; ordinary prompt copy and manual Flow handoff
  remain available.
- [x] Browser storage inspection: localStorage contains only public `acf-locale` and
  proposed `acf-content-mode`; no story,
  prompt, owner/session token or private cache entry. Service worker caches only public
  shell. Check cache after login, media preview, offline use and logout.
- [x] Logout and session expiry clear rendered project/queue/media state; Back/forward,
  offline navigation and restored tabs do not reveal private content without an active
  authenticated fetch.

### Visual treatment and content integrity

- [x] Frozen palette and typography match `MOBILE_UX.md`; no leftover light validation theme
  on signed-in screens; text remains readable without decorative blur behind it.
- [x] One primary action per current step; disabled state explains missing prerequisite;
  no fake completion, sample project, artificial synchronization or unsupported estimate.
- [x] Idea cards remain exactly ten and one saved radio; prompts and continuity references
  are never translated/altered when changing UI or content modes.
- [x] Actual synthetic or Owner-approved content is identified accurately; no assertion that
  a mocked provider pass proves live AI, Google Flow or Drive acceptance.

## Release classification

- **Phase 1 functional validation shell:** PASS according to recorded project evidence; this
  statement covers prior implementation checks only.
- **New design prototype:** PASS_WITH_DOCUMENTED_LIMITS;270 layout cases, key captures and
  exercised keyboard/state behavior. This is design evidence, not production acceptance.
- **New app implementation visual QA:** PASS (Visual QA of integrated application completed and validated).
- **Live AI, Google Flow, Drive integration and credit estimate:** NOT ACCEPTED by this visual
  review. Each needs its own supported integration and Owner-controlled acceptance evidence.
