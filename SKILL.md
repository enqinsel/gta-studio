---
name: gta-studio
description: Produce GTA VI documentaries and multilingual publication packages for VALEA with verified game media, Engin/Higgsfield ElevenLabs v4 narration, Whisper-synced motion, measured audio mixes, and a reusable city-led outro. Use for the gta-studio project and its episodes.
---

# VALEA · gta-studio production skill

## Core purpose
Create **original, credible, cinematic, narration-led GTA VI analysis/documentary videos**, not gameplay tutorials pretending the producer owns the game, and not generic AI videos. The user supplies a topic or authorizes AI topic discovery; the agent does the research, script, real-media planning, audio, timeline, render, thumbnail, and QA. No on-screen narrator or mascot. Use the real game as the subject, not artificial imitations of it.

## Separate from BAY REFEREE
The source/reference project is `https://github.com/enqinsel/bay-referee`. Read its actual maintained skill (`brand/bay-referee/channel-skill/bay-referee/`), reusable engine, `voice/decision.json`, Higgsfield connector docs, local Whisper, HyperFrames, FFmpeg, asset records, and heavy-job guard **before adapting code**. Maintain the independent `gta-studio` project. Do not modify or replace Bay Referee's repository, installed skill, brand, production files, or existing exports. Its motor is a library of components and scaffolds, **not an already-complete automatic long-video generator**: implement and test missing GTA-specific orchestration honestly.

Avoid copying football-specific: green pitches, referee avatar/Rhubarb mouth cues, referee marks, whistle outro, vertical 9:16 layouts, forced 60–75s scripts, burned-in Turkish captions, football covers and palettes, or hard-coded episode paths. Copy/port only actually reusable and understood components; update their tests and dimensions. Skill source should be in this GTA repo and its discoverable copy at `$CODEX_HOME/skills/gta-studio` (or `~/.codex/skills/gta-studio`). Maintain and synchronize them safely.

## Tool choices — curated, not a shopping list
Use [repository-shortlist.md](references/repository-shortlist.md) as the authority for the 13 user-supplied GitHub projects and their role. **Default is the Bay Referee engine's already-pinned HyperFrames + GSAP + FFmpeg + Sharp + Whisper.** Never install/clone all candidate repos. `rea-video` is optional reference analysis; `lemo-opuscar` is style guidance, not a replacement renderer; Three.js is a scene-specific exception. Remotion, EffectCraft, Blender MCP and ComfyUI are deferred for the pilot. Follow [reference-analysis.md](references/reference-analysis.md) only when a useful reference clip is available without delaying EP01.

## Fixed creative constraints
- Frame: **1920×1080, landscape 16:9, 30fps**, H.264/AAC for final MP4; voice production retains high-quality originals.
- Runtime: **NO minimum/maximum duration**. Build natural breathing room, pauses and visual holds from the facts, voice, and media. Never accelerate pictures to hit an arbitrary runtime. No unrelated filler.
- World: serious, modern **cyber-noir / neon Vice City / GTA-adjacent editorial**. Premium, energetic and restrained, not a copied GTA logo/UI or cheap neon template. See [visual-design.md](references/visual-design.md).
- Channel graphics use warm graphite, off-white type and a muted sunset accent. Keep title cards, chapter labels and thumbnails free of decorative blue or cyan rules. Let genuine source lighting carry the scene's color.
- Keep `gta-studio` as the internal project and skill ID. Use **VALEA**, its original V symbol and the full lockup from `engine/composition/brand.json`. The city-led outro follows the rhythm of the sourced footage and score. For a brand-only revision, preserve the outro's source in-points, cuts, matte, score and logo timing. Keep episode announcements and calls to action out of the outro.
- Footage: real GTA VI official videos, trailers, published screenshots, verified actual post-release capture and historical GTA V media first. No fabricated GTA VI gameplay, false comparison shots, invented UI, locations, features or synthetic "leaks." **AI image/video generation is rare and only for truthful, clearly non-game conceptual material**. See [research-and-assets.md](references/research-and-assets.md).
- Graphic text: minimal purposeful titles/labels, clean typography, **no karaoke text wall**, no persistent presenter portrait. Make the visual master language-neutral wherever possible; deliver accessible external subtitles.
- Voice: `Engin` clone via the **official Higgsfield connector**, model **`elevenlabs_v4` (Eleven v4)**, default stability `0.50`, similarity boost `0.75`, batch size `1`; verify live provider schema. Do not auto-switch to other models/voices. Reuse identity from Bay Referee's `voice/decision.json` securely; do not invent credentials. See [voice-and-localization.md](references/voice-and-localization.md).
- **English is VALEA’s original publication language.** Deliver one English-audio MP4 linked to the frozen picture, full-duration audio files in EN / TR / ES / DE, and a synchronized SRT for each language. Turkish review cuts are internal tests. Paid speech generation requires authorization for its scope.
- Cover: high-quality 16:9 cyber-cinematic editorial thumbnail, composed from a genuine game screenshot or verified real media. Use one visual subject and up to a few short words. Export one final 1280×720 upload image per publication language.
- Deliver locally for user's inspection; no uploads, account setup, publishing, paid generation beyond authorization, or claiming manual reviews happened automatically.

## Production Mode vs editorial tasks
A request to design a skill/engine does not automatically authorize paid generation or a final render. When the user explicitly requests an episode, do not ask a questionnaire: research a defensible angle, fact-check, write the script, find media, freeze the actual voice, storyboard to Whisper, render and QA. Ask only for a true blocker. No artificial stage approvals; do the requested scope.

