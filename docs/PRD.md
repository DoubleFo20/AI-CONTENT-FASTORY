# Product requirements — Story Factory V1

STATUS: STABLE_FOR_PHASE_0A
Updated: 2026-10-08 (Asia/Bangkok)

## Product goal and users

AI Content Factory helps Thai/English solo creators and small production teams make a
coherent short narrative from a brief, with explicit creative control and reusable continuity.
V1 is a single-owner local workspace. A creator can work on multiple stories without
mixing characters, locations, prompts or clips between projects.

## V1 scope and acceptance

| Requirement | Acceptance |
| --- | --- |
| Username + password | First-run owner setup, hashed password, session login/logout, no default credentials |
| TH/EN | Every visible UI label, empty/error/loading state has both locales; persisted locale; Thai default |
| Responsive + PWA | Usable at 360px/768px/1440px; installable public shell; offline status; private content never cached |
| Dashboard | Real project/queue counts, recent projects, empty state and create action |
| Story Factory brief | Name, brief, genre, audience and 9:16/16:9/1:1 ratio validated on server |
| Ten ideas | One explicit generation yields exactly 10 concise, distinct bilingual ideas; no unsolicited expansion |
| One selection | User selects exactly one persisted idea belonging to that project; server enforces it |
| Selected expansion | Only the selected idea can become the expanded package; zero selection is rejected |
| Four bibles | Story, Character, Location and Continuity bibles accompany expansion and scene references |
| Scene/storyboard plan | Ordered scenes with duration, character/location references and localized titles |
| Flow prompts | Each scene has a Thai explanation and English Google Flow prompt; downloadable prompt pack |
| Primary video engine | User generates clips in Google Flow; application tracks this handoff and imports results |
| Production Queue | Durable queued/running/completed/failed states, progress, actionable error and manual retry |
| Clip Import | Authenticated upload bound to project+scene, size/type/media validation, isolated storage |
| Auto Editor | Local worker normalizes/trims/pads and orders one current clip per scene into target ratio MP4 |
| Preview + Export | Authenticated video preview and downloadable final MP4; no completion before file exists |

## Main journey

Owner setup/login → dashboard → create brief → generate ten ideas → choose one →
expand → review bibles/scenes → download/copy Flow prompts → generate in Google Flow →
import a clip for every scene → enqueue edit → preview → export.
Failed generation is visible and leaves existing valid content intact. Retry is a deliberate
action because text/video generation may use paid credits. Clip replacement preserves prior
imports; the latest clip for each scene is used by the editor. Changing selection after
expansion is rejected in V1; create a new project to develop another idea.

## Architecture-only secondary modules

Product Review Factory, Kids & Toy Factory, Investment Lab, Media Library, Publish and
Settings have registry boundaries and future data/service reuse. V1 does not generate
product reviews, child-targeted content, investment recommendations or publish externally.
They are marked planned and excluded from Story Factory navigation's active actions.

## Requirements, constraints and non-goals

No external account is provisioned automatically; no default password; no client-side secret.
Google Flow is a user-operated production step. Multi-tenant teams, cloud deployment,
automatic Flow account interaction, timeline editing, transitions/music/subtitles, social
publishing and secondary factories are outside this milestone. V1 automatic editing means
ordered normalized clip assembly retaining clip audio when present, silence otherwise.
Final creative quality and continuity require review of actual generated clips.

## Success measures and release gate

Design amendment (Owner brief2026-10-08, handoff2026-10-09): use the cinematic dark studio
specification, independent TH/EN/TH+EN content display and phone/tablet-first navigation.
Google Drive is the requested primary-media target after verified integration. Credit
estimate/durable approval/Drive sync require separate contracts; current local storage,
unknown credit cost and manual Flow review remain honest interim states. The completed
[design packet](../ANTIGRAVITY_HANDOFF.md) defines this target without changing core APIs.

A new owner completes setup and a project survives restart. A regression test proves ten
ideas/one selection/selected-only expansion. A synthetic-media test proves actual MP4
assembly and access control. TH/EN and mobile browser checks pass. Live AI and Flow quality,
approved Antigravity design and visual QA are tracked separately; never equate mocked
provider tests with live creative acceptance or declare production-ready before these gates.
