#!/usr/bin/env python3
"""Prepare the locked TR voice request, ingest its take and align real Whisper timings."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import textwrap
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
BAY_REFEREE = ROOT.parent / "bay-referee"
MODEL = "elevenlabs_v4"
SETTINGS = {"stability": 0.50, "similarity_boost": 0.75, "batch_size": 1}


def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_new(path, content):
    """Publish a complete artifact without replacing an earlier take or an active writer."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent) as temporary:
        temporary.write(content.encode("utf-8"))
        temporary.flush()
        os.link(temporary.name, path)


def write_json(path, value):
    write_new(path, json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def section_script(episode):
    path = episode / "script/script-tr.json"
    sections = read_json(path)
    if not isinstance(sections, list) or not sections:
        raise ValueError(f"{path} must contain a non-empty array of sections")
    ids = set()
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError("Every script section needs a unique id and non-empty text")
        identifier, spoken = section.get("id"), section.get("text")
        if not isinstance(identifier, str) or not identifier or identifier in ids:
            raise ValueError(f"Missing or duplicate section id: {identifier!r}")
        if not isinstance(spoken, str) or not spoken.strip():
            raise ValueError(f"Missing narration text in {identifier}")
        ids.add(identifier)
    return path, sections


def request(episode, voice_decision):
    path, sections = section_script(episode)
    decision = read_json(voice_decision)
    voice = decision["voice"]
    if (decision["provider_wrapper"], decision["model"], voice["name"], voice["voice_type"]) != (
        "Higgsfield", MODEL, "Engin", "element"
    ) or decision["settings"] != SETTINGS or not voice.get("voice_id"):
        raise ValueError("Engin voice decision does not match the locked Higgsfield Eleven v4 settings")
    spoken = "\n\n".join(section["text"].strip() for section in sections)
    if len(spoken) > 10000:
        raise ValueError("The script exceeds the Eleven v4 10,000-character dialogue limit. Plan section takes.")
    return {
        "script_sha256": sha256(path),
        "characters": len(spoken),
        "params": {
            "model": MODEL, "count": 1, "prompt": spoken,
            "dialogue": [{"text": spoken, "voice_type": voice["voice_type"], "voice_id": voice["voice_id"]}],
            **SETTINGS,
        },
    }


def probe_audio(audio):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "format=duration:stream=duration,sample_rate,channels,codec_name", "-of", "json", str(audio)],
        capture_output=True, check=True, text=True, timeout=30,
    )
    probe = json.loads(result.stdout)
    if not probe.get("streams"):
        raise ValueError(f"No audio stream in {audio}")
    stream = probe["streams"][0]
    seconds = stream.get("duration")
    if seconds in (None, "N/A"):
        seconds = probe["format"]["duration"]
    seconds = float(seconds)
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError(f"No positive measured duration in {audio}")
    return seconds, stream


