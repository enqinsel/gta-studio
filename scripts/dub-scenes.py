#!/usr/bin/env python3
"""Place verified narration stems on the approved picture and generate measured dub SRTs."""

from __future__ import annotations

import argparse
from difflib import SequenceMatcher
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import wave

import narration

ROOT = narration.ROOT
BAY_REFEREE = narration.BAY_REFEREE
V4 = ROOT / "episodes/gta6-confirmed-locations/revisions/v4"
RELEASE = ROOT / "videolar/gta6-confirmed-locations"
SAMPLE_RATE = 48000
WIDTH = 3
LANGUAGES = {"tr", "en", "es", "de"}
# Whisper's native spellings of the voiced fictional place. The claim/source ledger supplies its spelling.
PLACE_ALIASES = {
    "gta": {"geta"},
    "tishawocka": {"tishawalker", "tishawaka", "tishawoka", "tishawocca", "tischawocka", "tischawoka", "tishavoca", "tiscauaca"},
    "vcport": {"bezeport", "beseport", "beceport", "uveseport", "vcport"},
    "keys": {"cays", "case"},
    "grassrivers": {"grassrivers"},
    "allied": {"elliot", "allet"},
    "kalaga": {"calaga", "calagha"},
}


def checked_ffmpeg(command):
    subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", *command], check=True)


def read_plan(manifest, picture, requested_language):
    data = narration.read_json(manifest)
    language = requested_language or (data.get("language") if isinstance(data, dict) else None)
    sections = data.get("sections") if isinstance(data, dict) else data
    if language not in LANGUAGES or not isinstance(sections, list) or not sections:
        raise ValueError("Expected a manifest with language tr/en/es/de and independently completed sections")
    timeline = narration.read_json(picture / "storyboard/timeline.json")
    fps = timeline["fps"]
    if SAMPLE_RATE % fps != 0:
        raise ValueError(f"Picture FPS does not align to 48 kHz: {fps}")
    approved = {}
    for shot in timeline["shots"]:
        if shot["sectionId"] != "outro":
            default = (shot["startFrame"], shot["endFrame"])
            approved[shot["sectionId"]] = (approved.get(shot["sectionId"], default)[0], shot["endFrame"])
    if len(sections) != len(approved) or [section["id"] for section in sections] != list(approved):
        raise ValueError("Dub sections must match the approved picture order")
    plan = []
    for section in sections:
        start, stop = approved[section["id"]]
        if section.get("startFrame", start) != start or section.get("endFrame", stop) != stop:
            raise ValueError(f"Frame clock mismatch in {section['id']}")
        raw = Path(section["path"])
        source = (raw if raw.is_absolute() else manifest.parent / raw).resolve(strict=True)
        if not source.is_file() or not section["text"].strip():
            raise ValueError(f"Missing original voice stem or approved text for {section['id']}")
        plan.append({**section, "path": source, "startFrame": start, "endFrame": stop})
    return language, plan, timeline


def decode(source, out):
    checked_ffmpeg(["-y", "-i", str(source), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
                    "-c:a", "pcm_s24le", str(out)])
    with wave.open(str(out), "rb") as stream:
        return stream.readframes(stream.getnframes())


def wave_file(path, frames):
    with wave.open(str(path), "wb") as stream:
        stream.setparams((1, WIDTH, SAMPLE_RATE, 0, "NONE", "not compressed"))
        stream.writeframes(frames)


def pcm_samples(blob):
    import numpy as np

    source = np.frombuffer(blob, dtype=np.uint8).reshape(-1, WIDTH).astype(np.int32)
    combined = source[:, 0] | (source[:, 1] << 8) | (source[:, 2] << 16)
    return (combined ^ (1 << 23)) - (1 << 23)


def quiet_edges(blob, required, native):
    # Keep every audible sample. Only very low noise outside the independently measured speech may move.
    samples = pcm_samples(blob)
    import numpy as np

    active = np.flatnonzero(np.abs(samples) > 2 ** 23 * 10 ** (-68 / 20))
    if not len(active):
        raise ValueError("Narration stem contains no audible speech")
    margin = round(.08 * SAMPLE_RATE)
    start = min(int(active[0]), round(native[0]["start"] * SAMPLE_RATE)) - margin
    stop = max(int(active[-1]) + 1, round(native[-1]["end"] * SAMPLE_RATE)) + margin
    tail = max(0, len(samples) - stop)
    excess = max(0, len(samples) - required)
    trim_end = min(tail, excess)
    trim_start = min(max(0, start), excess - trim_end)
    if excess > trim_start + trim_end:
        raise ValueError(f"Stem is {excess / SAMPLE_RATE:.3f}s over its picture window and only "
                         f"{(tail + max(0, start)) / SAMPLE_RATE:.3f}s of edge silence is available")
    return trim_start, len(samples) - trim_end


