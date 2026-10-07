# Antigravity handoff — AI Content Factory

ANTIGRAVITY_STATUS: READY_FOR_DESIGN
PHASE_0A_STATUS: STABLE
Updated: 2026-10-08 (Asia/Bangkok)

## Product goal and target users

Help Thai/English solo creators and small teams produce coherent short stories, keeping
one chosen idea and stable story/character/location/continuity bibles through video production.
The creator must see the next valid action and retain control of paid generation and final review.

## V1 modules and scope

Username/password owner setup/login; Dashboard; Story Factory (brief, ten ideas, one
selection, selected expansion, four bibles, storyboard/scenes); Google Flow prompt handoff;
Production Queue; per-scene Clip Import; local Auto Editor; Preview; final MP4 Export.
Product Review, Kids & Toy, Investment Lab, Media Library, Publish and Settings are
architecture-only extensions and must not delay or clutter Story Factory V1.

## IA, page inventory and UX flow

See docs/INFORMATION_ARCHITECTURE.md and docs/UX_FLOW.md. Pages: setup/login, dashboard,
story projects, progressive story workspace, queue and preview/export workspace section.
Workspace sections: Brief, Ideas, Bibles, Scenes/Flow prompts, Clips, Preview.
Flow: brief → 10 ideas → one selection → expansion → review bibles/scenes → Flow prompt
pack → external Google Flow generation → scene imports → edit queue → preview → export.
Server-enforced prerequisites, deliberate retry, clear errors, empty/loading/offline states.

## TH/EN and mobile requirements

Thai default with persistent locale preference; every UI state translated; bilingual content.
Scene explanations remain Thai and Google Flow prompts remain English with translated labels.
Support 360px mobile, 768px tablet, 1440px desktop. Single-column mobile cards/forms,
reachable navigation, 44px touch targets, wrapping long Thai/English text, visible focus,
keyboard selection and live status. No hover-only actions or page overflow.

## Design direction and required components

Calm creator studio, readable typography and explicit production stages. Avoid ambiguous
generator controls and fake completion states. Required: shell/navigation, locale switch,
auth forms, metric/project cards, project form, stage stepper, idea radio cards, bible panels,
character/location cards, scene prompt/copy controls, clip import, queue/progress/errors,
empty/inline/offline notices, video preview and export controls. Provide tokens and full
state/responsive specifications. docs/DESIGN_SYSTEM.md is a technical baseline only.

## Technical constraints and deliverables

React/TypeScript/Vite SPA, hash routes, plain CSS variables; Express/SQLite local backend.
Cookie+CSRF auth; API contract is frozen in docs/API_CONTRACT.md and shared/contracts.ts.
PWA public shell only; no private caching. API keys stay server-side. Flow generation is
a user-operated handoff, not an automatic API. A functional validation shell may be built
for core integration but is not the approved final UI.

Return approved DESIGN_SYSTEM.md, responsive UX/page specifications and component states.
Codex continues backend/auth/data/queue during design. After implementing the approved
design, Codex returns the UI for Antigravity VISUAL QA. This file is a prepared handoff;
it does not claim that an external Antigravity session has received or completed work.

## Functional shell available for design review

The independently verified Phase1 shell is now runnable using [README.md](README.md).
Existing implementation: [App.tsx](src/App.tsx), [Workspace.tsx](src/Workspace.tsx),
[components.tsx](src/components.tsx), [styles.css](src/styles.css), [i18n.ts](src/i18n.ts).
Use these flows/contracts as implementation context; visual tokens and layout remain yours
to specify and approve. Both locales passed360/768/1440px browser checks. Local screenshots
are in ignored output/playwright/story-{th,en}-{360,768,1440}.png, with offline/logout captures.
These contain synthetic QA stories, are local review evidence, and are not required assets.

The real API key currently returns insufficient_quota for text generation, so a design
review must use isolated labelled fixtures or wait for Owner credit resolution. Do not seed
the real first-owner database or suggest the fixture is successful live AI/Flow production.