def ingest(episode, source):
    section_script(episode)
    output = episode / "audio/tr/narration-tr.wav"
    if output.exists():
        raise FileExistsError(output)
    source_duration, source_stream = probe_audio(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as folder:
        temporary = Path(folder) / "voice.wav"
        subprocess.run([sys.executable, str(ROOT / "scripts/heavy-job.py"), "--label", "gta-ingest-tr", "--",
                        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
                        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s24le", str(temporary)],
                       check=True)
        duration, stream = probe_audio(temporary)
        if abs(source_duration - duration) > 0.10:
            raise ValueError("The converted WAV duration differs from the untouched provider source")
        os.link(temporary, output)
    return {"source": source.name, "source_sha256": sha256(source), "source_codec": source_stream["codec_name"],
            "wav": output.name, "audio_sha256": sha256(output), "duration": duration, "stream": stream}


def transcribe(episode, cache, prompt):
    # Bay Referee local_whisper.py uses the same cached medium model, CPU and original WAV hash.
    sys.path.insert(0, str(ROOT))
    from engine.runtime.heavy_job import heavy_job

    output = episode / "audio/tr/whisper-tr.json"
    if output.exists():
        raise FileExistsError(output)
    audio = episode / "audio/tr/narration-tr.wav"
    audio_hash = sha256(audio)
    duration, _ = probe_audio(audio)
    if not (cache / "medium.pt").is_file():
        raise FileNotFoundError(f"Cached Whisper medium weights missing at {cache / 'medium.pt'}")

    with heavy_job("gta-whisper-medium-tr"):
        numba_cache = (episode / "_work/numba").resolve()
        numba_cache.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("NUMBA_CACHE_DIR", str(numba_cache))
        import torch
        import whisper

        torch.set_num_threads(6)
        print("Whisper medium transcribing the final TR WAV with native word timestamps", file=sys.stderr, flush=True)
        model = whisper.load_model("medium", device="cpu", download_root=str(cache))
        raw = model.transcribe(str(audio), task="transcribe", language="tr", word_timestamps=True, fp16=False,
                               temperature=0, verbose=False, initial_prompt=prompt)
        if sha256(audio) != audio_hash:
            raise ValueError("The WAV changed while Whisper was running")
        raw["_provenance"] = {
            "model": "medium", "language": "tr", "word_timestamps": True, "device": "cpu",
            "implementation": "openai-whisper", "whisper_version": whisper.__version__,
            "audio_sha256": audio_hash, "duration": duration, "initial_prompt": prompt,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        write_json(output, raw)
    return {"path": str(output), "duration": duration, "segments": len(raw["segments"])}


def normalized(word):
    folded = unicodedata.normalize("NFKD", word.casefold()).replace("ı", "i")
    return "".join(character for character in folded if character.isalnum())


def native_words(raw, duration):
    words = []
    last_start = -1
    for segment in raw["segments"]:
        for word in segment["words"]:
            start, end = word["start"], word["end"]
            if not (0 <= start <= end <= duration + 0.05) or start < last_start:
                raise ValueError(f"Invalid native word timing: {word!r}")
            last_start = start
            spoken = word["word"].strip()
            if not spoken:
                continue
            # Whisper can split Turkish proper-name suffixes into standalone tokens (Takım + 'ın).
            if words and (re.fullmatch(r"[’'][^\W\d_]+[.!?,;:…]?", spoken) or re.fullmatch(r"[.!?,;:…]+", spoken)):
                words[-1]["word"] += spoken
                words[-1]["end"] = min(max(words[-1]["end"], end), duration)
            else:
                words.append({"word": spoken, "start": min(start, duration), "end": min(end, duration)})
    if not words:
        raise ValueError("Whisper returned no timed TR words")
    return words


def srt_time(seconds):
    milliseconds = round(seconds * 1000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    hours, minutes = divmod(minutes, 60)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def caption_lines(words):
    return textwrap.wrap(" ".join(word["word"] for word in words), width=42,
                         break_long_words=False, break_on_hyphens=False)


def captions(words):
    cues, chunk = [], []
    for word in words:
        if not word["word"]:
            continue
        proposed = [*chunk, word]
        if chunk and (len(caption_lines(proposed)) > 2 or word["end"] - chunk[0]["start"] > 5.5
                      or word["start"] - chunk[-1]["end"] > 0.72):
            cues.append(chunk)
            chunk = []
        chunk.append(word)
        if len(chunk) >= 3 and re.search(r"[.!?…][’'\"”]?$", word["word"]):
            cues.append(chunk)
            chunk = []
    if chunk:
        cues.append(chunk)
    entries = []
    for index, cue in enumerate(cues):
        start = cue[0]["start"]
        next_cue = cues[index + 1] if index + 1 < len(cues) else None
        end = min(cue[-1]["end"], next_cue[0]["start"]) if next_cue else cue[-1]["end"]
        if end <= start:
            raise ValueError("A subtitle cue has no non-overlapping spoken time range")
        entries.append(f"{index + 1}\n{srt_time(start)} --> {srt_time(end)}\n" + "\n".join(caption_lines(cue)))
    return "\n\n".join(entries) + "\n", len(entries)


def reviewed_corrections(path, script_hash, raw_hash):
    if path is None:
        return {}
    review = read_json(path)
    if (review.get("script_sha256"), review.get("whisper_sha256")) != (script_hash, raw_hash):
        raise ValueError("Spelling review is for a different canonical script or Whisper run")
    return {tuple(correction["canonical_indices"]): correction for correction in review["corrections"]}


def apply_review(correction, canonical, recognized, matches):
    if not canonical or not recognized or not correction.get("note", "").strip():
        raise ValueError("Reviewed spelling changes require both spoken evidence and an editorial note")
    original = [word["word"] for word in recognized]
    if correction["asr_words"] != original:
        raise ValueError("Spelling review no longer matches the native words")
    if len(canonical) == len(recognized):
        for word, asr, match in zip(canonical, recognized, matches, strict=True):
            match.update(start=asr["start"], end=asr["end"], matched=True, asr_word=asr["word"],
                         timing="reviewed_native_word")
            asr["word"] = word
    else:
        start, end = recognized[0]["start"], recognized[-1]["end"]
        for match in matches:
            match.update(start=start, end=end, matched=True, asr_word=" ".join(original),
                         timing="reviewed_native_phrase")
        recognized[0].update(word=" ".join(canonical), end=end)
        for asr in recognized[1:]:
            asr["word"] = ""


def align(episode, review_path=None, preview=False):
    path, sections = section_script(episode)
    canonical = [word for section in sections for word in section["text"].split()]
    audio = episode / "audio/tr/narration-tr.wav"
    raw_path = episode / "audio/tr/whisper-tr.json"
    word_map = episode / "audio/tr/word-map-tr.json"
    srt_path = episode / "captions/tr.srt"
    for output in (word_map, srt_path):
        if not preview and output.exists():
            raise FileExistsError(output)
    raw = read_json(raw_path)
    provenance = raw["_provenance"]
    audio_hash = sha256(audio)
    if (raw["language"] != "tr" or provenance["model"] != "medium" or not provenance["word_timestamps"]
            or audio_hash != provenance["audio_sha256"]):
        raise ValueError("Whisper evidence does not match the exact TR medium narration WAV")
    script_hash, raw_hash = sha256(path), sha256(raw_path)
    corrections = reviewed_corrections(review_path, script_hash, raw_hash)
    recognized = native_words(raw, provenance["duration"])
    matches = [{"word": word, "start": None, "end": None, "matched": False} for word in canonical]
    differences = []
    reviewed = []
    sequence = SequenceMatcher(None, [normalized(word) for word in canonical],
                               [normalized(word["word"]) for word in recognized], autojunk=False)
    for operation, start, end, native_start, native_end in sequence.get_opcodes():
        if operation == "equal":
            for script_index, asr_index in zip(range(start, end), range(native_start, native_end), strict=True):
                asr = recognized[asr_index]
                matches[script_index].update(start=asr["start"], end=asr["end"], matched=True, asr_word=asr["word"])
                asr["word"] = canonical[script_index]
        else:
            asr = recognized[native_start:native_end]
            difference = {"operation": operation, "canonical_indices": [start, end],
                          "canonical": canonical[start:end], "asr": [word.copy() for word in asr]}
            correction = corrections.pop((start, end), None)
            if correction:
                apply_review(correction, canonical[start:end], asr, matches[start:end])
                reviewed.append({**difference, "note": correction["note"]})
            else:
                differences.append(difference)
    if corrections:
        raise ValueError("Spelling review includes entries that do not match any current Whisper discrepancy")
    section_map = []
    cursor = 0
    for section in sections:
        end = cursor + len(section["text"].split())
        words = matches[cursor:end]
        mapped = [word for word in words if word["matched"]]
        section_map.append({"id": section["id"], "start": mapped[0]["start"] if mapped else None,
                            "end": mapped[-1]["end"] if mapped else None,
                            "coverage": len(mapped) / len(words), "words": words})
        cursor = end
    srt, count = captions(recognized)
    result = {
        "status": "REVIEW_NEEDED" if differences else "PASS", "audio_sha256": audio_hash,
        "script_sha256": script_hash, "whisper_sha256": raw_hash, "model": "medium", "language": "tr",
        "duration": provenance["duration"], "method": "Normalized exact token alignment to native timestamps",
        "coverage": sum(word["matched"] for word in matches) / len(matches), "sections": section_map,
        "differences": differences, "reviewed_spelling": reviewed, "subtitle_cues": count,
    }
    if preview:
        return {key: result[key] for key in ("status", "coverage", "subtitle_cues", "duration",
                                              "script_sha256", "whisper_sha256", "differences")}
    write_new(srt_path, srt)
    write_json(word_map, result)
    return {key: result[key] for key in ("status", "coverage", "subtitle_cues", "duration")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    prepare = commands.add_parser("request", help="emit the private connector request without submitting it")
    prepare.add_argument("episode", type=Path)
    prepare.add_argument("--voice-decision", type=Path, default=BAY_REFEREE / "voice/decision.json")
    convert = commands.add_parser("ingest", help="convert untouched completed provider bytes to the authoritative WAV")
    convert.add_argument("episode", type=Path)
    convert.add_argument("source", type=Path)
    asr = commands.add_parser("transcribe", help="run local Whisper medium on the final WAV")
    asr.add_argument("episode", type=Path)
    asr.add_argument("--cache", type=Path, default=BAY_REFEREE / ".cache/whisper")
    asr.add_argument("--prompt", help="pronunciation vocabulary for Whisper, without source sentences")
    alignment = commands.add_parser("align", help="create measured section-level word timing and Turkish SRT")
    alignment.add_argument("episode", type=Path)
    alignment.add_argument("--preview", action="store_true", help="show discrepancies without writing outputs")
    alignment.add_argument("--review", type=Path, help="apply documented spelling changes at the measured native times")
    args = parser.parse_args()
    try:
        if args.operation == "request":
            result = request(args.episode, args.voice_decision)
        elif args.operation == "ingest":
            result = ingest(args.episode, args.source)
        elif args.operation == "transcribe":
            result = transcribe(args.episode, args.cache, args.prompt)
        else:
            result = align(args.episode, args.review, args.preview)
    except (OSError, RuntimeError, ValueError, TypeError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(1, f"GTA AUDIO: {error}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
