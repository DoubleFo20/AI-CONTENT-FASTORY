# UI specification — AI Content Factory

STATUS: DESIGN_SPEC_READY_FOR_CODEX
IMPLEMENTATION_STATUS: PENDING
Finalized: 2026-10-09 (Asia/Bangkok)

This specification defines the implementation target for the Story Factory V1 validation shell. It keeps the current React/TypeScript/Vite architecture, hash routes, `shared/contracts.ts` data model, and frozen API contract. It specifies a premium dark studio presentation without authorizing API, schema, worker, storage, billing, or security changes. Implement presentation where existing contracts provide data. Keep contract-dependent surfaces explicitly unknown or unavailable until Root approves the corresponding contract.

## Product and visual rules

- Story Factory is the primary V1 path: brief → exactly 10 short ideas → save exactly 1 selection → expand only that selection → bibles/scenes → creator-operated Google Flow → import clips → local FFmpeg assembly → review/export.
- Secondary factories and Media Library/Publish remain navigation foundations only. `shared/modules.ts` currently declares them and Settings as `planned`; do not activate unavailable generation/storage/account services. The design may add a client-only Settings dialog/panel for backed language preferences and sign-out, with advanced storage/account actions visibly unavailable.
- Use the accepted dark studio tokens: background `#080b12`, surface `#121b2a`, raised `#1a2638`, decorative border `#2d3e55`, essential control/focus border `#667a95`, text `#eef3fa`, muted `#afbdd0`, subdued `#8497b0`, mint `#8aefcb`, dark mint `#09221b`, warm `#f6c778`, violet `#aa9cff`. Essential control boundaries and focus indicators use `#667a95` or stronger contrast; decorative separators may use `#2d3e55`. Use Segoe UI / Leelawadee UI / Tahoma system fallbacks. Type scale: 12 metadata, 14 labels, 16 body, 20 card, 28 section, 40 hero. Body line-height 1.65. Spacing 4/8/12/16/24/32/48px; control/card/hero radii 8/16/24px.
- Thai is default for UI locale. Keep UI locale and public content-language mode separate: `acf-locale` controls interface language; `acf-content-mode` controls TH, EN, or TH + EN display. Persist only these non-sensitive preferences in localStorage, independently. In TH + EN mode, every bilingual field stacks Thai first and English second at every viewport size. Keep Thai scene explanations and English Flow prompts in their source languages in every chrome locale. Label each clearly. The prompt action must read “COPY ENGLISH PROMPT” (localized equivalent in Thai) and copy only `scene.flowPromptEn`.
- At 360–767px use 16px page gutters, one-column content, a modal navigation drawer, and a bottom bar with Studio / Create / Queue / More; all actions have 44px minimum targets. At 768–1199px use a 72px icon rail with accessible labels and 24px gutters. At ≥1200px use a 248px navigation rail, 32px gutters, and a 1200px maximum main content width. Never require hover; long Thai and English text wraps without page-level horizontal overflow. Keep workspace section navigation keyboard reachable and horizontally scrollable only within its own row on narrow screens.
- Use high-contrast matte surfaces with restrained glass treatment on chrome/hero surfaces only; content cards remain legible and low-glare. Avoid generic admin metric walls, dense tables, heavy operational 3D, and decorative effects that compete with the story. Focus ring remains distinct from mint selection styling.

## Existing implementation anchors and disposition

