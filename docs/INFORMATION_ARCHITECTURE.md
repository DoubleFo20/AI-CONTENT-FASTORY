# Information architecture

STATUS: STABLE_FOR_PHASE_0A

## Navigation and page inventory

| Route | Page/module | Primary action | Access |
| --- | --- | --- | --- |
| / | Setup/login when signed out, dashboard when signed in | Create account/login/new story | Contextual |
| /#dashboard | Dashboard | Continue/create story, see queue | Owner |
| /#stories | Story projects | Browse/create a project | Owner |
| /#story/{projectId} | Story workspace | Next valid production step | Owner |
| /#queue | Production Queue | Inspect progress/failure, retry eligible work | Owner |
| /#story/{projectId}/preview | Preview/export (workspace section) | Play/download latest valid export | Owner |

Hash navigation keeps this local SPA reloadable without custom public URL rewrites. Each
project workspace organizes Brief, Ideas, Bibles, Scenes/Flow prompts, Clips, Preview.
This is one progressive workspace with six sections, not six disconnected project copies.
The queue is global but every job links back to its project.

## Data hierarchy

Owner → projects → brief + ten ideas → one selected idea → expanded package.
Package → Story Bible + characters + locations + continuity rules + ordered scenes.
Scene → Thai explanation + English Flow prompt + imported clips.
Project → queued operations + final export artifact.
IDs are opaque; URLs and UI labels never expose storage paths or credentials.

## Responsive navigation

Desktop: persistent sidebar and roomy content panel. Tablet: compact navigation and stacked
detail panels. Mobile: accessible collapsible navigation; single-column cards; horizontally
scrollable step navigation; no essential action or information relies on hover. Buttons and
selection cards are keyboard usable with explicit selected and disabled states.

## Secondary boundaries

The registry declares Product Review, Kids & Toy, Investment Lab, Media Library, Publish
and Settings as planned. They reuse auth/media/queue and receive future dedicated routes;
they do not introduce active V1 screens or dead-end creation actions.
