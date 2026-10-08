# Antigravity handoff — AI Content Factory

ANTIGRAVITY_STATUS: DESIGN_READY_FOR_CODEX
PHASE_0A_STATUS: STABLE
DESIGN_REFERENCE_QA: PASS_WITH_DOCUMENTED_LIMITS
APP_IMPLEMENTATION_VISUAL_QA: PENDING
Updated: 2026-10-09 (Asia/Bangkok)

The Phase 0 checkpoint was READY_FOR_DESIGN. The Owner then assigned the UX/UI lead
role in this chat. Root reviewed and integrated isolated design/prototype/spec/QA agent
output. This packet is now ready for Codex implementation; it does not claim an external
Antigravity session received the packet or that the production app has adopted the design.

## Completed design and implementation source

- [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md): dark studio tokens, typography, grids,
  reusable components, states, focus/contrast and accessibility requirements.
- [UX_FLOW](docs/UX_FLOW.md): progressive selected-story workflow, manual production
  review, prompt/clip/export recovery and capability gates.
- [UI_SPEC](docs/UI_SPEC.md): 15 screen/state specifications, existing component/API
  map, KEEP/IMPROVE/REDESIGN decisions and precise Codex acceptance requirements.
- [MOBILE_UX](docs/MOBILE_UX.md), [MOTION_SPEC](docs/MOTION_SPEC.md) and
  [I18N](docs/I18N.md): 360/768/1440 layouts, safe areas, modal navigation, lightweight
  motion and distinct UI locale/content display controls.
- [VISUAL_QA](docs/VISUAL_QA.md): measured prototype evidence, its limits and the
  pending implementation checklist.
- [Interactive reference](docs/design/index.html), [preview instructions](docs/design/README.md)
  and [recorded results](docs/design/previews/QA_RESULTS.json). Run
  `node scripts/preview-design.mjs`, then open http://127.0.0.1:3003.

## Product goal and target users

Help Thai/English solo creators and small teams produce coherent short stories, keeping
one chosen idea and stable story/character/location/continuity bibles through video production.
The creator must see the next valid action and retain control of paid generation and final review.

## V1 modules and scope

Username/password owner setup/login; Dashboard; Story Factory (brief, ten ideas, one
selection, selected expansion, four bibles, storyboard/scenes); Google Flow prompt handoff;
Production Queue; per-scene Clip Import; local Auto Editor; Preview; final MP4 Export.
Product Review, Kids & Toy and Investment Lab remain planned factories. Auto Editor is a
project-context shortcut to the existing Clips/assembly workflow. Media Library/Publish
remain planned. A Settings presentation may expose backed public language preferences
and sign-out; Drive/billing/account-management actions require separate implementation.

## IA, page inventory and UX flow

Preserve the real hash routes in [INFORMATION_ARCHITECTURE](docs/INFORMATION_ARCHITECTURE.md).
The prototype's `#design/...` hashes are reference navigation only. Its page inventory:

| Reference | Existing context / implementation requirement |
| --- | --- |
| Login/setup | Existing owner form/session flow; no prototype credentials |
| Dashboard | Dominant Create Content, Story Factory, recent projects, factual counts |
| Create Content | Existing brief; create project and paid ideas generation remain separate |
| Idea selection | Exactly ten radios; one saved selection; unsaved state visible |
| Story overview | Persisted selected story and the next valid action |
| Four bibles | Story/Character/Location/Continuity tabs and stable references |
| Storyboard | Ordered scene cards, duration and references |
| Flow prompts | Thai explanation and exact English prompt/copy/download |
| Production review | Manual plan acknowledgment; unknown credit cost is explicit |
| Queue | Real ideas/expansion/edit jobs and eligible deliberate retry |
| Clip Import | Existing scene-bound formats/128MiB validation and replacement |
| Auto Editor | Project picker → existing Clips checklist → assembly job |
| Preview/Export | Real authenticated media; latest valid output only |
| Media Library | Planned provider-aware catalog; never show fake assets in the app |
| Settings | Only backed public preferences/account display/sign-out; storage gated |

Flow: brief → ten ideas → save one → expand selected story → review bibles/scenes →
Thai explanations/English prompts → credit information or Unknown → review plan →
manual Google Flow → scene imports → edit queue → preview → final export.
Maintain server prerequisites, explicit recovery, empty/loading/error/offline states.

## TH/EN and mobile requirements

Thai is the first-use default. UI locale TH/EN and content display TH/EN/TH+EN are separate
public preferences; do not add a third API locale. TH+EN always stacks Thai above labelled
English. Changing either preserves draft, project, selected idea and scene context.
Scene explanations remain Thai and exact Google Flow prompts remain English. Use
**คัดลอกพรอมป์ต์อังกฤษ / Copy English Prompt**, with live feedback and selectable fallback.

