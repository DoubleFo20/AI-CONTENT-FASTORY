# AI and media pipeline

## Text generation

The authorized existing environment key powers server-side OpenAI Responses calls.
Provider interface: generateIdeas(ProjectInput) → Idea[10];
expandStory(ProjectInput, selected Idea) → StoryPackage.
Use strict JSON Schema derived from shared schemas, parse and validate on receipt, handle
refusal/incomplete/timeout/network/invalid output without saving partial content. No tools,
remote browsing or code execution are given to generated story text. store:false minimizes
provider-side response storage; data policy remains the Owner's provider agreement.
Treat user brief and generated content as untrusted data. Display plain text, never HTML.

Exactly ten ideas are persisted only when all are valid and unique. Only the one stored
selectedIdeaId can be expanded. Enforce character/location IDs and scene references,
ordered scene indices, bilingual bible content, Thai explanations and English prompts.
Default models: gpt-6-luna for ten scoped ideas; gpt-6.1-sol for expansion, low reasoning.
Environment overrides are explicit; never silently escalate price or automatically retry.
Use bounded token budgets and request timeout. Tests inject a deterministic provider and
never consume live credits; record any live smoke request separately.

## Four bibles and prompt content

Story Bible contains premise, arc, tone and ending. Character Bible contains stable names,
visual description in English and bilingual background. Location Bible contains stable
visual environment in English and bilingual description. Continuity Bible contains stable
appearance/props/time/location rules. Each ordered scene references existing characters
and one location, with duration, Thai explanation, bilingual narration and English Flow prompt.
Prompts include stable appearances, setting, action, camera, lighting and continuity; avoid
inventing a supported Flow feature, model control, or guaranteed identity preservation.

## Google Flow primary boundary

Download a JSON prompt pack or copy English scene prompts. The creator opens Google Flow,
generates and reviews clips using their own authorized account, downloads the results and
imports them per scene. This app does not claim to call a public Google Flow API.
Flow's creator web workflow is documented in [Google Flow Help](https://support.google.com/flow/answer/16353333?hl=en).
Account eligibility, features and credits can change; consult Flow itself before purchasing.

## Local automatic editor

Validate uploaded media with ffprobe, require finite positive duration and a video stream,
limit size to 128 MiB, generate opaque filenames and keep private ownership. Select one
latest clip for every scene; order by the storyboard, trim/pad to planned duration, fit/pad
to the chosen ratio, normalize 30fps H.264/AAC, retain audio or generate silence, concatenate,
write final MP4 and commit export metadata only on success. Preview/download require auth.
No music/subtitles/transitions in this bounded V1 editor. Interruptions are visible failures;
temporary partial files are not exports and manual retry is the only paid-job recovery.

Official text reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
