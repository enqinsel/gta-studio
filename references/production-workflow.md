# Long-form episode workflow and filesystem contract

## Scope and intended architecture
The Bay Referee reference engine has reusable episode contracts, FFmpeg/ffprobe, HyperFrames 0.8.x, GSAP, Sharp, Python Whisper, asset plans and QA patterns. **It is not a complete one-command longform renderer.** The GTA repo's task is to port/adapt the parts that prove useful and implement a small reproducible GTA scene compiler and episode production CLI. Do not blindly run football init/render scripts. Verify versions of installed CLI tools, dependencies and actual generated media.

Read [repository-shortlist.md](repository-shortlist.md) first. Avoid installing any extra video compositor or 3D/AI-generation stack for v1. Avoid a new SaaS dashboard, a React UI or a cloud scheduler for v1. A local CLI + source-controlled templates + reproducible manifests is enough. A future control panel is optional and out of scope.

## Requested episode organization
Use distinct immutable episode slugs (`gta6-confirmed-locations`, `gta6-vs-gta5-launch`) and versioned revisions instead of overwriting:

```text
episodes/<slug>/
  brief.md
  research/claims.json
  research/source-notes.md
  script/script-en.md                  # original publication language
  script/script-tr.md                  # alternate and archived EP01 test
  script/script-es.md
  script/script-de.md
  assets/source-register.json
  assets/video/ assets/images/ assets/maps/ assets/graphics/
  audio/en/narration-en.wav
  audio/en/provider-job.json
  audio/en/whisper-en.json
  audio/en/word-map-en.json
  audio/tr/ audio/es/ audio/de/        # only when authorized
  storyboard/semantic-beats.json
  storyboard/timeline.json
  composition/
  render/master-clean-1920x1080.mp4    # language-neutral internal source
  render/review-tr.mp4                # archived EP01 test
  captions/en.srt
  captions/tr.srt
  captions/es.srt captions/de.srt
  covers/art-master-1920x1080.png
  covers/thumbnail-1280x720.png
  social/title-tr.txt social/title-en.txt
  social/description-tr.md social/description-en.md
  delivery/qa.json
  delivery/asset-rights-review.md
  delivery/manifest.json
  delivery/summary.md
  _work/
```

Treat this layout as a file contract. For an authorized single-language test, generate the requested test assets and mark other languages `NOT_REQUESTED`. When multilingual publication is authorized, produce English original audio and the requested alternate tracks with localized metadata and covers.

For a released-cut revision, preserve the previous artifacts and place the new take under `episodes/<slug>/revisions/<revision>/` with the same input and output contract. Optional `storyboard/cut.json` records measured source-frame rests, selected chapter treatments and the branded closing sequence. Keep the original SRT as `captions/tr-source.srt` when the cut adds rests. Export retimed `captions/tr.srt` with the revised MP4. Place timed card cues in `storyboard/coverage.json` and preserve the resolved render frames in `storyboard/timeline.json`.

## Local publication package

Select the frozen revision before producing derivatives. EP01 uses `episodes/gta6-confirmed-locations/revisions/v4`, which holds the approved clean picture and the original Turkish test MP4. Keep both inside the archive. Run `node scripts/publishing.mjs prepare REVISION SLUG` from the project root to assemble the numbered tree and record source hashes. Once the final English WAV is verified, run `python3 scripts/heavy-job.py --label gta-publish-en -- node scripts/publishing.mjs mux SLUG` to stream-copy the frozen picture and mux the English mix into the sole publication MP4.

```text
videolar/<slug>/
  00_brief/      topic, brief and frozen revision metadata
  01_script/     EN / TR / ES / DE scripts, claim and source map
  02_audio/      tr/, en/, es/, de/ with retained takes and final youtube-dub-<lang>.wav/.mp3
  03_video/      <slug>-valea-en.mp4
  04_captions/   captions-<lang>.srt and optional archived subtitle reference
  05_cover/      thumbnail-<lang>-1280x720.png for EN / TR / ES / DE
  06_social/     localized title, description and hashtag files, plus youtube-tags.txt
  07_assets/     rights and source records, cover provenance, locked clocks, music and effects
  08_delivery/   measured QA, hash manifest and review status
  _work/         local intermediate takes and diagnostics
```

Use English as the original video language, with the English title, description and `05_cover/thumbnail-en-1280x720.png` as defaults. TR, ES and DE WAVs and MP3s serve as alternate YouTube tracks. Keep the matching EN WAV, MP3 and SRT with the package for reference and reuse.