| Area | Current anchor/capability | Disposition |
| --- | --- | --- |
| App shell/auth/routing | `src/App.tsx`: `readRoute`, `AuthForm`, `.topbar`, `.sidebar`, `#content`, locale and offline/error alerts; hash routes `dashboard`, `stories`, `queue`, `story/:id/:section` | IMPROVE visual shell, responsive rail/drawer, focus and active section. KEEP auth/session/route logic and public-only PWA behavior. |
| Dashboard/project list | `App.tsx` dashboard branch, `ProjectCards`, `Dashboard` and `ProjectSummary` | IMPROVE into creator-oriented welcome, one dominant Create action, recent work and factual counts labeled All stories (`projectsCount`), Active jobs (`activeJobsCount`), Exported videos (`completedCount`). Do not invent active-project, worker, ready-review, or Flow-credit data. |
| Create brief | `ProjectForm` in `src/components.tsx`, POST `/projects` | KEEP schema and fields. IMPROVE layout, helper hierarchy and field states. |
| Ideas and bibles | `Workspace` sections `workspace-ideas`, `workspace-bibles`; `Idea[10]`, `selectedIdeaId`, `package` | KEEP exact count, single saved selection, locked selection after expansion and server prerequisites. IMPROVE card reading and explicit unsaved/saved distinction. |
| Scenes/Flow | `workspace-scenes`, `CopyButton`, prompt-pack download, official Flow link | KEEP user-operated handoff and scene text source languages. IMPROVE separated Thai explanation / English prompt panels and copy confirmation. Do not imply Flow automation. |
| Queue/clips/editor/preview | `Jobs`, `ClipImport`, export operation, authenticated clip/export routes, video elements | KEEP queue truth, manual eligible retry, scene-scoped import and local assembly. IMPROVE progress/status presentation, error recovery and preview hierarchy. |
| Modules | `shared/modules.ts`; only `story` is active | KEEP registry and planned status for secondary factories/tools without contracts. Auto Editor is an existing V1 capability: its Tools entry opens a client-only project picker backed by `GET /projects` and navigates the chosen project to `#story/{id}/clips`; no standalone endpoint is needed. |
| Locale/content mode | `src/i18n.ts`, `Locale` in `shared/contracts.ts`, current `acf-locale` preference | KEEP Thai-default UI locale. Add separate public `acf-content-mode` preference for TH/EN/TH+EN; the values are independent. Add proposed labels symmetrically before use. Never persist private project data or credentials in browser storage. |

## Global shell and shared patterns

**Navigation.** Desktop/tablet use the navigation rail with Dashboard/Studio (`#dashboard`), Story Factory (`#stories`), Queue (`#queue`), and Tools. On mobile, bottom navigation has Studio, Create, Queue, and More; More opens a modal navigation drawer with accessible name, close action, backdrop, Escape handling, and focus return. Tools > Auto Editor is active: open a client-only project picker populated by `GET /projects`; selecting a project navigates to `#story/{encodedProjectId}/clips`. No standalone editor endpoint is needed. Product Review, Kids & Toy, Investment Lab, Media Library and Publish remain visibly planned/unavailable. Settings may open the client-only preferences dialog/panel described below. Locale selector stays available on auth and signed-in pages; content-language mode is separate. Sign out remains reachable from More/menu.

**Page frame.** Page heading includes a concise title and one primary action at most. Use section headings, short helper text, and cards only when they create useful grouping. On a story route, render one active workspace panel at a time while preserving existing Brief / Ideas / Bibles / Scenes / Clips / Preview hash anchors; section changes focus the selected panel without discarding project context. Keep project name and actual production-stage badge visible. Active anchor is announced and visually distinct. Respect direct hash links and scroll focus behavior in `App.tsx`.

**Cards and controls.** Cards use surface/raised tokens, 1px decorative border, 16px radius, 16–24px padding. Primary button uses mint on dark-mint; secondary is transparent/raised outline; destructive/error uses semantic danger plus text. Inputs use raised surface, 8px radius, essential 1px control border `#667a95`, clear labels/helper/error text, and persistent focus ring with equivalent or stronger contrast. Chips/badges always contain text/icon as well as color. Progress exposes numeric label and native `<progress>`; do not animate invented percentages. Skeletons preserve final content dimensions and are only used while an existing fetch is pending.

**Notifications and async.** Reuse app-level `role=alert` for actionable errors, `role=status` for offline/busy, and `Jobs` for durable job states. Preserve form/project context after errors. Disable only the action that cannot safely repeat and keep its label stable with translated busy text. An expired session clears private state and returns to auth as current `AUTH_REQUIRED` handling does. Offline keeps loaded content readable; disable API-dependent mutations/import/export and show the offline message. Do not claim queued offline work.

**Unknown readiness.** The contract returns `Dashboard.projectsCount`, `completedCount`, `activeJobsCount`, recent projects, and `Job.status/progress/errorCode`. Dashboard count labels are All stories (`projectsCount`), Active jobs (`activeJobsCount`), and Exported videos (`completedCount`). It has no worker heartbeat, `waiting for worker`, `ready for review`, Flow credit estimate, or durable approval/readiness field. Do not derive these from a queued job or `exported` status. Credit cost remains unknown until an approved trusted source provides it; never show fabricated numbers or inferred estimates.

## Screen specifications

### 1. Login and first-owner setup

**Anchor:** `AuthForm` (`src/components.tsx`), auth branch in `src/App.tsx`; `GET /auth/status`, `POST /auth/login`, `POST /auth/setup`.

