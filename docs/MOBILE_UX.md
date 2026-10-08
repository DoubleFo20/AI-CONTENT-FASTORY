# Mobile-first UX specification

DESIGN_STATUS: DESIGN_READY_FOR_CODEX
IMPLEMENTATION_STATUS: PENDING
Finalized: 2026-10-09 (Asia/Bangkok)

This specification turns the current functional Story Factory shell into a premium,
cinematic production workspace while preserving its server-enforced story flow. It is a
design target, not evidence that the new visual system or new external services exist.

## Product frame and visual rules

- Story Factory is the primary product. Product Review and Kids & Toy are planned module
  cards; Investment Lab is a lower-priority planned module. None leads to a fabricated
  workflow. Auto Editor, Media Library, Publish and Settings are tools/secondary areas.
  Settings may open a client-only preferences dialog/panel; generation/storage/account
  services without contracts remain unavailable.
- Keep story direction, ten ideas, one saved choice, selected expansion, bibles, scenes,
  manual Google Flow handoff, clip import, local assembly and final review in that order.
- Use the design lead's specified tokens: background `#080b12`, surface `#121b2a`, raised
  surface `#1a2638`, border `#2d3e55`, essential control border `#667a95`, text `#eef3fa`,
  muted `#afbdd0`, mint `#8aefcb` on dark `#09221b`, warm `#f6c778`, violet `#aa9cff`.
  Body text is 16px with 1.65 line height; long reading blocks stop at 68ch. Use the
  essential control border for inputs, selects, segmented controls and focusable outlines;
  do not rely on the quieter card border to distinguish controls. Do not substitute the
  validation shell's light palette for the specified direction.
- Use system UI fonts with Thai-capable fallbacks and no required remote font. Use a compact
  spacing scale (4, 8, 12, 16, 24, 32, 48px), 16px card radius, 8px control radius, subtle
  borders and restrained shadows. Mint marks the primary action and completed/selected
  state; warm marks attention; violet is a secondary creative accent. Keep text and icons
  explicit so color never carries meaning alone.
- Use an editorial stage header, clear page title and one primary action per state. Cards
  should feel like a studio canvas, not a metrics-first admin dashboard. Avoid decorative
  3D, moving backgrounds, glass blur behind body text and dense operational tables.

## Responsive layout

| Viewport | Structure | Navigation and actions | Content behavior |
| --- | --- | --- | --- |
| 360px mobile | One column; 16px side gutters; full-width cards and forms; 16px gaps. | Bottom destinations are Studio, Create, Queue and More. More opens a labelled modal drawer with focus trap, Escape close and focus return. A bottom action bar holds the current step's single primary action, includes `env(safe-area-inset-bottom)`, and moves clear of the keyboard/IME and focused control. | No side-by-side form fields. Horizontal stage chips may scroll, with selected stage visible and keyboard-reachable. Long text wraps; prompt blocks use a bounded scroll area only when paired with Copy. |
| 768px tablet | Content plus a 72px icon rail; 24px content gutters; stacked sections; two-column grids only for compact cards. | Rail icons have accessible names and selected state. Keep primary action visible in a compact sticky footer only when it does not cover content or keyboard. | Bibles and scene details remain stacked; two-column layout is permitted for short metadata and idea cards where both remain readable. |
| 1440px desktop | 248px labelled rail; 32px main gutters; content max width 1200px; article reading width max 68ch. | Persistent rail, topbar with locale and account controls. Primary action sits at the end of the active section or a compact contextual panel. | Two-column story overview and split scene detail are allowed. Keep prompt copy adjacent to English prompt; do not put all scenes into a dense table. |

The mobile breakpoint is below 768px. Tablet is 768–1199px. Desktop starts at 1200px.
At 360px, test the exact width including scrollbar and safe-area insets; no page-level
horizontal overflow is allowed. At all widths, 44px is the minimum pointer target. Labels,
buttons and radio selection must also work with keyboard and assistive technology.

## Mobile task flow

1. Sign in or create the first owner account. Use one centered card, short translated
   explanation, visible password requirements during first-run setup, show/hide password
   control with an accessible name, and a primary action above the mobile keyboard. No
   fabricated OAuth, account recovery or multi-user option.
2. Dashboard opens with a welcome and prominent **Create content** action. Show compact
   active-project and queue summaries only when real API data exists, then recent stories.
   Put secondary modules and tools below Story Factory; mark planned destinations clearly.
