# AI Content Factory — master context

Updated: 2026-10-09 (Asia/Bangkok). This is a fresh, local-first project in
`D:\xampp\htdocs\Ai-content-factory`, not a PHP application merely because XAMPP hosts
the directory. Node 24.18.0, npm 11.16.0, Git 2.51.1 and FFmpeg 8.1.1 were discovered.

## Goal and users

Give Thai and English solo creators a controlled short-story production workspace:
brief → ten ideas → one selection → story/bibles/scenes → English Google Flow prompts
→ imported clips → local automatic assembly → preview → final MP4.
The creator controls selection, paid generation and the final creative review.

## Stable V1 decisions

- Username/password owner account, first-run setup, no shipped/default password.
- React/TypeScript/Vite web client; Express/TypeScript API; Node 24 built-in SQLite.
- Same-origin cookie sessions and CSRF; local loopback binding by default.
- SQLite/file storage under ignored `storage/`, never in the public web root.
- Persistent single-worker queue; one active operation per project; no automatic paid retries.
- OpenAI Responses structured outputs for text; existing environment key reuse authorized.
- Google Flow remains the primary video engine with a manual prompt-pack/import boundary.
- FFmpeg is the local final assembly engine, not a substitute video-generation engine.
- Full TH/EN chrome; bilingual story content; scene explanation TH and Flow prompt EN.
- New UX requirement: independent public TH/EN/TH+EN content display; paired mode stacks
  Thai first at every width. It is a client presentation change, not a third API locale.
- Google Drive is the requested primary-media target after verified integration; current
  V1 still uses private local storage and has no Drive/cost/durable-approval contract.
- Responsive web and installable shell-only PWA. AI/upload/export require connectivity.
- Secondary module contracts only: Product Review, Kids & Toy, Investment Lab,
  Media Library, Publish, Settings. No trading, social publishing or secondary generation.

## Phase boundaries and authority

Phase 0 freezes product/architecture/contracts and makes the Antigravity handoff ready.
Phase 1 delivers a runnable local foundation and the independently testable core pipeline.
Frontend produced before approved Antigravity output is a functional validation shell,
not a claimed final design. No paid Google account actions or cloud deployments authorized.
No remote is configured; local work and commits continue. Missing keys, design and external
account access block only their dependent work.

Source of truth: docs/PRD.md, docs/SYSTEM_ARCHITECTURE.md, docs/API_CONTRACT.md,
shared/contracts.ts, ROADMAP.md and TASKS.md. Status files record evidence, not inferred success.

## Checkpoint state

Phase1 local code/tests and independent security review are complete. The authorized
environment key passes model discovery but generation returns insufficient_quota. An Owner
billing/key decision is pending; no automatic retries or credential replacements are allowed.
The Owner's UX/UI lead request produced the reviewed dark studio design packet and synthetic
15-screen reference. ANTIGRAVITY_STATUS is DESIGN_READY_FOR_CODEX. Implement the specifications
in docs/UI_SPEC.md and docs/DESIGN_SYSTEM.md, then return the actual app for visual QA;
270 prototype layout checks do not accept the future implemented app. UI work can proceed
without live API access. Real Flow creative acceptance remains a separate external gate.
See PROJECT_STATUS.md and HANDOFF.md for actual checks and next actions.
