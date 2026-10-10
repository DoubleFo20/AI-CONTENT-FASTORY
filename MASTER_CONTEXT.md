# AI Content Factory — master context

Updated: 2026-10-10 (Asia/Bangkok). This is an existing local application with an opt-in cloud target in
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
- Owner's updated target: Supabase PostgreSQL structured data, Google Drive primary media,
  always-on Cloud Control Plane and separately authenticated Local Worker. Existing SQLite,
  account/session persistence and local media remain active until approved verified migration.
- Persistent single-worker queue; one active operation per project; no automatic paid retries.
- Latest Owner policy: Gemini Free Tier Flash-Lite is primary text; backend key + verified Free Tier confirmation required. OpenAI key remains server-side but requests are prohibited until new explicit Owner approval. Mock remains explicit; no paid fallback or billing upgrade.
- Google Flow remains the primary video engine with a manual prompt-pack/import boundary.
- FFmpeg is the local final assembly engine, not a substitute video-generation engine.
- Full TH/EN chrome; bilingual story content; scene explanation TH and Flow prompt EN.
- New UX requirement: independent public TH/EN/TH+EN content display; paired mode stacks
  Thai first at every width. It is a client presentation change, not a third API locale.
- Drive OAuth/encrypted vault, six-category project folders, private media index, explicit
  verified/idempotent transfers and missing-cache restore are prepared; real consent,
  live round trip and primary-storage cutover remain pending. Flow estimates require an
  owner-verified rate; they never spend credits. No content publishing is implemented.
- Responsive web and installable shell-only PWA. AI/upload/export require connectivity.
- Secondary module contracts only: Product Review, Kids & Toy, Investment Lab,
  Media Library, Publish, Settings. No trading, social publishing or secondary generation.

## Phase boundaries and authority

Phase 0 freezes product/architecture/contracts and makes the Antigravity handoff ready.
Phase 1 delivers a runnable local foundation and the independently testable core pipeline.
Frontend produced before approved Antigravity output is a functional validation shell,
not a claimed final design. No paid Google account actions or cloud deployments authorized.
The final core checkpoint inspection found an existing GitHub origin at
DoubleFo20/AI-CONTENT-FASTORY. Normal checkpoint pushes preserve the separate Antigravity
design branch; no remote was invented or created. Missing keys, design and external account
access block only their dependent work.

Source of truth: docs/PRD.md, docs/SYSTEM_ARCHITECTURE.md, docs/API_CONTRACT.md,
shared/contracts.ts, ROADMAP.md and TASKS.md. Status files record evidence, not inferred success.

## Checkpoint state

Current release supersedes the historical integration checkpoint below. Branch
`release/v1-real-world` combines reviewed integration cfa6554 with Premium Cinematic V2
be29e0a in `.worktrees/release-v1`. It preserves React/Vite + Express/SQLite and the existing
owner data. New production/editor/media/private storage sidecars do not migrate SQLite.
Actual Owner Ideas failure is three quota failures with no active job; consistent backup
and explicit Mock recovery produced ten ideas while preserving accounts/sessions/media/schema/history.
Root reviewed disjoint agents' output and independent high-risk review. Full serialized
145 tests:144 passed,0 failed,1 Windows POSIX skip; final release commands/publication and
48 layout cases with critical UI retakes are recorded in PROJECT_STATUS/HANDOFF. Local synthetic MP4 playback,
download, persistence, owner auth and public-cache PWA passed. Live AI/Flow/Drive/cloud
remain individual external gates. Paired Local Worker is not implemented; never claim
notebook-offline operation from local PWA tests. Main must remain unmerged pending review.

### Previous integration checkpoint (historical)

The Owner's latest assignment authorizes integrating committed main and Antigravity UI in
`integration/v1-ui-core`, preserving uncommitted work and the existing architecture. Root
reviewed isolated UI/QA/docs writers and verified63 automated passes/1 POSIX skip, build/
typecheck/lint/PWA,216 actual-app layout cases,6 auth layouts and a real synthetic24-second MP4.
Server/shared/public/package paths remain unchanged. Normal push and a PR targeting main are
authorized; no force push or main merge before final review. Antigravity must visually review
the actual combined app using the [new handoff](docs/ANTIGRAVITY_VISUAL_QA_HANDOFF.md).
Original Antigravity worktree/specifications remain untouched. Live services, paid generation,
hosting and approved migration remain separate gates; cached PWA shell cannot execute cloud jobs.

The following records the prior backend/core checkpoint. Codex owned backend/core/integration
while Antigravity owned all UX/UI
implementation and visual QA in its separate worktree. The opt-in core checkpoint adds
labelled Mock AI/controlled fallback, Drive OAuth/private backups, Supabase snapshot/queue
adapter, fenced leases and cloud AI executor, compatible owner-only integration APIs and
new regressions. Prepared SQL is review-only; local isolated PostgreSQL verification does
not authorize applying it. No existing project/database/account was migrated or seeded.
See [CORE_INTEGRATION_HANDOFF](docs/CORE_INTEGRATION_HANDOFF.md) for current contracts/gates.

Phase1 local code/tests and independent security review are complete. The authorized
environment key passes model discovery but generation returns insufficient_quota. An Owner
billing/key decision is pending; no automatic retries or credential replacements are allowed.
The Owner's UX/UI lead request produced the reviewed dark studio design packet and synthetic
15-screen reference. ANTIGRAVITY_STATUS is DESIGN_READY_FOR_CODEX. Implement the specifications
in docs/UI_SPEC.md and docs/DESIGN_SYSTEM.md through Antigravity's owned worktree, then return the actual app for visual QA;
270 prototype layout checks do not accept the future implemented app. UI work can proceed
without live API access. Real Flow creative acceptance remains a separate external gate.
See PROJECT_STATUS.md and HANDOFF.md for actual checks and next actions.