3. Create Content opens a short brief form with single-column fields. Preserve draft input
   on validation failure. Keep ratio options as a labelled segmented control or select.
   The sticky Create action must not obscure the last field or browser IME.
4. Idea Selection presents exactly ten numbered cards and a single native radio choice.
   Keep title, logline and hook visible in TH or EN; one workspace content mode switch
   controls all cards. Save one selection explicitly, then show the saved state and enable
   expansion. Never imply that a locally highlighted but unsaved card is selected.
5. Story Overview begins with project name, production stage and brief, then offers a
   compact stage rail and the next valid action. After expansion, show a summary and links
   to Story Bible, Character, Location, Continuity, Storyboard and Flow prompts. Do not
   require repeated backtracking to see the saved idea.
6. Four named BibleTabs show one active panel with arrow/Home/End keyboard navigation.
   Keep its content visible. Character and location entries remain separate, with stable visual description clearly marked
   English and background/description following the selected content mode. Continuity
   rules use a readable numbered list.
7. Storyboard shows scenes as vertically ordered cards with duration, referenced
   characters/location and a clear link to the prompt. On mobile, do not compress scenes
   into a table or use a carousel that hides scene order.
8. Google Flow Prompt presents Thai explanation, bilingual narration and the English Flow
   prompt as separate blocks. The English prompt keeps `lang="en"`, preserves line breaks,
   offers a 44px **Copy English prompt** action, and reports copied/failed state to a live
   region. Prompt-pack download is secondary. Flow generation stays a user-operated
   external handoff.
9. Production Queue uses an ordered list of job cards with project, operation, truthful
   status, progress and safe actionable error. Queued means queued. “Waiting for worker” is
   allowed only when a supported health signal confirms no worker; this V1 contract has no
   such worker-health field. Retry is manual and only appears for eligible failed jobs.
10. Clip Import keeps one scene per card, displays the latest clip and its validated
    duration, and makes replacement explicit. The picker and upload action remain reachable
    above the bottom safe area. Success is shown only after server acceptance.
11. Auto Editor shows a checklist of missing scenes and the planned output ratio. The
    Assemble action is disabled until all scenes have current clips and no active job. Once
    queued, show the real queue status; do not animate an invented percentage.
12. Preview / Export uses a full-width, controls-enabled player with `preload="none"` on
    mobile, a clear export stage and Download MP4. No placeholder video or completion state
    appears before an authenticated export file exists.
13. Media Library is a planned screen. Until implemented, show an honest unavailable/planned
    state or omit the destination. Do not display sample files as user media.
14. Settings groups local account, language, storage and app information. Only controls
    backed by the current API are enabled. The current app supports local owner auth and
    locale preference; Drive connection, billing and cloud settings must remain unavailable
    until supported. Auto Editor is the supported Tools shortcut: use `GET /projects` in a
    labelled project picker, then open the selected project's Clips section and local assemble
    checklist. With no projects, direct to Create Content. This shortcut does not add a new
    editor data model or timeline feature.

Product Review Factory, Kids & Toy Factory and Investment Lab may appear as low-emphasis
module cards with `Planned` status. They must not look enabled, route into Story Factory by
mistake or imply secondary generation, financial advice or child-focused content is live.

## Content modes: TH, EN and TH + EN

- Keep the persistent locale switch for application chrome: Thai default and English.
  Persist the public locale preference as `acf-locale`; never persist private content. Set the
  document language to the active UI locale and announce language changes to assistive
  technology.
- Add a content-view control with TH, EN and TH + EN for bilingual story fields. TH and EN
  show one value at a time; TH + EN shows Thai first, English second, with visible language
  labels. It must not change the locale of UI chrome or rewrite stored content.
- Scene explanation is always Thai and the Flow prompt always English in every mode. Label
  their fixed languages in both UI locales. Do not translate the English prompt implicitly.
- TH + EN is available for titles, loglines, hooks, bible text and narration. Paired content
  always stacks vertically, Thai first then English, at every viewport including 1440px.
- Test the longest Thai strings in headings, validation, error, queue and navigation labels.
  Test English labels with unbroken prompt-like text, punctuation, URLs and 64-character
  technical IDs. Content wraps within its card; only explicit stage chips and marked code
  blocks may scroll horizontally.

## Truthful cost, approval and storage states

The requested premium flow includes a Flow credit estimate and an Approve Production gate.
The current backend has no Google Flow API, credit query, cost-estimate API or approval
entity. The current AI provider also has no price-estimate endpoint. Therefore:

