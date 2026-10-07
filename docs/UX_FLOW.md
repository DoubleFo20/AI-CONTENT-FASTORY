# UX flow and requirements

STATUS: STABLE_FOR_PHASE_0A

## Owner and dashboard

First launch with no users shows setup. Owner chooses username and password (minimum
12 characters). Setup is available only from loopback and closes after one owner exists.
Later visits show login, not setup. Invalid login uses a generic translated error.
Logged-in users see project counts, recent projects and queue state. An empty dashboard
explains the first action. Logout clears application state and returns to login.

## Story production flow

1. Create brief: name, brief, genre, audience, target ratio; inline errors preserve input.
2. Generate ideas: explicit action; indicate queued/running status; exactly ten selectable
   cards with title, logline and hook; display a single selected radio state.
3. Select one: persist server selection; only then enable expansion.
4. Expand: confirm visible selection; no other ideas are sent for expansion. Bibles and
   ordered scenes appear only on a successful validated result.
5. Review production plan: separate character/location/continuity views, referenced scene
   context, Thai explanation and English prompt with accessible copy/download action.
6. Google Flow handoff: link to Flow, provide the prompt pack and clear import instructions.
   Never show a false automatic Flow generation progress state.
7. Import clips: scene-bound file picker; upload progress/busy state and rejection reason;
   show latest clip, duration and replace/import action. Retain earlier files.
8. Auto edit: show missing-scene checklist; enable only with every scene covered and no
   active job. Worker status appears in workspace and queue. Failure can be retried manually.
9. Preview/export: authenticated player and MP4 download after completion. No placeholder
   video or fake success. The creator checks the result before sharing outside the app.

## States and recovery

Every fetch/generation/upload has loading, success and translated actionable error states.
The client cannot skip server-enforced transitions. Poll queue while signed in and stop on
logout/offline. Existing completed content remains visible when a later operation fails.
Expired session returns to login without displaying private data. Offline shell explains
that generation/import/export require connection; it does not queue paid operations.

## Responsive and accessibility acceptance

At 360px no page-level horizontal overflow, single-column forms/cards and reachable primary
actions. At 768px panels can stack and sidebar collapse. At 1440px make readable use of
space. Touch targets at least 44px; visible focus; labelled controls; semantic headings;
radio/button states; live regions for status/errors; contrast target WCAG AA. Text can wrap
in both locales. Locale switching keeps project/selection context. Async actions prevent
duplicate submits. Design-system approval and visual QA remain Antigravity responsibilities.
