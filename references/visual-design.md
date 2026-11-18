# Visual system — cinematic cyber / GTA-adjacent editorial

## Identity in one sentence
"Premium investigative gaming documentary in the atmosphere of neon Vice City" — **not** a Grand Theft Auto official channel, not a copy of Rockstar artwork, and not a generic AI neon wallpaper slideshow.

## Design references, but no dependency sprawl
See [repository-shortlist.md](repository-shortlist.md) and [reference-analysis.md](reference-analysis.md). HyperFrames + GSAP deliver v1. The user-provided `lemo-opuscar` **Visual Investigation** suggests verifiable evidence pacing; its **Hologram HUD** suggests conditional callouts; its **Neon Tubes** suggests physically motivated light. These are conceptual inspirations only. Do not adopt their entire rendered examples, verbatim style instructions, unique compositions or unlicensed files. `rea-video` may analyze a useful reference for editorial rhythm but must not become a competitor-copy pipeline.

## Picture priorities
1. The actual source being discussed fills the frame when its details matter; use intelligent 16:9 crops, source-aware zooms, and clear before/after match cuts.
2. Maps from sourced geography and evidence, animated routes/callouts, side-by-side GTA V/VI screenshots, arrows and clean technical comparisons only when anchored to a narrated factual claim.
3. Simple interstitial cards or black/dark rests as rhythm between chapters, not a recurring gimmick every 10 seconds.
4. Avoid synthetic gameplay. AI backgrounds are an exception for clearly non-game atmosphere only; an authorable map/chart is better than generating fictitious imagery.

## Brand tokens
- Use warm graphite `#100E13`, paper `#FFF4E9` and muted peach `#E5B29C` on rare informative labels. Keep titles, chapter introductions, fact cards and thumbnails free of decorative rules, including blue and cyan accents. Preserve colors in the original Rockstar imagery.
- Use Avenir Next or a legible geometric fallback. Spatial hierarchy, weight and local shadow carry the titles. Use a soft vignette only where type needs contrast.
- Film-like contrast, dark anchored shadows, subtle grain only if it does not obscure small gameplay details. No gratuitous chromatic aberration, bloom, particles, rapid zooms or VHS overlays.
- On-screen wording: event titles, confirmed region/location names, comparison labels, occasional numerals; as few words as possible. Subtitles are independent files, not a permanent oversized font wall.
- Motions: purposeful reveals tied to spoken evidence. Shot duration from reading/viewing need; not a clock-driven cut interval. Mixed footage and authored graphics should share intentional contrast/exposure.

## Cyber / GTA look without AI slop
- Real GTA footage remains the hero. Brand accent appears in short transitions and rare highlighted facts, never as a permanent UI frame around authentic media.
- Cyber means precise edges, confident dark type contrast, very restrained neon color, clean vector callouts, fine grain and subtle parallax — **not** ubiquitous purple gradients, rain/glitches, RGB splits, sci-fi HUD overlays or 3D fake maps.
- Build a **small own design token system**, not an unreviewed 99-style selector. Maintain a small number of repeatable visual patterns but vary actual scene composition to the evidence.
- Prefer meaningful investigative framing: an original source frame → detail inspected → contextual location/claim → what remains unconfirmed. The viewer must be able to tell which frame is real and which is an editorial diagram.
- If a title/label will not make sense in EN/ES/DE, remove it from the universal picture master, or store it as a separately localized graphic.

## A repeatable landscape grammar
- `FULL_BLEED_EVIDENCE`: clean landscape gameplay/official clip with no obstruction.
- `DOCUMENTARY_PUSH`: careful motion into an authentic still, never cropping away what matters.
- `A_B_COMPARE`: equal-sized real GTA V and GTA VI media, obvious short GTA V/GTA VI labels and traceable source/version.
- `MAP_EVIDENCE`: sourced map/outline with only relevant confirmed places shown.
- `FACT_CALLOUT`: one short data point or documented source fact with enough hold time to read.
- `CHAPTER_CUT`: one restrained thematic transition when the structure actually changes.
- `END_PAYOFF`: evidence lands; final shot finishes naturally. No mandatory mascot or whistle sign-off.

