# Tasks and dependencies

| ID | Task | Depends on | Owner | State |
| --- | --- | --- | --- | --- |
| P0-01 | Workspace/runtime/usage discovery, Git and safe ignore rules | — | Root | DONE |
| P0-02 | Stable PRD, V1 scope, IA, pages, UX and mobile requirements | P0-01 | Root | DONE |
| P0-03 | System, AI, security, i18n and API/data contracts | P0-02 | Root | DONE |
| P0-04 | Antigravity handoff READY_FOR_DESIGN | P0-02,P0-03 | Root | DONE |
| P0-05 | Artifact validation and checkpoint commit | P0-04 | Root | DONE |
| P1-01 | npm/TypeScript scaffold and tooling | P0-05 | Root | IN_PROGRESS |
| P1-02 | Backend auth, project state/ownership, persistent queue | P1-01 | Core agent | TODO |
| P1-03 | TH/EN functional client shell, setup, dashboard/workspace | P1-01 | Web agent | TODO |
| P1-04 | OpenAI provider and selected-story structured pipeline | P1-01 | Root | TODO |
| P1-05 | Clip validation, FFmpeg assembly and authenticated media | P1-02 | Core agent | TODO |
| P1-06 | API regressions and independent security review | P1-02,P1-04,P1-05 | QA agent | TODO |
| P1-07 | Integration/typecheck/lint/build/browser/mobile/PWA QA | P1-03,P1-06 | Root + QA | TODO |
| P1-08 | Evidence, operations guide and checkpoint commit | P1-07 | Root | TODO |
| D-01 | Approved design and UX specifications | P0-04 | Antigravity | AWAITING_EXTERNAL |
| D-02 | Approved design implementation | D-01,P1-07 | Web agent | TODO |
| D-03 | Visual QA | D-02 | Antigravity | TODO |
| H-01 | Owner-controlled real Google Flow generation/clips | P1-04 | Owner | AWAITING_EXTERNAL |

## Parallel ownership contract

Root: all governance/progress docs, shared/, server/ai/, package manifests/lockfiles,
configs, schema definitions, tooling, Git and integration. Core writer: server/ except
server/ai/ and Root-owned schema/contracts. Web writer: src/, public/ except Root manifest/
service worker assets. QA: tests/ only; server and client are read-only review targets.
All writers use isolated worktrees within ignored .worktrees/. Git operations remain Root-only.
Root reviews and copies owned paths into main after writers finish, then runs combined checks.