def normalize_text(text):
    return narration.normalized(text)


def text_fit(expected, observed):
    return SequenceMatcher(None, normalize_text(expected), normalize_text(observed), autojunk=False).ratio()


def match_name(words, phrase):
    name = normalize_text(phrase)
    candidates = []
    for i in range(len(words)):
        for run in (1, 2, 3):
            if i + run > len(words):
                continue
            token = normalize_text("".join(word["word"] for word in words[i:i + run]))
            fit = 1 if token in PLACE_ALIASES.get(name, ()) else SequenceMatcher(None, name, token, autojunk=False).ratio()
            if fit >= .78:
                candidates.append((fit, -abs(run - len(phrase.split())), -i, words[i]))
    return max(candidates, default=(0, 0, 0, None), key=lambda item: item[:3])[-1]


def relevant_anchors(timeline, section, language):
    configured = section.get("anchors")
    if configured is not None:
        return configured
    shots = [shot for shot in timeline["shots"] if shot["sectionId"] == section["id"]]
    if section["id"] == "vice-city":
        return [{"phrase": item["label"], "targetFrame": item["frame"]} for shot in shots
                if shot.get("card") for item in shot["card"]["items"]]
    phrases = {
        "grassrivers": {
            "en": {"grassrivers-03": "alligators", "grassrivers-04": "police chase"},
            "es": {"grassrivers-03": "aligátores", "grassrivers-04": "persecución policial"},
            "de": {"grassrivers-03": "Alligatoren", "grassrivers-04": "Polizeiverfolgung"},
        },
        "limits": {
            "en": {"leonida-keys-07": "underwater", "mount-kalaga-05": "woods"},
            "es": {"leonida-keys-07": "bajo el mar", "mount-kalaga-05": "dentro del bosque"},
            "de": {"leonida-keys-07": "unter Wasser", "mount-kalaga-05": "im Wald"},
        },
    }.get(section["id"], {}).get(language, {})
    return [{"phrase": phrases[shot["assetId"]], "targetFrame": shot["startFrame"]} for shot in shots
            if shot["assetId"] in phrases]


