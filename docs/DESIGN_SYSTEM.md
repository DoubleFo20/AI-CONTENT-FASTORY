# Design system — technical baseline

DESIGN_STATUS: AWAITING_ANTIGRAVITY
This file defines implementation constraints, not an approved visual design. A functional
Phase 1 validation shell may use neutral tokens; replace/polish it against approved
Antigravity specifications. Do not report final visual acceptance from this baseline.

## Direction for Antigravity

A calm production workspace: readable Thai/English typography, visible stage progress,
clear selected story, practical scene/prompt cards and unambiguous primary actions.
Favor compact studio organization over decorative generator dashboards. Target creators
on laptops and mobile phones. Support 360/768/1440px; avoid dense desktop-only tables.

## Token and component requirements

CSS variables for background/surface/text/muted/accent/danger/border/focus, spacing scale,
radii, shadows and responsive breakpoints. Use system fonts with Thai-capable fallbacks;
no blocking remote font dependency. Components: app shell/navigation, locale switch,
setup/login form, dashboard metric cards, project card/form, stage stepper, idea radio card,
bible panel, character/location cards, scene/English prompt card, copy button, clip picker,
queue status/progress/error, empty state, inline alert, video player and export button.

State specifications must cover focus, hover, selected, disabled, busy, error and offline.
Do not encode meaning only in color. Respect prefers-reduced-motion. Components must
accept translated labels and long text. Sensitive data must not be placed in persisted UI
caches. Required deliverables: approved tokens, responsive page specifications, component
states and UX interactions; after implementation, Antigravity visual QA with concrete issues.
