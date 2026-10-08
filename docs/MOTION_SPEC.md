# Motion specification — AI Content Factory

STATUS: DESIGN_SPEC_READY_FOR_CODEX
IMPLEMENTATION_STATUS: PENDING
Finalized: 2026-10-09 (Asia/Bangkok)

Motion supports orientation, confirmation, and progress. It never implies a paid action, external Flow progress, data persistence, worker health, or readiness the application cannot observe. Use current React/CSS architecture and native progress/status semantics; operational pages need no motion library.

## Tokens and implementation

- Duration tokens: `--motion-fast: 120ms`, `--motion-standard: 180ms`, `--motion-emphasis: 240ms`.
- Easing: `cubic-bezier(.2,.8,.2,1)` for non-linear UI transitions.
- Animated properties: transform and opacity only. Do not animate layout, width/height, shadows, blur, gradients, or large surfaces. State colors may change immediately.
- Use subtle transform/opacity for navigation drawer, section reveal, saved-selection confirmation, and button pressed/hover feedback. Keep movement small (maximum 4px translate or 0.985–1 scale); avoid stacking effects on one control.
- Operational progress uses native `<progress>` and numeric percentage from `Job.progress`. Apply each received value immediately without smoothing the native bar width; never run an indeterminate loop or interpolate invented progress. Keep textual state and percentage visible.
- Skeletons may use a low-contrast opacity pulse only when motion is allowed; static placeholder with “Loading” is required under reduced motion and for constrained performance.
- Limit blur to at most 12px on static navigation/header/action chrome; an optional modal backdrop may use at most4px. Prefer opaque token-surface fallback. Never blur active text, controls, focus outlines, progress, video, or mobile operational cards.

## Context by surface

**Landing/module selection (future surface):** Restrained depth/parallax is permitted only if optional, static on operational routes/mobile, and reduced-motion aware. GSAP or Three.js/React Three Fiber are optional future landing-only techniques, not requirements and not reasons to add dependencies. Current app has no landing route beyond auth/dashboard; do not add a 3D scene for this spec.

**Operational app:** Route changes remain immediate or use a 120ms opacity transition without delaying focus or interaction. The mobile More drawer is a true modal: backdrop plus drawer may fade/translate within 180ms; trap focus, close on Escape/backdrop/hash navigation, and return focus to More. Selected idea uses static radio/outline/badge first; optional 120ms opacity/scale acknowledgment follows successful saved-selection response. A local unsaved choice must not animate as persisted.

**Story and prompt content:** No staggered text reveal, typing effects, animated generation metaphors, or auto-scroll through generated content. When ideas/package arrive, update normally and announce status through the existing live region. Copy action may briefly change to “Copied”; screen-reader status is authoritative.

**Queue and export:** Apply received percentage changes in native progress immediately; keep queued/running/completed/failed labels visible. No spinner as the only state. Queue polling while signed in/online already runs on a 3-second interval; do not add independent animation/timer loops or show a worker heartbeat. Failed and completed states settle to static visuals.

**External Google Flow:** The Open Flow link has normal focus/pressed feedback only. No app animation/state suggests Flow is generating, connected, or approved. Handoff occurs outside the app.

## Reduced motion, accessibility, and performance

For `prefers-reduced-motion: reduce`, remove transforms, parallax, opacity pulses, smooth scrolling, stagger, and nonessential route/card transitions. Preserve state via text, shape, selection, and native controls. Meaningful progress remains a static labeled `<progress>` value; meaningful loading remains a static label/skeleton. Never disable focus feedback or status announcements.

Honor `prefers-reduced-transparency` where available by replacing glass with solid `#121b2a` or `#1a2638`. Motion/backdrop effects must not reduce text contrast or obscure focus. Do not reveal controls only on hover. No looping video or animated background on auth, dashboard, project, queue, clip, editor, or preview screens.

Keep operational mobile effects minimal: no parallax, large-area blur, WebGL, or animated hero background. Respect device performance and avoid installing GSAP/Three as app dependencies for these requirements. Reduced-motion styles must be explicit in CSS and covered during later visual QA.

## Motion acceptance checklist

- [ ] Durations are 120/180/240ms and easing is `cubic-bezier(.2,.8,.2,1)`.
- [ ] Animated properties are transform/opacity only; blur is static and ≤12px.
- [ ] Every animated action has static and textual state equivalents.
- [ ] Reduced motion removes loops, parallax, smooth scrolling, pulses, and nonessential transitions.
- [ ] Job progress reflects only received `Job.progress` values applied immediately; label and number remain visible.
- [ ] No animation implies Flow automation, durable approval, Drive sync, worker heartbeat, completion, or success without matching contract data.
- [ ] Operational mobile screens have no heavy visual effects; no motion dependency is required.
