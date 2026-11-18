# Higgsfield ElevenLabs v4 — voice, Whisper and multilingual audio

## Locked initial voice
Read the **actual source** `voice/decision.json` in the user's Bay Referee repo; reuse Engin voice identity, not the football character/avatar. As of that source the voice is:
- provider: `Higgsfield` via the official connected tool/connector;
- engine: `ElevenLabs v4`, exact model identifier `elevenlabs_v4`;
- custom voice: `Engin`, `voice_type: element`, exact ID from `voice/decision.json`;
- stability `0.50`, similarity boost `0.75`, batch size `1`.

Use live connector schema to confirm valid fields; do not accidentally call Eleven v3 / mini / a video-generation model because it is cheaper. When live schema differs, report the exact difference rather than silently weakening the requested voice. Save the provider/job ID, model resolved by the provider, settings, canonical text and original returned audio. Never put account tokens or private clone media in source control.

## Voice and timing for a test or publication
1. Verify all script facts and spoken game names/pronunciation; record pronunciations for GTA, Vice City, Leonida, Jason, Lucia and any other names as required.
2. Generate the authorized English original or the requested private test language with Engin + `elevenlabs_v4`, batch size 1. Verify that each submitted job actually completed.
3. Save unchanged original final sound and converted editor WAV as separate files if conversion is necessary, with hashes; do not alter voice pitch, time-stretch or speed to match guessed scene lengths.
4. Run Whisper medium on **the exact final WAV**, with its recorded language and word timestamps. Store raw segments, words, script↔audio alignment mapping, unmatched words and all source hashes.
5. Use the measured word times for the scene plan. Check that captions match what is actually spoken.
6. Deliver publication captions as switchable SRTs. EP01 V4’s `review-tr.mp4` and `captions/tr.srt` are the archived Turkish test.

## Authorized multilingual publication

Use global English `en` as the original publication language. Turkish `tr`, international Latin American Spanish `es` and standard German `de` are alternate YouTube tracks. Adapt the script for natural delivery while retaining its meaning, uncertainty, dates, numbers and official names. Preserve the locked Engin identity in every language. Confirm the model and identity used. Record unresolved availability or quality gaps against the affected language. For EP01, the frozen picture and sound effects are from V4, which also preserves the Turkish test mix and its subtitles.

1. Match translated clauses to the approved picture's semantic beats. Generate the authorized voice takes and retain returned files, provider settings, job IDs and hashes. Check pronunciation of names and numbers.
2. Measure the selected takes with local Whisper **medium** and word timestamps. Perform heavy jobs serially under the shared guard. Place complete phrases or sentences against editorial anchors. When a take misses its window, adapt the sentence naturally and record a new whole-sentence pickup with the same voice. Preserve tempo, pitch, phonemes and internal phrasing. Use natural quiet edges for placement and intentional scene pauses. For a missing take, preserve the last valid edit and report the unresolved window.
3. Create one 48 kHz stereo full-duration mix per language at `t=0`, including the intended quiet holds and outro. Combine each language’s narration with the clean music and effects from the locked cue timeline. Keep cue placements and the outro intact, duck music where it overlaps speech and record the settings. Preserve source takes separately from the final `02_audio/<lang>/youtube-dub-<lang>.wav` and `.mp3` files. The English WAV supplies the original publication MP4.
4. Run Whisper **medium** on the exact final WAV of each language independently, retaining the actual word timestamps, final WAV hash and script mapping. Speech names and claims in the SRT must match what can be verified in that final take. Save the individual result as `04_captions/captions-<lang>.srt`. Confirm the decoded MP3 and the publication MP4’s English audio preserve the start, duration and cue alignment of their matching WAVs. Document encoder padding when present.

Measure final WAV and MP3 duration against the picture with ffprobe. Use `±0.05s` tolerance unless a container-specific padding exception is measured and documented. Check pace, cue agreement, the last complete phrase and silence boundaries in addition to duration. Synthetic greetings, silent placeholders and inferred timestamps do not qualify as localized deliverables.

Keep the language-neutral 16:9 picture master in the internal source archive and deliver one English-audio MP4. Retain separate WAVs and MP3s for all four languages, including English for reference and reuse. Localize brief on-screen factual labels where a separate text pass is justified. Deliver captions as switchable files.

## Spend and provider accuracy
Read user authorization for each task; the existence of the reusable skill is not blanket authorization for every future paid generation. Query connector/model capabilities and estimate cost if supplied. One successful generation is not a free entitlement. On failure retain the actual message/job and don't endlessly resubmit paid work. Preserve original outputs before trimming/format conversion; reject questionable voice/take quality rather than hiding it behind background music.
