# UX flow — guided story production

UX_STATUS: DESIGN_READY_FOR_CODEX
IMPLEMENTATION_STATUS: PENDING
Revision: 1.0 — finalized 2026-10-09 (Asia/Bangkok)

Preserve existing APIs/prerequisites. The design clarifies the progressive workspace and
manual production handoff. New storage/cost/approval services are implementation dependencies.
See [UI_SPEC.md](UI_SPEC.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and [MOBILE_UX.md](MOBILE_UX.md).

## Owner and studio

First launch shows owner setup, without prefilled credentials; keep username 3–32 and password
12–128 constraints and immediate server-issued session. Returning visits use login with
autocomplete, optional local show/hide and a generic failure. No invented reset/SSO endpoint.
Submitting disables duplicate action and preserves input; validation focuses a relevant field.
Logout clears private state; expiry returns to login. Thai is the first-use UI default.

Studio leads with Create Content, recent stories and their next valid action, plus at most
three useful counts. Story Factory is primary, Product Review/Kids & Toy smaller planned
entries, Investment Lab under Other. Auto Editor/Media Library/Publish are Tools; Settings
is in More. Create Content chooses a module then enters the existing Story brief form;
a New story shortcut skips the chooser. Planned modules cannot submit work.

Use All stories / Active jobs / Exported videos from actual projects/jobs/exports for statistics.
Queued means awaiting processing, without claiming worker health or a reviewed flag.
Credits stay Not available until a trusted source exists; no placeholder numbers.

## Brief, ideas and selected-story review

1. Collect name/direction/genre/audience/ratio using existing limits. Create project saves
   the brief; generating paid ideas is a separate explicit action.
2. Generate 10 enqueues the ideas job. Show real queued/running/error states, no guessed
   percentage or fake timer completion. Failure preserves valid content and offers manual retry.
3. Exactly ten radio cards allow one local candidate. Save selection persists it; distinguish
   Unsaved/Saving/Saved. Save failure retains the prior saved idea and never shows false success.
4. Review selected story shows only the persisted title/logline/hook. Expand names that story
   and its potential credit use. A different unsaved candidate must be saved or discarded first:
   never present one idea while expanding another previously saved choice.
5. Expand receives only the brief and that saved idea. Successful validation reveals the four
   bibles/scenes. Selection then locks as the server requires; another idea needs a new project.

## Overview, bibles and scenes

Show project identity/stage/selected story and one next action. Reuse existing workspace
anchors brief/ideas/bibles/scenes/clips/preview; present one active panel with a stage strip,
preserving context/scroll on language changes. Future panels explain their prerequisite;
finished material remains readable while later work is active or fails.

Story/Character/Location/Continuity bibles retain stable references. TH/EN/TH+EN applies to
bilingual narrative fields; proper names/English visual descriptions remain explicit. Current
API fields are read-only, so no pretend inline save/revision editor. Wrap reading text at 68ch.
Storyboard lists scene order/title/duration/references. Scene detail separates Thai explanation,
narration and unmodified English Flow prompt. Copy English Prompt gives inline success or
selectable fallback; prompt-pack download remains a real authenticated action.

## Flow Credit Estimate and Approve Production

The requested target adds cost review and approval before handoff. Current credit cost/balance
is unknown, not zero. Show known scene count/duration/ratio and explain that actual use is
reviewed in Flow; no fabricated rates, balance or guaranteed cap.

Client-only review dialog lists the selected story, scene plan, continuity checklist, clip
coverage and storage destination. Cancel returns unchanged; Confirm plan and open Flow
acknowledges a manual handoff. It is neither server approval nor a video-generation job.
After confirmation, keep explicit copy/download/Open Flow controls; opening Flow is deliberate.

Future durable approval needs Codex to define plan revision, estimate source/expiry when
available, approving user/time and invalidation on changes. Until then do not retain/display
Approved after reload as if it were stored. An unknown estimate may be acknowledged for
manual review in Flow, but cannot become a fake zero-cost guarantee.

## Queue, clips, editor and final export

Queue remains ideas/expansion/local editing. Cards show real type/project/status/progress
and eligible recovery. External Flow creation is Awaiting imported clips based on missing
scenes, not a worker job or running percentage. Do not poll nonexistent Flow/Drive services.

Scene-bound picker keeps MP4/WebM/MOV and 128MiB limits; native mobile selection is primary,
drag/drop optional. File chosen is not Uploaded/Synced. A fetch upload uses busy/indeterminate
unless measurable progress exists. Success displays validated filename/duration/private video;
failure stays by that scene and preserves other clips. Replacement preserves older imports
and invalidates the old final export. Local receipt and future Drive sync are distinct states.

Auto Editor requires project context and lists scene order, planned durations/ratio/missing
clips. Only normalize/trim/pad/order latest clips and preserve audio or silence; do not offer
unsupported music/transitions/subtitles. Assemble enables with all scenes/no active job.
Track real export job, with manual interrupted/failed recovery. Preview/download enable only
for a real returned export. Final review is the creator's action; no automatic publish/share.

## Google Drive primary-media target

The new direction makes Drive the primary destination after a verified integration; current
core is private local storage. Today show Local storage / Google Drive not connected. Future
connected state displays verified provider/location and simple Connected/Uploading/Synced/
Waiting/Failed, with no OAuth tokens/scopes/raw filesystem paths. An unavailable connection
action explains its availability without starting an invented flow. Failed sync retains local
clips and enables deliberate recovery. Media Library is a future provider-aware catalog;
UI_SPEC.md specifies necessary data/state dependencies without changing backend architecture.

## Mobile, languages and recovery

Mobile supports login/create/one-story save/review/prompts/status/jobs with identical gates.
Use one column, 44px targets, compact stages and one contextual action bar clear of safe areas,
keyboard and bottom nav. UI locale TH/EN is separate from content TH/EN/TH+EN; preserve context,
change no saved data and trigger no generation. TH explanation/EN prompt never swap languages.
Offline cannot enqueue work or cache private stories. Loading/error/empty states have useful
localized recovery. Expiry/cancellation/old responses cannot restore private content.
Implementation visual QA stays pending until Codex applies the design; prototype evidence
uses labelled fixtures and never proves live AI/Flow creative quality.