- Provide a designed estimate panel with source, timestamp, assumptions and currency/credit
  units only when a trusted source supplies them. Until then, show “Estimate unavailable”
  with the reason; never show zero, a guessed amount, an inferred “free” state or an enabled
  approval based on missing data.
- Keep the ordinary manual Google Flow handoff available even while estimate is unknown.
  Add a client-only **Confirm plan and open Flow** acknowledgment: tell the user the app
  cannot estimate Flow credits, ask them to review the prompt plan and account cost in Flow,
  then open the official Flow site. This acknowledges intent only; it makes no paid call,
  creates no server record, stores no approval, and must never claim Flow generation started.
- A durable approval/cost contract remains gated. Any future approval action must state what
  it approves and show a trusted cost basis before it can create a server-side approval or
  trigger paid work. This gate does not disable copying prompts or the client-only manual
  handoff acknowledgment.
- Google Drive is requested as the intended primary media-storage experience, while V1
  currently stores media under private local `storage/`. Until an approved Drive connector,
  OAuth flow, ownership policy and sync API exist, label the location “This device” or
  “Local storage”. Never show “Drive connected”, “Synced”, a Drive file path or an upload
  state that the server has not returned.
- Auto Editor can be a Tools entry backed by existing `GET /projects`: show a project picker,
  let the user choose an existing project, then open that project's Clips section and current
  missing-scene checklist. Do not imply a standalone editor or project-independent timeline.
- The current queue supports queued/running/completed/failed jobs, not worker-health
  monitoring. Never infer “Waiting for worker” from a queued job. Render the API's actual
  queued label. Add a worker-wait state only after a health contract and observed status
  are implemented.
- Drive and durable cost/approval contracts are product integration gates, not completed
  Phase 1 features. Keep those items from delaying the already working local story pipeline
  unless Owner reprioritizes them.

## Component and interaction specifications

- **Shell:** consistent topbar, responsive rail/navigation, skip link, page title, offline
  banner, safe error alert and contextual primary action. Mobile More drawer is a modal
  dialog with focus trap, Escape close and focus return to its trigger. Bottom destinations
  are Studio, Create, Queue and More; selected state is visible and accessible.
- **Stage rail:** numbered/icon-plus-label stages with current, completed and locked states;
  include text labels and a clear next action. On mobile use scrollable chips with enough
  hit area and focus visibility.
- **Idea card:** entire card is a labelled radio target; native radio remains visible.
  Selected, saved and unsaved states have both border/icon and text. Disabled fieldsets
  explain why choice is locked.
- **Bible and scene cards:** clear headings and consistent spacing. TH/EN content labels
  persist in TH + EN mode. Avoid truncation of continuity or prompt text.
- **Primary/secondary/destructive buttons:** one primary mint action per section; secondary
  outlined; destructive actions warm/danger and require a concrete confirmation. Busy state
  disables duplicate submits and exposes polite status text.
- **Queue/progress:** semantic list, job status text, native `<progress>` with accessible
  label, bounded animation, exact API percent when present and status-only handling when
  percent is not meaningful. Failed job includes localized safe error and explicit retry.
- **Clip picker/player:** labels identify the scene; accepted formats and 128 MiB limit are
  explained before selection. Upload progress is shown only if measured; server rejection
  retains the prior clip and gives a localized next step. Video controls and keyboard
  operability remain visible.
- **Dialog/toast/notice:** dialogs trap/return focus and work on narrow viewports. Copy
  result uses a live region. Notices are not color-only and persist long enough to read.
- **Browser storage:** allow only public preferences `acf-locale` and proposed
  `acf-content-mode` in localStorage. Project data, prompts, auth/session tokens and private
  media remain memory/server-only and are never placed in CacheStorage.
- **Loading/empty/offline:** skeletons match the actual content shape and are aria-hidden;
  empty states explain the next action. Offline mode explains which operations need a
  connection and never queues paid AI work for later.
- **Motion:** use 160–220ms opacity/position transitions for page/card feedback and restrained
  progress motion. No parallax/Three.js/GSAP on operational pages. Honor
  `prefers-reduced-motion: reduce` by removing nonessential motion and smooth scrolling.

## Design implementation acceptance gates

The visual system is ready for implementation when desktop/mobile tokens, page hierarchy,
all 14 screen states, TH/EN/TH + EN mode behavior, keyboard patterns, error/offline states and
the unsupported-service gates above are accepted. App QA remains pending until Codex has
implemented the design and tested the real app at 360, 768 and 1440px in both UI locales.