**Layout:** Center a compact 480px maximum form card within a quiet cinematic background; place brand and locale selector above/alongside. At mobile use full-width card with 16px gutters. Keep username and password labels persistent and use existing autocomplete values. Setup copy states first-run owner setup and password rules; login copy stays concise. No social auth, password recovery, or account links without contracts.

**States:** Auth loading shows a compact skeleton/status label; setup/login form is ready state. Invalid credentials use the generic translated error. Busy submit disables submit and announces progress. Offline blocks submission and shows global offline message. Setup already configured returns translated `ALREADY_CONFIGURED`. Preserve typed fields for ordinary request errors. Expired session resets to sign-in without private content.

**Acceptance:** TH default and EN switch work here; focus begins at page heading/form per existing focus model; input, submit, focus, invalid and disabled states are distinct and meet 44px mobile target.

### 2. Dashboard

**Anchor:** Dashboard branch of `App.tsx`; `ProjectCards`; `GET /dashboard`, `GET /projects`, `GET /jobs`.

**Layout:** Brief welcome and dominant “Create a story” action first. Follow with at most three compact factual metrics (`projectsCount`, `completedCount`, `activeJobsCount`), recent projects as visual cards with stage/date, and a small queue summary only when real job data is available. First-screen hierarchy points toward Story Factory. Secondary module tiles may appear below as planned destinations; Investment Lab must not dominate. Do not add unsupported worker, ready-review, storage, or Flow-credit counts.

**States:** Initial base fetch is status/skeleton; zero projects shows first-story empty state with create action; populated state shows recent projects and actual stage. API failure uses global alert and refresh. Offline retains loaded dashboard with offline notice; cold offline shell explains reconnection. A job count is not worker health.

**Acceptance:** At 360px metrics stack or use a readable two-plus-one grid; recent cards have clear link targets without nested actions; the primary action remains near top.

### 3. Create Content / Story Factory brief

**Anchor:** `ProjectForm` (`src/components.tsx`), stories route, `POST /projects`, `ProjectInputSchema`.

**Layout:** Focused creation step, not generic module catalog. Keep name, genre, audience, aspect ratio (9:16 / 16:9 / 1:1), and brief fields. Use two columns at desktop, one on mobile; brief spans full width. Include exact brief constraints (10–4,000 chars) and concise helper text. Clear “Create project” action.

**States:** Ready fields, inline browser/schema validation, preserved input on request error, busy create, offline disabled submit, then navigate to created project. No model, price, Drive destination, or video-generation settings.

**Acceptance:** Translate all labels/errors; helper is programmatically associated; successful creation opens `#story/{projectId}`.

### 4. Story idea selection

**Anchor:** `workspace-ideas` in `Workspace.tsx`; `IdeaSchema`, `selectedIdeaId`; `/projects/:id/ideas`, `/select`, `/expand`.

**Layout:** Concise “10 ideas, choose one” instruction. Exactly ten numbered radio cards with localized title, logline, hook. Distinguish local radio choice from persisted selection until “Save selection” succeeds. Show one selected radio and a saved-selection badge. Expansion is separate and requires that saved selection. After expansion, keep cards visible/read-only with locked message.

**States:** No ideas: empty card plus explicit Generate 10 Ideas action. Queued/running: show real job status and prevent duplicate operations. Exactly 10: selectable. Count mismatch: current error alert; never truncate or generate one-by-one. Unsaved choice is labeled not yet saved. Save busy/error preserves choice. Successful expansion locks selection. Do not show partial ideas as valid.

**Acceptance:** Exactly ten choices and at most one selection; radio fieldset/legend semantics; expansion disabled until server-saved choice; Thai text wraps; no hover-only cue.

### 5. Story project overview

**Anchor:** `Workspace` heading and `workspace-brief`, project summary from `GET /projects/:id`.

**Layout:** Project name, actual stage badge, and section navigation controlling one active workspace panel. Brief card summarizes brief, genre, audience, aspect ratio. Show one “Next step” callout only when deterministically derivable from project fields/jobs (e.g. no ideas → create ideas; saved idea and no package → expand; package → review plan/import as applicable). Never label “ready for review” from stage alone; if next action is ambiguous, show section navigation instead of guessing.

**States:** Project load skeleton; missing project uses translated `NOT_FOUND`; expired auth clears state; offline preserves loaded project. Active-job banner is based only on queued/running job. Keep prior valid content visible when a later job fails.

**Acceptance:** Direct hash links work; current section is exposed via `aria-current`; no project ID or storage path is shown.

### 6. Story Bible, Character Bible, Location Bible, Continuity