Prepare `title-<lang>.txt`, `description-<lang>.txt` and `hashtags-<lang>.txt` for EN/TR/ES/DE. Put the most relevant search phrase near the start of each title and describe the actual video in the first lines of each description. Localize the wording for each audience. Use only episode content, useful measured chapters and a short set of relevant hashtags in each public description. Match the hashtag set to the corresponding hashtag file. Keep source references, archives, links and credits in the internal source records, and record language options in the delivery checklist. [YouTube titles](https://support.google.com/youtube/answer/12340300?hl=en) · [Descriptions](https://support.google.com/youtube/answer/12948449?hl=en) · [Hashtags](https://support.google.com/youtube/answer/6390658?hl=en)

Put ordinary Studio tags in one comma-separated `06_social/youtube-tags.txt`. Cover EN/TR/ES/DE with relevant localized search phrases and include each shared name once. Keep the total at or below 500 characters, counting commas and the implicit two quotes around each multiword tag. [Studio tags](https://support.google.com/youtube/answer/146402?hl=en) · [YouTube tag length calculation](https://developers.google.com/youtube/data/reference/rest/v3/videos#snippet.tags)

Keep cover artwork, crop and hierarchy consistent across languages. Change the short headline with an optical fit check and review at 320×180. Keep the exact approved Turkish thumbnail if localizing an existing package. Deliver one selected 1280×720 PNG per language, for four files total. Keep optional design masters, trials and previews under `_work/` or in the immutable revision archive. Keep the cover provenance record in `07_assets/`. Hold platform publication for separate authorization and rights review.

## Stages
1. Confirm current official publication state and topic angle; research enough grounded facts to support an honest story. **Optional:** inspect one reference video for editing grammar with [reference-analysis.md](reference-analysis.md), only if it does not stall delivery.
2. Create claim ledger, choose factual order, identify the strongest actual source images/clips and their target narrative uses. **MEDIA-COVERAGE PREFLIGHT:** map each intended claim/segment to real footage/stills; verify local ingest and usable in/out points before locking a long script or spending on voice. Mark unfillable beats for script revision, not generic AI-video filler.
3. Write a **natural-length original English narration** for publication, with a strong first sentence, a proof-based payoff and varied pacing. Use the requested language for a private test. Avoid listicle filler, redundant intros/outros, repetitive AI phrases and unsupported superlatives. Choose duration from the story and accessible evidence.
4. Generate the authorized `Engin` narration via Higgsfield + `elevenlabs_v4` for the original publication language or requested test. Verify voice settings and real tool availability before paid jobs. Save original WAV and exact job/settings evidence.
5. Run local Whisper **medium** (recorded language, segments and word timestamps) on the exact selected final WAV. Preserve raw transcriptions and map canonical lines to actual word time ranges. Audit mismatches.
6. Plan semantic beats and shots from voice time spans. Each shot must be linked to a claim, actual source asset or truthful explanatory graphic. Record source timecode, image hold, crop, entry/exit and why it is visible at that moment. Prefer meaningful longer holds over mechanically changing shots every 1.5 seconds; vary pace with narrative content.
7. Build the visual master in **the existing pinned HyperFrames/GSAP/Sharp + FFmpeg stack** (no Remotion/EffectCraft switch in the pilot) using deterministic absolute-time compositions. Adapt/rewrite football-specific layouts for **1920×1080**; avoid blindly scaling 9:16.
8. Add sparse semantic graphics, purposeful cuts/zoom/crops, documentary music/SFX, subtle watermark only after the channel brand is settled. Make the scene focus and honest real-media evidence immediately obvious. Keep spoken captions external to the language-neutral visual master.
9. Export the English-audio publication MP4 (H.264/AAC) and standalone EN SRT. For a private test, export the requested review audio and matching SRT. Verify picture/audio and critical sequences at 1×. Compare captions with the canonical script.
10. Create a premium 16:9 default English cover, factual search-focused metadata and corresponding localizations when authorized. Store thumbnail source evidence and independent rights review.
11. Run codec/duration/frame/audio/Whisper/claim/asset/motion checks; hand off the actual private review cut with an honest `READY_TECHNICAL` vs `RIGHTS_REVIEW` status.
12. When alternate narration is authorized, use the frozen picture and assemble the complete local audio, SRT and metadata package through the workflow above. See [localized audio](voice-and-localization.md#authorized-multilingual-publication).

## Narration and picture synchronization
Freeze final audio before timing the scene transitions. All data refer to an absolute picture timeline from 0. Frame-aligned state transitions should match the measured word/segment timestamps, not artificial script estimates. Keep pauses where a map or comparison deserves reading time. If a visual beat needs more time, fix the script/voice before completing the master or intentionally extend a genuine shot with explanation, never freeze a fake clip in place.

## Render/test sequence
Start with a few selected scenes and a technically decoded montage to prove the 16:9 asset pipeline, then proceed to the full episode as the current work scope. An intermediate smoke render is not a deliverable and must not be represented as finished. Inspect representative frames and consecutive frames around edits, plus play at 1×. Produce no YouTube upload or third-party publish action automatically.

## Failure behavior
When the exact source clip is not legitimately accessible, use another honest verified visual or narrow the claim/script. Preserve work and report the exact missing media. Do not fabricate an episode by duplicating a placeholder clip. Missing providers, paid call rejection, unavailable Engin clone or insufficient authoritative source evidence must be disclosed; never silently substitute another voice or invent a produced file.