## Opening, corner mark and outro

- Open on a full-bleed genuine image with a spare title. Use chapter names on their first context shot and give evidence cards enough reading time. Use fast cuts for a specific cue or emphasis. Merge short fallback flashes into meaningful holds.
- Use **VALEA** as the public display name. Keep the internal ID `gta-studio`. `engine/composition/brand.json` supplies the transparent V mark to the corner watermark and the full wordmark to the outro. Preserve clear space and use a quiet shadow over bright footage.
- Begin the outro with motion from official Vice City or Leonida footage. Let the camera movement, source light and original or cleared music reach a stable visual beat before revealing the logo. Hold the logo through the music's resolve. Duration follows picture and sound. Use the mark as the final editorial beat and reserve announcements and calls to action for separate assets. Export standalone MP4, PNG and score assets.

## Word-timed editorial motion

- Resolve the first spoken word of each important name against the locked Whisper map and frame-round it after applying authored rests. Use `card.items[].on` in `storyboard/coverage.json` and document the measured reveal frame. Give unspoken group labels a disclosed group anchor. Use one short lift, mask or fade suited to the reading order, then let the preceding names settle into lower contrast.
- Apply treatment at meaningful scene boundaries. A brief dissolve can connect shared framing in two stills. A restrained focus settle can signal a change in scale. A clean cut can carry a separate audible arrival. Keep transitions off labels with unresolved evidence and preserve critical details in crop.
- Use original or licensed isolated sound cues. Offset them in frames relative to the cut, preserve the locked voice and test that the effect remains below speech. Shape the outro score in time with the sourced clips and leave audible headroom at the last hit.
- Store the optional outro sequence in `storyboard/cut.json` with ordered `shots`, source in-points, frame counts, `identityAt` and a hashed `music` file. Match the source framing when a sequence uses a cinematic matte. Outro asset choices can change per edit while the mark and reveal logic remain reusable.

Never build the episode entirely out of these layouts like reusable fill-in-the-blank slides. Storyboard every section independently according to the source's composition and the speaker's reasoning. Source footage may contain inherited labels/logos; do not hide/remove them deceptively.

## Cover contract
- Export one final `1280×720 PNG` per language. A 1920×1080 art master is an optional internal production asset.
- Genuine Rockstar/game capture or clearly sourced real comparison artwork, preferably focal object/character/location on one side and a purposeful short headline on the other.
- 0–3 headline words when a wordless image can carry the claim; max 4 if necessary for clarity. Keep text within safe margins, legible at 320px wide.
- For episode 01: use genuine Vice City/Leonida visual with one coherent focal area; possible thumbnail text `THE MAP` or no text. Do not add fake map regions.
- For episode 02: truthful verified GTA V/GTA VI pair with restrained `V vs VI` or `WHAT CHANGED?`; same scene types and documented context, no falsely identical camera comparison.
- Avoid sensational red circles/arrows, stock-looking AI game characters, falsely rendered "exclusive gameplay" labels, Reddit-style collage chaos, overlong descriptive text, official Rockstar logo mimicry and synthetic leaks.
- Render and inspect the thumbnail at 1280px, 640px, and ~320px. Select the cover by topic fit, legibility and focal clarity. When localizing a selected cover, retain its art and crop. Keep any exploratory artwork, optional design master and previews in `_work/` or the immutable revision archive, with provenance in `07_assets/`.
- Keep the leading subject easy to recognize at 320×180. Use source light and local grading to make one headline readable at a glance. Check all languages at the same mobile size. Place only the four upload PNGs in `05_cover/`. Use `thumbnail-en-1280x720.png` as the English default.

## No AI-slop review
Fail/revise if: repeated static full-screen art has no editorial purpose; generated scenes look like fake GTA gameplay; every clip receives the same zoom; fluorescent gradients outnumber evidence; animations distract from the claim; typography looks like a template; fabricated scenery is presented as official; unnatural narrating phrases are repeated; pacing outruns readable authentic details.
