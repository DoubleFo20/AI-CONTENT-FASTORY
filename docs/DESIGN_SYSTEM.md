# Design system — AI Content Factory studio

DESIGN_STATUS: DESIGN_READY_FOR_CODEX
IMPLEMENTATION_STATUS: PENDING
Revision: 1.0 — finalized 2026-10-09 (Asia/Bangkok)

This design follows the Owner's UX/UI brief of 2026-10-08 and replaces the neutral Phase1
visual baseline. Implementation and final app visual acceptance remain separate milestones.
Read [UI_SPEC.md](UI_SPEC.md), [UX_FLOW.md](UX_FLOW.md), [MOBILE_UX.md](MOBILE_UX.md),
[MOTION_SPEC.md](MOTION_SPEC.md) and [VISUAL_QA.md](VISUAL_QA.md) together.
The [visual reference](design/index.html) uses labelled sample data, with no production APIs.

## Direction and hierarchy

Story creation occupies the largest dashboard area and first module position. Show one
next action per project stage, the selected story and scene-based context. A compact queue
summary supports work; avoid a wall of administrative metrics. Product Review and Kids &
Toy are smaller planned cards; Investment Lab lives in Other. Tools are grouped separately.

Deep ink surfaces, restrained mint light, sparse violet highlights and warm scene markers
create the cinematic studio. Glass belongs to navigation/header with an opaque fallback;
content/forms use solid backgrounds for readable Thai/English. No operational screen needs
3D, particles, parallax, remote fonts or a new animation dependency.

KEEP existing data flow, owner/session, validated forms, ten radios/one saved selection,
bibles/scenes, manual Flow handoff, private files and queue. IMPROVE typography, navigation,
next-action hierarchy, inline errors, content modes and review context. REDESIGN the light
dashboard presentation, long all-sections workspace and mobile action layout. UI_SPEC.md
maps components exactly; backend architecture remains unchanged.

## Colors

| CSS variable | Value | Use |
| --- | --- | --- |
| --background | #080b12 | Canvas |
| --surface | #121b2a | Opaque operational cards |
| --surface-raised | #1a2638 | Dialog/context panels |
| --border | #2d3e55 | Decorative divisions |
| --control-border | #667a95 | Essential control boundary |
| --text | #eef3fa | Main text |
| --muted | #afbdd0 | Supporting copy/secondary language |
| --subdued | #8497b0 | Nonessential metadata, fully opaque |
| --accent | #8aefcb | Primary action/selection/focus |
| --on-accent | #09221b | Text/icon on mint |
| --accent-hover | #a6f6dc | Primary hover |
| --accent-pressed | #72dbb5 | Primary pressed |
| --violet | #aa9cff | Running/sparse decoration |
| --warning | #f6c778 | Queued/attention |
| --danger | #ffa7b3 | Failure/error |
| --success-surface | #152c29 | Success/selected backing |
| --warning-surface | #302818 | Waiting backing |
| --danger-surface | #351c27 | Error backing |
| --running-surface | #29223f | Running backing |
| --focus | #8aefcb | 3px solid ring, 3px offset |

Navigation/header/action chrome may use rgba(8,11,18,.92) with static blur(12px);
modal backdrop blur is optional and at most4px. Fallback is an opaque token surface.
Keep text opaque and over a solid dark backing. No animated blur. Information must survive
with gradients/shadows/blur disabled. Decorative --border is not a sufficient input border.