For full production read [production-workflow.md](references/production-workflow.md); for research/footage read [research-and-assets.md](references/research-and-assets.md); for media treatment/covers read [visual-design.md](references/visual-design.md); for voice/timing/dubs read [voice-and-localization.md](references/voice-and-localization.md); for rendering/inspection and machine limits read [qa-and-runtime.md](references/qa-and-runtime.md).

## Local publication package

Prepare `videolar/<slug>/` from the approved revision with `node scripts/publishing.mjs prepare REVISION SLUG`. Preserve EP01 V4 and the entire revision archive, including the internal clean picture and Turkish test MP4. Deliver a single English-audio publication MP4 plus separate full-length WAV, MP3 and SRT files in EN / TR / ES / DE. TR, ES and DE are alternate YouTube audio tracks. English is the original video language and the default title, description and cover.

Deliver only the four selected 1280×720 upload images in `05_cover/`. Set the English file as the default. Write search-focused, localized titles and descriptions. Public descriptions consist of episode content, useful chapter timestamps and relevant hashtags. Keep sources and credits in `07_assets/` and reserve language-availability details for the delivery checklist. Store one shared multilingual Studio tags list in `06_social/youtube-tags.txt`. Record file hashes, technical checks, listening and rights in the package. This workflow stops at local delivery. See [production workflow](references/production-workflow.md#local-publication-package), [localized audio](references/voice-and-localization.md#authorized-multilingual-publication) and [publication QA](references/qa-and-runtime.md#publication-package-qa).

## Essential timeline rule
**FACTS + SOURCE MEDIA (ENOUGH REAL SHOTS TO SUPPORT THE SCRIPT) → FINAL CANONICAL SCRIPT → FINAL ENGIN WAV → WHISPER MEDIUM WORD TIMESTAMPS → SEMANTIC BEATS → VISUAL STATES + MEDIA IN/OUT → MOTION PLAN → RENDER → QA.** Do not force a voice to preconstructed scenes, infer timestamps from script character lengths, invent missing clips, or repeat unrelated imagery just to fill time.

Give factual images and readable source cards the hold their evidence needs. Review short fallback fragments explicitly and keep fast cuts for deliberate emphasis. For a picture revision, reuse the locked WAV where the speech still serves the episode. If the edit adds breathing room, insert it in a measured quiet interval and offset captions and visual anchors from the same edit clock.

For a reported flash or unclear action, inspect the exported frames and the source window frame by frame. Check internal cuts within source clips as well as the editor's shot boundaries. Record both source and output times, then choose an in/out window that lets the action register at its natural speed. Preserve adjacent spoken anchors where possible.

Measure narration, each transition cue, the score and the decoded delivery mix separately. Aim for natural, intelligible speech and use approximately −16 to −14 LUFS integrated and −1 dBTP or below as delivery references. Keep music below speech when they overlap. Record actual device listening separately from waveform checks and muted playback. See [qa-and-runtime.md](references/qa-and-runtime.md).

Use the Whisper edit clock for named items and grouped reveals. Keep legibility through the next spoken beat. Use different transition treatments where the source shots and the story justify them. Start a substantial motion-design or outro revision with two or three timecoded source references and adapt only their editorial principles. See [reference-analysis.md](references/reference-analysis.md) and [visual-design.md](references/visual-design.md).

## First two authorized editorial briefs
1. [Episode 01 — Every Confirmed Location](briefs/episode-01.md): research GTA VI locations from current official material. The TR-only pilot is archived in EP01 V4. The publication package uses English original audio and TR / ES / DE alternate tracks.
2. [Episode 02 — GTA VI vs GTA V](briefs/episode-02.md): prepare the research structure now, **verify facts against real game-release coverage when available after November 19, 2026**; do not assert a feature from previews as observed gameplay.

The user named these topics; do not replace them with trend chasing. A separate topic-research mode may score subsequent topics using verified sources, measured YouTube data, recency and creative differentiation; never claim unobservable view-growth numbers.

## Resource and rights handling
On the user's **Mac mini M4 / 16 GB**, run **one memory-heavy local job at a time** across all workspaces: FFmpeg, render, Whisper medium, etc. Port/reuse Bay Referee's existing OS-wide `flock`/`scripts/heavy-job.py` protection and **the same underlying lock**, so GTA and Bay Referee cannot run heavy work concurrently. Never delete a live lock, bypass it, downgrade Whisper or run parallel models to save time.

For footage, capture essential source provenance and mark each asset `APPROVED`, `REVIEW` or `RESTRICTED`. Do not spend the pilot phase performing endless licensing research. `REVIEW` assets can be cut into a private local review candidate if accessible without bypassing restrictions, and are clearly identified in the handoff. `RESTRICTED` media is excluded. Public upload/monetization remains a separate clearance/review step by the user, but file access and permission cannot be presumed; do not bypass DRM, reuse prohibited leaks or obscure watermarks to conceal provenance.

## Non-negotiable media-coverage gate
Before paying for the voice or locking a long script, create a **claim-to-actual-visual map**: every important claim must have directly relevant confirmed footage, genuine screenshot, official artwork, or a sourced explanatory schematic. If available real media cannot carry a section, narrow the claim, remove filler or reduce the video's natural length; **do not invent GTA gameplay, loop irrelevant images or accelerate source footage just to fill narration**. One well-constructed shorter film is preferable to a long video of repeated stills.

## Deliverable truthfulness
A generated plan, empty directory, placeholder MP4 or upstream job URL is **not** a produced video. Return exact existing paths and actual QA outcomes. Clearly distinguish `PLANNED`, `IN_PROGRESS`, `LOCAL_REVIEW`, `READY_TECHNICAL`, `RIGHTS_REVIEW` and `FAILED` statuses. Never say an English dub, 10-minute render, video cover, or screenshot exists unless the artifact was created and verified.
