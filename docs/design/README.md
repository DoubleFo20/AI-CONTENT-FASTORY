# AI Content Factory — standalone design reference

Open `index.html` from a local static server restricted to this folder. The three files
have no dependencies, remote assets, API calls, authentication, storage connection,
service worker, file reads/uploads or paid operations. The permanent bilingual banner
marks every screen as a design prototype with sample data.

The design screen chooser exposes 15 references: login, dashboard, create, ten ideas,
story overview, four bibles, storyboard, Flow prompts, approval, queue, clip import,
Auto Editor, preview/export, planned media library and settings. Hashes use
`#design/{screen}` solely for prototype navigation; they are not production routes.

Interface language and content display default to Thai. The separate content control offers TH, EN and
TH + EN, with Thai above English at every viewport. Scene explanations remain Thai,
and production prompts remain English. The copy control copies only the selected
scene's English fixture prompt, with browser clipboard fallback and failure feedback.

Ten distinct fixture ideas use one native radio group. Saving changes only page memory.
The detailed bibles/storyboard are a fixed reference story, *The last train*. They are
not newly generated expansions of another selected fixture idea. Screen examples are
independently labelled: clip import has 3/4 clips, while the editor reference illustrates
the separate all-clips-ready state. None of the sample queue statuses represents a
running worker.

Auto Editor navigation from Tools asks for a sample project, then enters its clip
context. Approval uses a native dialog with Cancel as the initial focus and opens
the sample queue only. File inputs, video playback and MP4 download remain unavailable
because the prototype has no actual media files. Login fields are disabled and accept
no credentials. Google Flow credit cost/balance is Unknown, and Google Drive remains
Not connected. Future storage state labels are explicitly marked as examples.

Responsive rules: 248px sidebar at 1200px+, 72px rail at 768–1199px, and native menu
drawer plus bottom navigation below 768px. Mobile gutters are 16px. Controls have
44px minimum targets, essential borders use `#667a95`, text wraps, and the OS reduced
motion preference disables transitions/animations. Motion uses 120/180/240ms with
`cubic-bezier(.2,.8,.2,1)`, transform/opacity only, and up to 4px of movement. Reduced
transparency replaces glass effects with opaque surfaces. System fonts need no downloads.

Executed checks: `node --check docs/design/studio.js` (exit 0) and a read-only Node VM
render check (30 screen/locale renders, 15 screen references, exactly 10 radios; exit 0).
Root completed browser layout measurement in 270 cases: 15 references × two UI locales
× three content modes × 360/768/1440px. Page overflow, heading presence, enabled
button/select target size, exactly ten idea radios and Thai-before-English stacking passed.
Keyboard BibleTabs, modal focus wrap/Escape/focus return, sample selection retention and
draft preservation were exercised. These checks cover the reference only.

Run `node scripts/preview-design.mjs` from the repository root to inspect
http://127.0.0.1:3003. The loopback server serves only the four reference assets;
it does not expose the repository or runtime. You may also open index.html directly.

Captured 2026-10-09 (Asia/Bangkok): [desktop dashboard](previews/dashboard-th-1440.jpg),
[mobile dashboard](previews/dashboard-th-360.jpg), [bilingual ideas](previews/ideas-th-both-1440.jpg),
[tablet Flow prompts](previews/flow-th-both-768.jpg) and [QA results](previews/QA_RESULTS.json).

Copy feedback was observed; browser-session clipboard read-back was empty, so payload
copy is not claimed as a measured pass. Physical mobile IME, OS reduced-motion/
transparency behavior, assistive technology and full rendered contrast/zoom remain pending.
The app implementation still requires the checklist in [VISUAL_QA](../VISUAL_QA.md).
This artifact does not modify or claim visual acceptance of the production UI.
