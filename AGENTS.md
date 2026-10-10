# AI Content Factory — engineering rules

Act as a Senior Software Engineer / Senior Full-Stack Developer. Inspect structure,
conventions, Git status and relevant documents before changing code. Explain non-trivial
implementation briefly. Make the smallest complete change. Do not assume tools or commands.
Never print secrets. Do not change generated files, lockfiles, environment files or CI
unless required. Ask before destructive operations, migrations, force pushes, or writes
outside this workspace. Creating the new local application's empty database is authorized;
changing an existing populated database schema is not.

## Owner authorization and scope

On 2026-10-08 the Owner explicitly instructed: "CREATE THE FILES. INITIALIZE THE PROJECT.
WRITE THE DOCUMENTATION. CREATE THE ARCHITECTURE. CREATE THE TASK DEPENDENCY PLAN.
RUN VALIDATION. COMMIT CHECKPOINTS." Continue Phase 0 into Phase 1 autonomously.
Local Git initialization, dependency installation, isolated worktrees inside this workspace,
local application implementation, tests, and safe checkpoint commits are authorized.
No remote URL was supplied. Do not invent one or create external resources.
At the 2026-10-09 core checkpoint an existing GitHub origin was discovered in the workspace.
Use only that known remote for normal authorized checkpoint pushes; preserve Antigravity's
separate design branch and never force push.
The Owner explicitly chose to reuse the existing environment OPENAI_API_KEY.
Keep it server-side; never write it into source, client bundles, logs, commits or messages.

The Owner's later 2026-10-10 policy supersedes permission to call OpenAI: Gemini API
Free Tier Flash-Lite is the primary text provider. Require private backend key and
explicit Free Tier confirmation after the Owner verifies billing is disabled. Stop
on quota exhaustion; no paid upgrade, automatic retry or provider fallback. OpenAI
requests are prohibited until new explicit Owner approval, regardless of key/quota presence.

## Delivery and orchestration

The Owner's later integration assignment authorizes combining the approved design and core
on `integration/v1-ui-core`, based on latest main, with isolated integration writer worktrees.
Fix and verify frontend API/navigation/state behavior there; preserve Antigravity's original
worktree and branch. Push the reviewed integration branch and open a PR targeting main.
Do not merge main before final integration review; return the actual integrated application
to Antigravity for implementation visual QA.

On 2026-10-09 the Owner assigned Codex backend/core/integration and Antigravity UX/UI
in a separate worktree. Do not concurrently edit src/, public/, docs/design/ or approved
UX/UI specifications. Continue independent core work and maintain compatible API contracts.
The updated target is Supabase PostgreSQL for structured cloud data, Google Drive for
primary media and an always-on Cloud Control Plane with a separately paired Local Worker.
Preserve the working SQLite/auth/FFmpeg lane until credentials, schema/deployment verification
and an Owner-approved populated-data migration allow cutover. Prepare missing services with
safe injected mocks. Flow is primary; Meta AI is supporting and currently unavailable.

Root owns architecture, task dependencies, integration, review and final acceptance.
Use independent subagents with disjoint ownership and isolated branches/worktrees when
modifying code in parallel. Root alone controls Git, shared contracts, dependencies,
lockfiles, global configuration, progress documents and schema acceptance/application.
An isolated agent may author a review-only SQL draft under explicit Root ownership delegation.
Agents stop
and report when they need an unowned file. Root reviews every agent's output before integration.
Prefer GPT-6.1 Sol High for complex implementation and GPT-6 Luna Medium for scoped
implementation, i18n, tests and docs. Escalate Luna after two failures on the same issue.
Require an independent read-only review for auth, file handling, queue and other high-risk work.
Run narrow relevant checks and report actual commands, files, results and risks in short Thai.
Do not claim unexecuted tests passed. Do not send external messages without authorization.

## Product invariants

Story Factory is V1. Generate exactly ten short ideas; select exactly one; expand only the
selected story. Google Flow is the primary video engine. Provide Thai scene explanations
and English Flow prompts. Flow video creation is a user-operated handoff until an official
integration is approved; do not invent a Flow API or automate account access.
Secondary factories are architecture only and must not delay Story Factory.
All product UI supports TH/EN and 360px mobile through desktop; PWA stores public shell only.

## Antigravity

After PRD, IA, V1 scope, page inventory, UX and mobile requirements are stable, create
ANTIGRAVITY_HANDOFF.md and set ANTIGRAVITY_STATUS: READY_FOR_DESIGN.
Continue independent backend/core tasks while design is pending. The original Phase0
DESIGN_SYSTEM.md was a technical baseline. On2026-10-09 the Owner-assigned UX lead delivered
the reviewed packet with ANTIGRAVITY_STATUS: DESIGN_READY_FOR_CODEX. Use its UI_SPEC,
DESIGN_SYSTEM, UX_FLOW, MOBILE_UX and MOTION_SPEC as the implementation target. Implement returned
specifications without arbitrary redesign and return completed UI for visual QA.

## Usage stop

Use authoritative account indicators only. At <=7% remaining in any applicable usage
window: stop spawning and starting features, finish the smallest safe unit, run essential
checks, update PROJECT_STATUS/TASKS/HANDOFF/CHANGELOG, commit safe work, push only when
an authenticated known remote exists, set STATUS: PAUSED_FOR_USAGE_RESET, and stop.
Do not guess usage. Otherwise continue independent tasks despite a blocker elsewhere.