Normal text targets 4.5:1; large text 3:1, following
[W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Essential controls/focus target 3:1 against adjacent surfaces. Check actual rendered pairs,
including alpha composition; tokens alone are not a future-app compliance claim. Disabled
labels remain readable and have a visible reason. Status always includes icon/text.

Calculated on the three opaque canvas/surface/raised tokens: main text has a minimum
13.67:1, muted text 7.99:1, subdued text 5.10:1, and essential control borders 3.47:1.
Mint-button text measures 12.17:1. These are measured token-pair calculations; gradients,
alpha composition, disabled states and the implemented app still require rendered QA.

## Typography and geometry

Font stack: "Segoe UI", "Leelawadee UI", Tahoma, system-ui, sans-serif; font-synthesis:none.
Use installed Thai-capable fonts; inspect tone marks on Windows/phones. Paragraph weight 400,
labels 600, headings 650–700. No uppercase transform/tracking on Thai. English decorative
eyebrows may use 12px/600/.08em but never contain the only useful instruction.

| Role | Desktop size / line height | Mobile size / line height |
| --- | --- | --- |
| Studio hero | 40px / 1.2 | 28px / 1.4 |
| Page heading | 28px / 1.35 | 24px / 1.45 |
| Card heading | 20px / 1.5 | 20px / 1.5 |
| Body/input/prompt | 16px / 1.65 | 16px / 1.7 |
| Label/help | 14px / 1.65 | 14px / 1.7 |
| Nonessential metadata | 12px / 1.6 | 12px / 1.7 |

Reading width 68ch. Prompt white-space:pre-wrap; overflow-wrap:anywhere for filenames/long
English tokens; natural Thai wrapping. No fixed paragraph height or clamped story-selection
copy. Text-spacing overrides must preserve content/controls, following
[W3C text-spacing guidance](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

Spacing(px):4/8/12/16/24/32/48. Card padding16 mobile/24 desktop; section gaps24/32.
Radii(px):8 controls,12 notices,16 cards,24 hero/dialog. Border1px; selected card uses an
inset2px ring without resizing. Overlay shadow:0 16px 40px #00000033; accent glow at most
0 0 32px #8aefcb0f. Avoid shadows on every row. Icons use a consistent simple line style.

## Grid and navigation

| Width | Navigation | Main | Grid |
| --- | --- | --- | --- |
| 360–767 | Drawer + bottom Studio/Create/Queue/More | 16px gutters | One column |
| 768–1199 | 72px rail with named hover/focus labels | 24px gutters | Two columns if cards stay >=280px |
| >=1200 | 248px labelled sidebar | 32px gutters; max-width1200 | Ideas3; other modules2–3 |

Use minmax(0,1fr), min-width:0 and fluid widths. No page overflow at 360px. Stage strips may
scroll within labelled regions with visible continuation cues. At 200% zoom reflow to the
narrower layout. Header min-height 64px; allow growth. Modal mobile drawer has visible close,
Escape, inert background and restored trigger focus. Auto Editor requires project context.
Z-index:base0/sticky20/nav30/backdrop40/dialog50/notice60. Reserve document space/safe-area
padding for bottom UI. Never overlap bottom nav, contextual action and mobile keyboard;
MOBILE_UX.md defines the rules. Future modules show Planned without unimplemented links.

## Components and states

| Component | Pattern | Required states |
| --- | --- | --- |
| StudioShell | Grouped sidebar/rail/drawer; text+current marker | active, planned, signed out, offline |
| Button | Mint/dark primary or solid secondary/control-border; >=44px target | hover, pressed, focus, disabled reason, busy |
| Field | Label, help, inline error; min-height48px/input16px | pristine, focus, invalid, busy, disabled |
| Card | Solid surface/radius16; only actionable cards hover | normal, focus, selected, unavailable |
| IdeaChoice | Entire radio card chooses one candidate | unsaved, saving, saved, expanded/locked |
| StageStrip | Brief/Ideas/Story/Scenes/Clips/Preview; icon+label | complete, current, future, active job |
| BibleTabs | Four bibles; contained readable panels | selected, focus, empty; arrows/Home/End |
| SceneCard | Number/duration/references, TH explanation, EN prompt | ready, expanded, missing/current clip |
| PromptPanel | Selectable EN text; explicit English copy action | ready, copied, selectable fallback |
| ReviewDialog | Chosen story/context/consequence, confirm/cancel | ready, unknown estimate, conflict, stale plan |
| JobRow | Project/type/status; genuine progress and retry | queued, running, complete, failed, interrupted |
| StorageBadge | Provider and simple connection/sync state | unconnected, connected, uploading, waiting, synced, failed |
| Preview | Real authenticated player, ratio-aware frame | empty, loading, playable, error |
| Notice | Icon, useful copy and specific recovery | info, success, warning, error, offline |
| EmptyState | Explain next valid action; no fake thumbnail | no project/ideas/scenes/clips/export |
| Skeleton | Intended card shape, aria-hidden/parent aria-busy | loading; static under reduced motion |

Every essential target is at least 44×44px, including icon wrappers, with names/tooltips on
hover and focus. This is our product minimum, stricter than the general minimum in
[W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
Retain autocomplete/current validation. Field errors use aria-describedby/aria-invalid,
focus the first invalid field and keep input. Use polite status announcements, alert for
important failures, and avoid announcing every poll. Dialogs use native showModal or an
equivalently tested trap, labelled heading, Escape, inert background and focus restoration.
Confirmation alone never authenticates, spends credits or generates a Flow video.

## TH/EN and content display

UI locale: TH(default)/EN. Separate content display: TH/EN/TH+EN, without a third API locale.
Both mode stacks Thai first then explicitly labelled English at 14–16px. Switching preserves
project, choice and current scene; only public preferences may be stored. Production always
separates lang=th explanation and lang=en exact Flow prompt. Use **คัดลอกพรอมป์ต์อังกฤษ** /
**Copy English Prompt**, with inline live feedback and selectable fallback; never auto-translate.

## Capability gates and implementation

Current core:private local storage/manual Flow. Requested target:Google Drive primary media
storage after a verified integration. Until then show Local storage / Drive not connected;
no fake remote location, quota, sync progress or functioning connection action. Future state
examples in the prototype remain labelled examples. Unknown Flow credits are not zero:
show known scene count/duration and review current credits in Flow. Durable production
approval, costing, Drive sync/catalog and worker heartbeat are gated in UI_SPEC.md.

Use 120/180/240ms transform/opacity motion and reduced-motion behavior from MOTION_SPEC.md;
optional interaction-animation reduction follows
[W3C guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
No GSAP/Three.js/R3F dependency is required. Codex applies tokens/components first, then
client-only presentation/review behavior while preserving APIs/state. Backend-dependent
capabilities need their contracts before activation. Return the implemented app for VISUAL_QA;
prototype screenshots are design evidence, not a production pass.