360px: single column, 16px gutters, bottom Studio/Create/Queue/More and a modal More
drawer. 768px: 72px rail and 24px gutters. 1440px: 248px sidebar, 32px gutters and
1200px maximum content width. Minimum targets are 44px; account for safe area/keyboard.
Preserve long text, visible focus, keyboard selection and status announcements.

## Design direction and required components

Premium cinematic creative studio: deep ink `#080b12`, solid `#121b2a` content surfaces,
mint `#8aefcb` primary actions, restrained violet/warm accents and static glass chrome.
Use the complete design system, system Thai-capable fonts and 120/180/240ms transform/
opacity motion; no new motion or 3D dependency. Story leads; Investment Lab lives in Other.

Required components: StudioShell/navigation, independent locale/content controls, owner
form, factual metric/project cards, brief fields, StageStrip, IdeaChoice, BibleTabs,
character/location cards, SceneCard, PromptPanel, ReviewDialog, JobRow, StorageBadge,
clip picker/checklist, player/export controls, notices, empty/error states and skeletons.
Names describe design patterns; keep existing components unless a split improves reuse.

## Technical constraints and deliverables

React/TypeScript/Vite SPA, hash routes, plain CSS variables; Express/SQLite local backend.
Cookie+CSRF auth; API contract is frozen in docs/API_CONTRACT.md and shared/contracts.ts.
PWA public shell only; no private caching. API keys stay server-side. Flow generation is
a user-operated handoff, not an automatic API. A functional validation shell may be built
for core integration but is not the approved final UI.

Google Drive is the requested primary-media destination after a verified integration.
Current core still uses private local storage. Show Local storage / Drive not connected
until backed by real data. Future connected/uploading/synced/waiting/failed states need
contracts and recovery rules; keep OAuth/security details out of normal product screens.

Cost/balance is Unknown without trusted source data. Current production review can use
**Confirm plan and open Flow**; this manual acknowledgment saves no approval and starts
no paid job. The prototype's **Confirm and view sample queue** demonstrates a dialog only;
Codex must implement the manual Flow handoff from UI_SPEC, not copy the demo behavior.
Durable approval needs actor/time/plan revision/read-back/invalidation contracts first.

Codex sequence:

1. Apply tokens and reusable controls to the existing shell/auth/workspace.
2. Implement responsive navigation, one active workspace panel, factual dashboard and
   separate public content-display preference without changing API contracts.
3. Apply idea/bible/scene/prompt/review/queue/clip/editor/preview layouts and states.
4. Keep planned services visibly unavailable; scope Drive, costing and durable approval
   as separate contract-dependent tasks. API quota does not block presentation work.
5. Run focused typecheck/lint, relevant auth/state/privacy regressions and the complete
   visual checklist. Return the implemented UI for Antigravity VISUAL QA.

## Functional shell available for design review

The independently verified Phase1 shell is now runnable using [README.md](README.md).
Existing implementation: [App.tsx](src/App.tsx), [Workspace.tsx](src/Workspace.tsx),
[components.tsx](src/components.tsx), [styles.css](src/styles.css), [i18n.ts](src/i18n.ts).
Use these flows/contracts as implementation context. This design packet replaces the light
visual baseline; the running port-3001 application remains unchanged. Both locales previously
passed 360/768/1440px functional-shell browser checks. Local screenshots
are in ignored output/playwright/story-{th,en}-{360,768,1440}.png, with offline/logout captures.
These contain synthetic QA stories, are local review evidence, and are not required assets.

The real API key currently returns insufficient_quota for text generation, so a design
review must use isolated labelled fixtures or wait for Owner credit resolution. Do not seed
the real first-owner database or suggest the fixture is successful live AI/Flow production.

## Design reference verification and remaining acceptance

Root measured 270 layout cases: 15 references × TH/EN UI × TH/EN/TH+EN content × three
viewports. No page overflow, missing page heading, enabled button/select below 44px or
misordered paired content was found; Ideas always had ten radios. Key images are stored
under [previews](docs/design/README.md). Keyboard BibleTabs, modal focus wrap/Escape,
focus return, sample selection persistence and draft retention were exercised.

Copy feedback was observed and source copies only the English fixture prompt; browser
session clipboard read-back was empty, so copied payload is not a measured pass.
Physical mobile IME, OS reduced motion/transparency, assistive technology, full rendered
contrast/zoom and production application visual QA remain checklist items. No live AI,
Google Flow, Drive sync, authentication or media generation occurred in the prototype.