**Anchor:** `workspace-bibles`; `StoryPackage` in `shared/contracts.ts`.

**Layout:** Four named BibleTabs show one active bible panel with arrow/Home/End keyboard navigation. Story Bible is one readable narrative panel. Character and location panels use repeatable cards; names/background/descriptions use selected TH/EN content, while stable visual descriptions remain labeled English. Continuity rules are an ordered list, preserving source order. Keep the active panel's content visible without mandatory nested collapse controls.

**States:** Before package: current empty-package message and link/action toward Ideas; expansion queued/running shown from actual job. Loaded package shows validated data. Failed expansion retains any prior valid content and shows error at operation location. No edit controls because no update API exists.

**Acceptance:** TH + EN mode shows both values with explicit language labels; long descriptors wrap; lists remain readable at 360px.

### 7. Scenes / Storyboard

**Anchor:** `workspace-scenes` scene cards in `Workspace.tsx`; `StoryPackage.scenes`.

**Layout:** Ordered vertical storyboard, one scene card per scene, with index/title/duration, referenced character names and location, Thai explanation, localized narration, and Flow prompt panel. Maintain deterministic scene order; a compact timeline rail may be decorative and cannot replace accessible headings. Mobile uses vertical cards.

**States:** No expanded package gives current empty-package state. Loaded scenes show complete referenced content. Do not show per-scene generation state absent API data. Data errors use translated app alert. Never imply scene edits or drag reordering persist.

**Acceptance:** Unique scene heading; explanation `lang=th`, narration follows selected content view, English prompt `lang=en`; order and duration remain textual.

### 8. Google Flow Prompt / creator handoff

**Anchor:** `workspace-scenes`; `CopyButton`; prompt-pack download; official Flow link; `GET /projects/:id/prompt-pack`.

**Layout:** Each scene has distinct Thai explanation and English prompt. Render English prompt as selectable, wrapping plain text, not a horizontally scrolling code block. Prominent “COPY ENGLISH PROMPT” copies only `scene.flowPromptEn`; adjacent accessible copied/failed announcement. Provide JSON prompt-pack download and user-operated Open Google Flow link with concise instruction to create/review clips in Flow and import them here.

**States:** No package is empty/unavailable; copy/download feedback is translated; offline blocks pack download and leaves rendered text available for selection/manual copy if clipboard works. Flow availability is external and not an app connection state. Do not display generation progress, generated video status, or automated Flow control.

**Acceptance:** Thai explanation is never included in copied text. Prompt is not auto-translated. External link states that Flow work occurs outside this app. No credit estimate without an approved trusted source and units/currency.

### 9. Production review and approval

**Anchor:** Review content is composed from `Workspace` bibles/scenes. No approval endpoint/model or `ready_for_review` state exists in `shared/contracts.ts` / `docs/API_CONTRACT.md`.

**Current V1 presentation:** Provide a review section or panel before the creator leaves for Flow: selected idea, bibles, scene count, language labels, and prompt-pack availability. A manual review acknowledgment may use the action “Confirm plan and open Flow” / Thai equivalent, then open the existing external Flow link. It confirms only that the creator reviewed the displayed plan; it does not persist approval, enqueue a job, purchase credits, or launch paid generation. Flow cost remains unknown. Do not store approval in localStorage or infer durable approval from this acknowledgment.

**Contract-dependent future state:** Persistent approval requires a reviewed contract for approver identity, timestamp, approved plan/version fingerprint, invalidation when plan changes, read-back, and allowed next transition. Credit estimate requires trusted provider data with units/currency, validity time, and unavailable/error semantics. Until approved, show “Estimate unavailable” / “No saved approval” only if product owner wants those copy states; otherwise omit widgets. Avoid green approval/readiness badges.

**States:** Missing package → cannot review; validated package → review summary. Active non-Flow job shows actual queued/running state. Failed operation shows known safe translated error. Flow remains manual; there is no app-side paid-job progress.

**Acceptance:** User can inspect the whole plan and return to sections. The manual “Confirm plan and open Flow” acknowledgment is not saved approval and triggers no paid job. Durable approval remains gated on separately approved API/data changes.

### 10. Production Queue

**Anchor:** Queue route in `App.tsx`, `Jobs` in `src/components.tsx`; `GET /jobs`, `POST /jobs/:id/retry`.

**Layout:** Job cards in returned order; each identifies project, job type, translated status, real numeric progress/bar, and safe localized failure details. Retry appears only for failed jobs and valid prerequisites; it is manual and communicates text generation may use paid credits. Keep project link visible.