def place(blob, words, section, anchors, fps):
    tick = SAMPLE_RATE // fps
    window_start = section["startFrame"] * tick
    window_size = (section["endFrame"] - section["startFrame"]) * tick
    keep_start, keep_stop = quiet_edges(blob, window_size, words)
    clip_size = keep_stop - keep_start
    spare = window_size - clip_size
    names = [(item, match_name(words, item["phrase"])) for item in anchors]
    found = [(item, word) for item, word in names if word]
    # Start the narrator on the next region. A brief onset offset gives the new shot room.
    delay = min(round(.07 * SAMPLE_RATE), spare)
    insertions = []
    pcm = pcm_samples(blob) if found else None
    previous_anchor = keep_start
    used_gaps = set()
    hold_limit = section.get("maximumQuietHolds", len(words))
    if not isinstance(hold_limit, int) or hold_limit < 0:
        raise ValueError("maximumQuietHolds must be a nonnegative whole number")
    for item, word in found:
        mark = round(word["start"] * SAMPLE_RATE)
        drift = item["targetFrame"] * tick - (window_start + delay + mark - keep_start +
                                                sum(hold for at, hold in insertions if at <= mark))
        # Any hold here is at a quiet, independently timed clause gap. No voice samples are removed.
        choices = []
        for first, next_word in zip(words, words[1:]):
            low, high = round(first["end"] * SAMPLE_RATE), round(next_word["start"] * SAMPLE_RATE)
            if low < previous_anchor or high > mark or high - low < round(.11 * SAMPLE_RATE):
                continue
            middle = (low + high) // 2
            margin = round(.018 * SAMPLE_RATE)
            quiet = pcm[middle - margin:middle + margin]
            if middle not in used_gaps and len(quiet) and max(abs(quiet)) < 2 ** 23 * 10 ** (-55 / 20):
                punctuation = bool(re.search(r"[.!?;:]$", first["word"]))
                choices.append((punctuation, high - low, middle))
        for punctuation, gap, middle in sorted(choices, reverse=True):
            if drift <= round(.30 * SAMPLE_RATE) or spare <= delay or len(insertions) >= hold_limit:
                break
            amount = min(drift - round(.10 * SAMPLE_RATE), spare - delay, gap * 2,
                         round((.85 if punctuation else .45) * SAMPLE_RATE))
            if amount > 0:
                insertions.append((middle, amount))
                spare -= amount
                drift -= amount
                used_gaps.add(middle)
        previous_anchor = mark
    insertions.sort()
    offset = window_start + delay
    parts = []
    cursor = keep_start
    for at, hold in insertions:
        parts.extend((blob[cursor * WIDTH:at * WIDTH], b"\0" * (hold * WIDTH)))
        cursor = at
    parts.append(blob[cursor * WIDTH:keep_stop * WIDTH])

    def absolute(local):
        sample = round(local * SAMPLE_RATE)
        held = sum(hold for at, hold in insertions if at <= sample)
        return (offset + sample - keep_start + held) / SAMPLE_RATE

    mapping = [{"word": item["word"], "start": max(offset / SAMPLE_RATE, absolute(item["start"])),
                "end": absolute(item["end"]), "matched": True} for item in words]
    end_sample = offset + sum(len(part) for part in parts) // WIDTH
    if end_sample > window_start + window_size:
        raise ValueError(f"Aligned {section['id']} exceeds its picture window")
    names = [{"phrase": item["phrase"], "targetSeconds": item["targetFrame"] / fps,
              "sourceWord": word["word"] if word else None,
              "placedSeconds": absolute(word["start"]) if word else None}
             for item, word in names]
    return offset, b"".join(parts), mapping, {
        "startSample": offset, "endSample": end_sample,
        "edgeSilenceRemoved": [keep_start, len(blob) // WIDTH - keep_stop],
        "quietHolds": [{"sourceSample": position, "addedSamples": length} for position, length in insertions],
        "anchors": names,
    }


def transcribe(model, audio, language, duration, output, clip_end=None):
    audio_hash = narration.sha256(audio)
    if output.exists():
        cached = narration.read_json(output)
        evidence = cached.get("_provenance", {})
        if (evidence.get("input_sha256"), evidence.get("language"), evidence.get("model"),
                evidence.get("speech_analysis_end")) == (audio_hash, language, "medium", clip_end):
            return cached
    options = {"clip_timestamps": [0.0, clip_end]} if clip_end is not None else {}
    raw = model.transcribe(str(audio), language=language, task="transcribe", word_timestamps=True,
                           temperature=0, verbose=None, fp16=False, condition_on_previous_text=False, **options)
    raw["_provenance"] = {
        "model": "medium", "language": language, "word_timestamps": True,
        "implementation": "openai-whisper", "input_sha256": audio_hash, "duration": duration,
        "speech_analysis_end": clip_end,
    }
    output.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return raw


def canonical_spelling(expected, native):
    canonical = expected.split()
    output = [word.copy() for word in native]
    sequence = SequenceMatcher(None, [normalize_text(word) for word in canonical],
                               [normalize_text(word["word"]) for word in output], autojunk=False)
    for tag, first, stop, start, end in sequence.get_opcodes():
        if tag == "equal":
            for line, word in zip(canonical[first:stop], output[start:end], strict=True):
                word["word"] = line
        elif tag == "replace" and first < stop and start < end:
            official = " ".join(canonical[first:stop])
            expected_place = normalize_text(official)
            native_place = normalize_text("".join(word["word"] for word in output[start:end]))
            if native_place in PLACE_ALIASES.get(expected_place, ()):
                output[start].update(word=official, end=output[end - 1]["end"])
                for word in output[start + 1:end]:
                    word["word"] = ""
    return [word for word in output if word["word"]]


def produce(args):
    import torch
    import whisper

    language, sections, timeline = read_plan(args.manifest, args.picture, args.language)
    work = args.output / "_work" / f"dub-{language}"
    work.mkdir(parents=True, exist_ok=True)
    if not (args.cache / "medium.pt").is_file():
        raise FileNotFoundError("Pinned Whisper medium cache is unavailable")
    destination = args.output / "02_audio" / language
    captions_path = args.output / "04_captions" / f"captions-{language}.srt"
    outputs = (destination / f"youtube-dub-{language}.wav", destination / f"youtube-dub-{language}.mp3",
               destination / f"whisper-{language}.json", destination / "dub-qa.json", captions_path)
    if any(file.exists() for file in outputs):
        raise FileExistsError("A finalized dub already exists")
    torch.set_num_threads(6)
    model = whisper.load_model("medium", device="cpu", download_root=str(args.cache))
    full_duration = timeline["totalFrames"] / timeline["fps"]
    track = bytearray(round(full_duration * SAMPLE_RATE) * WIDTH)
    fps = timeline["fps"]
    placed = []
    for section in sections:
        identifier = section["id"]
        print(f"{language}: measuring {identifier}", file=sys.stderr, flush=True)
        original = section["path"]
        voice = work / f"{identifier}.wav"
        pcm = decode(original, voice)
        duration = len(pcm) / SAMPLE_RATE / WIDTH
        stage = work / f"{identifier}-whisper.json"
        raw = transcribe(model, voice, language, duration, stage)
        words = narration.native_words(raw, duration)
        rate = text_fit(section["text"], " ".join(word["word"] for word in words))
        if rate < .78:
            raise ValueError(f"Low spoken-script match for {language}/{identifier}: {rate:.3f}. Review {stage}")
        try:
            offset, audio, mapping, decision = place(pcm, words, section, relevant_anchors(timeline, section, language), fps)
        except ValueError as error:
            raise ValueError(f"{language}/{identifier}: {error}") from error
        buffer_at = offset * WIDTH
        track[buffer_at:buffer_at + len(audio)] = audio
        placed.append({
            "id": identifier, "name": original.name, "originalSha256": narration.sha256(original),
            "sourceSeconds": duration, "scriptFit": rate, "startFrame": section["startFrame"],
            "endFrame": section["endFrame"], "words": mapping, **decision,
        })

    voice = work / "placed-narration.wav"
    wave_file(voice, track)
    plan_path = work / "placement.json"
    plan_path.write_text(json.dumps({
        "language": language, "picture": str(args.picture), "narration": str(voice),
        "manifestSha256": narration.sha256(args.manifest), "sections": placed,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run(["node", str(ROOT / "scripts/dub-mix.mjs"), str(plan_path)], check=True)
    mix = work / "final-mix.wav"
    print(f"{language}: running Whisper on the final mixed WAV", file=sys.stderr, flush=True)
    speech_end = (timeline["totalFrames"] - timeline["pacing"]["outroFrames"]) / fps
    raw_path = work / f"final-whisper-{language}.json"
    raw = transcribe(model, mix, language, full_duration, raw_path, speech_end)
    native = narration.native_words(raw, full_duration)
    last_spoken = max(section["words"][-1]["end"] for section in placed)
    native = [word for word in native if word["start"] <= last_spoken + .10 and word["end"] <= speech_end + .05]
    expected = " ".join(section["text"] for section in sections)
    final_fit = text_fit(expected, " ".join(word["word"] for word in native))
    if final_fit < .86:
        raise ValueError(f"Final dub Whisper match is {final_fit:.3f}; review {raw_path}")
    srt, cues = narration.captions(canonical_spelling(expected, native))
    for section in placed:
        low, high = section["startFrame"] / fps, section["endFrame"] / fps
        visible = [word for word in native if low <= word["start"] < high]
        for marker in section["anchors"]:
            word = match_name(visible, marker["phrase"])
            marker["finalWhisperSeconds"] = word["start"] if word else None
            marker["finalVisualOffsetSeconds"] = word["start"] - marker["targetSeconds"] if word else None
    qa = {
        "language": language, "status": "TECHNICAL_CHECKED", "listening": "PENDING_HUMAN_REVIEW",
        "pictureFrames": timeline["totalFrames"], "pictureFps": fps, "pictureSeconds": full_duration,
        "manifestSha256": narration.sha256(args.manifest), "finalWhisperInputSha256": narration.sha256(mix),
        "whisperModel": "medium", "whisperTextAgreement": final_fit, "srtCues": cues,
        "audibleTruncation": "Only measured, near-silent stem edges may be trimmed. No speech time-stretch.",
        "sections": placed, "mix": narration.read_json(work / "mix-qa.json"),
    }
    destination.mkdir(parents=True, exist_ok=True)
    captions_path.parent.mkdir(parents=True, exist_ok=True)
    (work / "delivery-qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (work / "captions.srt").write_text(srt, encoding="utf-8")
    inputs = (mix, work / "final-mix.mp3", raw_path, work / "delivery-qa.json", work / "captions.srt")
    committed = []
    try:
        for source, out in zip(inputs, outputs, strict=True):
            os.link(source, out)
            committed.append(out)
    except OSError:
        for out in committed:
            out.unlink()
        raise
    print(json.dumps({"language": language, "audio": str(outputs[0]), "mp3": str(outputs[1]),
                      "captions": str(captions_path), "finalWhisperFit": final_fit}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--language", choices=sorted(LANGUAGES))
    parser.add_argument("--picture", type=lambda arg: Path(arg).resolve(), default=V4)
    parser.add_argument("--output", type=lambda arg: Path(arg).resolve(), default=RELEASE)
    parser.add_argument("--cache", type=Path, default=BAY_REFEREE / ".cache/whisper")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    args.manifest = args.manifest.resolve()
    if args.probe:
        language, sections, timeline = read_plan(args.manifest, args.picture, args.language)
        fps = timeline["fps"]
        print(json.dumps({"language": language, "sections": [{
            "id": section["id"], "sourceSeconds": narration.probe_audio(section["path"])[0],
            "windowSeconds": (section["endFrame"] - section["startFrame"]) / fps,
        } for section in sections]}, indent=2))
        return
    if not os.environ.get("BAY_REFEREE_HEAVY_TOKEN"):
        raise RuntimeError("Run final dub assembly under scripts/heavy-job.py")
    produce(args)


if __name__ == "__main__":
    main()