**States:** Empty; queued/running; completed; failed with safe error and retry; loading; API error; offline. Active jobs poll only while signed in/online per App behavior. No heartbeat or “waiting for worker” inference from queued age. A queued item remains “Queued” unless a contract adds a worker/timeout signal.

**Acceptance:** Text accompanies progress/color. Retry disabled if another active operation belongs to same project. No automatic retry or fabricated ETA.

### 11. Clip Import

**Anchor:** `ClipImport` in `Workspace.tsx`; `POST /projects/:id/clips`; authenticated clip file route.

**Layout:** One card per scene, with index/title, latest filename/duration, bounded preview, and scene-specific file picker. Display accepted formats and 128 MiB limit from security/operations docs. Label replacement clearly. Explain server validates actual video metadata. Never expose private path.

**States:** No clip; selected file awaiting explicit upload; upload busy; successful current clip; rejection (`INVALID_MEDIA`, `FILE_TOO_LARGE`) with translated reasons and preserved project; offline blocks upload but keeps current metadata. No granular upload percentage contract; do not fabricate one. Earlier clip retention is backend behavior; show latest clip and do not imply deletion.

**Acceptance:** Each input is associated with its scene; replacement is explicit; current clip is available through authenticated route; controls work by keyboard/touch.

### 12. Auto Editor

**Anchor:** Active Tools navigation entry; client-only project picker populated by `GET /projects`; selection navigates to existing Clips panel at `#story/{id}/clips`. Editor capability is the auto-edit card inside `workspace-clips`; export uses `POST /projects/:id/export` and FFmpeg worker.

**Layout:** Project picker lists actual project names and production stages; selecting one opens its Clips panel. An empty projects list offers Create Story. Present “Assemble and export video” beneath scene clip cards. Show exact missing-scene checklist or all-scenes-covered confirmation. State current V1 assembles latest clips in storyboard order, fits target ratio, trims/pads to scene duration, normalizes output, and retains clip audio when present. No timeline editing, transitions, music, or subtitles.

**States:** No package/scenes, missing clips, all clips present, export queued/running with actual queue status, failed with safe error and deliberate manual retry, completed export linked to Preview. Offline disables enqueue. This is local assembly, never cloud render or Flow generation.

**Acceptance:** Project picker only uses returned projects and existing navigation; no extra backend endpoint. Export is disabled until every scene has a latest clip and no conflicting active job. Do not invent ETA. Preserve prior valid export/content on failure.

### 13. Preview / Export

**Anchor:** `workspace-preview`; authenticated `/exports/:id/file`; `project.export`.

**Layout:** Wide native video player, metadata (aspect ratio/date), and clear Download MP4 action. Native controls, responsive sizing, restrained dark video well. Export is locally assembled MP4. No publish/share buttons without Publish contract.

**States:** No export shows explanatory empty state; queued/running remains in Queue; valid export can play/download; media load error maps to existing video error; offline retains metadata but disables download. No placeholder video.

**Acceptance:** Player keyboard accessible with translated label; authenticated download; no private path; latest export identity updates when changed.

### 14. Media Library (planned)

**Anchor:** `shared/modules.ts` declares `media` planned; no library route, list API, Drive connection, sync, or storage-provider contract. V1 clips and exports are scoped inside projects.

**Target layout (future, visibly marked “Design example — not connected” in any prototype):** Drive-first catalog with provider/location header and truthful connection state, search field, filters for project/scene/file type/status, and responsive file list. Desktop rows show project, scene, filename/type, source location, last-sync/status, and permitted row actions; mobile turns rows into labeled cards with actions in an overflow menu. Include loading skeleton, first-use empty state, no-results state, connection/error state, per-item failure details, and deliberate retry only when API allows it. Current presentation remains a disabled/planned destination and must not show fake files, connected badge, capacity, upload queue, or sync state. Existing project screens show local clip/export context only.

**Future requirements:** Approved contract for Drive authorization lifecycle without raw OAuth detail, connection/error state, provider file identity/ownership, upload/sync statuses, conflicts/retry, source of truth between Drive and local workspace, and offline behavior. User-facing Connected/Uploading/Synced/Waiting/Failed is allowed only when backed by real API state. Never imply local files are synced. Prototype examples stay labeled as non-live design examples and contain no real or invented user files/credentials.

**Acceptance:** Current UI stays truthful; planned module cannot trigger a nonexistent action or present a mock connected state as real.

### 15. Settings (planned)

**Anchor:** `shared/modules.ts` declares settings planned; the current public preference is UI locale and sign-out is in `App.tsx`. The separate content-language mode is a new client-only presentation requirement. No settings endpoint exists.

**Target layout:** A client-only Settings dialog/panel opens from More or the desktop menu; it needs no new API endpoint or production route. Three groups: General / Language (independent UI locale and content-language controls); Account (username display only when supported, sign-out); Storage (Drive-first connection and sync summary). Connection/manage actions remain disabled until integration exists. No credentials, profile editing, billing, model, API-key, or notification controls. Prototype surfaces say “Design example — not connected” and contain no fabricated account/file values.

**Current presentation:** Keep Thai-default UI locale and separate public `acf-content-mode` control for TH/EN/TH+EN; persist these non-sensitive preferences independently. Sign-out stays in the account/menu area. Storage falls back to current local workspace truth: clips/exports are project-scoped local media; Drive connection/sync is unavailable. Settings remains planned until an implementation contract is approved.

**States:** General controls are usable and persist independent public preferences. Account displays only supported identity and sign-out. Storage shows “Drive integration unavailable”; do not call local files synced. Future Drive states include connected, connecting, sync-in-progress, synced, waiting, failed/retryable, offline, and disconnected only when the contract supplies them.

**Acceptance:** UI-locale changes update `document.lang`; content-mode changes do not alter `document.lang`. Only independent public display preferences persist in localStorage. Secrets never appear in normal UI. Drive manage/connect actions remain disabled until integration exists.

## Proposed i18n key additions

Use existing keys where they fit. Existing dictionary coverage includes `dashboard`, `stories`, `queue`, `createStory`, `projectsCount`, `completedCount`, `activeJobsCount`, `recent`, `emptyProjects`, form labels, `ideas`, `ideasInfo`, `ideaChoice`, `hook`, selection labels, `expand`, bible labels, `scenes`, `explanationTh`, `flowPromptEn`, `copy`, `copied`, `copyFailed`, `downloadPack`, `openFlow`, `flowInfo`, `clips`, import labels, `autoEdit`, `editInfo`, `preview`, `downloadVideo`, `queueEmpty`, `progress`, `status`, `offline`, `loading`, `working`, `retry`, `refresh`, and `unavailable`.

Proposed additions (each requires Thai and English values before use): `storyFactory`, `planned`, `plannedModule`, `createContent`, `overview`, `nextStep`, `activeProjects`, `recentProduction`, `storySelection`, `reviewPlan`, `reviewProductionPlan`, `confirmPlanAndOpenFlow`, `selectedIdeaSummary`, `storyboard`, `scene`, `duration`, `languageThai`, `languageEnglish`, `contentMode`, `copyEnglishPrompt`, `promptCopied`, `flowManualHandoff`, `flowOpensExternally`, `estimateUnavailable`, `approvalNotSaved`, `approvalNotAvailable`, `noWorkerStatus`, `noDriveConnection`, `storageLocal`, `uploading`, `synced`, `waiting`, `failed`, `fileSizeLimit`, `acceptedFormats`, `allScenesCovered`, `projectPicker`, `chooseProject`, `noProjectsForEditor`, `settingsUnavailable`, `readyContent`, `savedContent`, `notSavedYet`.

For estimate/approval/Drive copy, product owner must decide whether an explicit unknown-state message is useful on-screen; omission is preferable to implying a feature exists.

## UX acceptance checklist for Codex

- [ ] Preserve endpoints, payloads, data model, and server-enforced transitions; no backend change is implied.
- [ ] Exactly ten ideas render, one selection persists, selected-only expansion remains enforced, and expanded selection locks.
- [ ] Thai explanation / English prompt remain separate; one action copies English prompt only.
- [ ] No automatic Flow generation, paid production action, fabricated credit estimate, worker heartbeat, ready-for-review, durable approval, or Drive sync/connected state.
- [ ] Existing loading, empty, error, busy, offline, expired-session, and retry semantics remain visible and translated.
- [ ] TH/EN chrome and TH/EN/TH+EN content are supported; every new key is present in both locales.
- [ ] 360/768/1440px behavior includes 44px targets, keyboard focus, long-text wrapping, and no page overflow.
- [ ] PWA remains public-shell-only; no private story/job/media data enters browser storage/cache.
- [ ] Product Review, Kids & Toy, Investment Lab, Media Library, Publish, and Settings remain planned until contracts/scope are approved. Auto Editor remains an active V1 capability reached through a client-only project picker and existing Clips panel.
