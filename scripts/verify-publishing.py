#!/usr/bin/env python3
"""Measure and inventory the achieved outputs of a local VALEA publishing package."""

import argparse
from hashlib import file_digest, sha256 as sha256_bytes
import json
import math
from pathlib import Path
import re
import struct
from subprocess import check_output
import wave

LANGUAGES = ("tr", "en", "es", "de")
ORIGINAL_LANGUAGE = "en"
ALTERNATE_LANGUAGES = ("tr", "es", "de")
LANGUAGE_TAG = "eng"
TIMESTAMP = r"(\d{2}):(\d{2}):(\d{2}),(\d{3})"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def probe(path):
    data = json.loads(check_output(["ffprobe", "-v", "error", "-show_streams",
                                    "-show_format", "-of", "json", str(path)]))
    summary = ("codec_type codec_name duration start_time width height avg_frame_rate nb_frames "
               "sample_rate channels")
    streams = []
    for stream in data["streams"]:
        fields = {key: stream[key] for key in summary.split() if key in stream}
        tag = stream.get("tags", {}).get("language")
        if tag is not None:
            fields["language"] = tag
        streams.append(fields)
    return {"duration": float(data["format"]["duration"]), "streams": streams}


def check_srt(path, duration):
    lines = path.read_text(encoding="utf-8-sig").strip()
    previous = 0.0
    start = None
    lengths = []
    for number, block in enumerate(re.split(r"\n\s*\n", lines), 1):
        key, times, text = block.split("\n", 2)
        match = re.fullmatch(TIMESTAMP + " --> " + TIMESTAMP, times)
        assert key == str(number) and match and text.strip(), path
        values = list(map(int, match.groups()))
        begin, end = [sum(value * weight for value, weight in
                          zip(values[index:index + 4], (3600, 60, 1, .001), strict=True))
                      for index in (0, 4)]
        assert previous - 0.0001 <= begin < end <= duration + 0.001, (path, number, times)
        previous = end
        start = begin if start is None else start
        lengths.extend(map(len, text.splitlines()))
    return {"cueCount": number, "firstCueStart": start, "lastCueEnd": previous,
            "maxLineCharacters": max(lengths)}


def png_size(path):
    with path.open("rb") as stream:
        header = stream.read(26)
    assert header.startswith(b"\x89PNG\r\n\x1a\n") and header[12:16] == b"IHDR", path
    return struct.unpack(">II", header[16:24])


def channel_assets(repo):
    folder = repo / "channel/valea"
    assets = {
        "valea-youtube-profile-1024.png": (1024, 1024),
        "valea-youtube-banner-2560x1440.png": (2560, 1440),
        "valea-youtube-watermark-256.png": (256, 256),
    }
    records = []
    for filename, dimensions in assets.items():
        path = folder / filename
        assert png_size(path) == dimensions, path
        records.append({"pathFromRepo": path.relative_to(repo).as_posix(),
                        "dimensions": list(dimensions), "sha256": sha256(path),
                        "rights": "REVIEW" if "banner" in filename else "VALEA_ORIGINAL"})
    return records


def outro_pcm_digest(path, start_frame, fps):
    with wave.open(str(path)) as stream:
        start = round(start_frame * stream.getframerate() / fps)
        stream.setpos(start)
        data = stream.readframes(stream.getnframes() - start)
    return sha256_bytes(data).hexdigest()


def verify_sources(repo, package, provenance):
    verified = {}
    archived = {}
    revision = repo / provenance["sourceRevision"]
    for item in provenance["files"]:
        source = revision / item["source"]
        assert sha256(source) == item["sha256"], source
        if "path" in item:
            path = package / item["path"]
            assert sha256(path) == item["sha256"], path
            verified[item["path"]] = item["sha256"]
        else:
            assert item["role"] not in archived, item
            archived[item["role"]] = item
    return verified, archived


def video_packet_digest(path):
    packets = check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
                            "-show_packets", "-show_data_hash", "SHA256", "-show_entries",
                            "packet=pts_time,dts_time,duration_time,size,data_hash",
                            "-of", "compact=p=0:nk=0", str(path)])
    return sha256_bytes(packets).hexdigest(), len(packets.splitlines())


def verify_upload(package, episode, locked, duration):
    expected = episode["picture"]
    relative = f"03_video/{episode['slug']}-valea-en.mp4"
    assert expected["path"] == relative, expected
    assert expected["source"] == locked["source"], expected
    folder = package / "03_video"
    upload = package / relative
    files = {item for item in folder.iterdir() if not item.name.startswith(".")}
    assert files == {upload} and upload.is_file(), files

    measured = probe(upload)
    streams = measured["streams"]
    assert sorted(s["codec_type"] for s in streams) == ["audio", "video"], streams
    video = next(s for s in streams if s["codec_type"] == "video")
    audio = next(s for s in streams if s["codec_type"] == "audio")
    assert video["codec_name"] == "h264", video
    assert (video["width"], video["height"]) == (expected["width"], expected["height"]) == (1920, 1080), video
    assert int(video["nb_frames"]) == expected["frames"], video
    assert video["avg_frame_rate"] == f'{expected["fps"]}/1', video
    assert (audio["codec_name"], audio["language"], audio["sample_rate"], audio["channels"]) == (
        "aac", LANGUAGE_TAG, "48000", 2
    ), audio
    for stream in streams:
        assert abs(float(stream["start_time"])) <= 0.001, stream
        assert abs(float(stream["duration"]) - duration) <= 0.001, stream
    assert abs(measured["duration"] - duration) <= 0.001, measured

    mix = package / "02_audio/en/youtube-dub-en.wav"
    receipt = read_json(package / "08_delivery/upload-video-qa.json")
    assert receipt["path"] == relative and receipt["sha256"] == sha256(upload), receipt
    assert receipt["sourcePictureSha256"] == locked["sha256"], receipt
    assert receipt["englishMixSha256"] == sha256(mix), receipt
    digest, count = video_packet_digest(upload)
    assert receipt["videoPacketSha256"] == digest, receipt
    assert receipt["videoPacketCount"] == count == expected["frames"], receipt
    assert receipt["audioLanguage"] == audio["language"], receipt
    assert abs(receipt["duration"] - duration) <= 0.001, receipt
    loudness = receipt["measurements"]
    assert math.isfinite(loudness["integratedLufs"]), loudness
    assert math.isfinite(loudness["truePeakDbtp"]) and loudness["truePeakDbtp"] <= -1, loudness
    return {upload.name: measured}, receipt


def verify_metadata(package, language):
    social = package / "06_social"
    metadata = {kind: (social / f"{kind}-{language}.txt").read_text(encoding="utf-8").strip()
                for kind in ("title", "description", "hashtags")}
    assert all(metadata.values()), language
    assert not re.search(r"https?://|\bwww\.", metadata["description"], re.IGNORECASE), language
    hashtags = metadata["hashtags"].split()
    assert all(re.fullmatch(r"#\w+", value) for value in hashtags), (language, hashtags)
    embedded = set(re.findall(r"(?<!\w)#\w+", metadata["description"]))
    assert set(hashtags) == embedded, (language, hashtags)


def verify_youtube_tags(package):
    social = package / "06_social"
    path = social / "youtube-tags.txt"
    assert set(social.glob("youtube-tags*")) == {path} and not list(social.glob("tags-*.txt")), social
    raw = path.read_text(encoding="utf-8").strip()
    assert "\n" not in raw, path
    tags = [part.strip() for part in raw.split(",")]
    assert all(tag and not tag.startswith("#") for tag in tags), path
    assert len(set(tag.casefold() for tag in tags)) == len(tags), path
    # YouTube counts separators and implicit quotation marks around phrases.
    characters = len(tags) - 1 + sum(len(tag) + 2 * (" " in tag) for tag in tags)
    assert characters <= 500, (path, characters)
    return {"path": path.relative_to(package).as_posix(), "count": len(tags), "characters": characters}


def verify_covers(package):
    folder = package / "05_cover"
    covers = {language: folder / f"thumbnail-{language}-1280x720.png" for language in LANGUAGES}
    assert {file for file in folder.iterdir() if not file.name.startswith(".")} == set(covers.values()), folder
    for path in covers.values():
        assert png_size(path) == (1280, 720), path
    return {language: path.relative_to(package).as_posix() for language, path in covers.items()}


def publish_report(package):
    repo = Path(__file__).resolve().parents[1]
    delivery = package / "08_delivery"
    episode = read_json(package / "00_brief/episode.json")
    provenance = read_json(package / "07_assets/provenance.json")
    same, archives = verify_sources(repo, package, provenance)
    assert episode["masterLanguage"] == episode["originalAudioLanguage"] == ORIGINAL_LANGUAGE, episode
    assert tuple(episode["alternateAudioLanguages"]) == ALTERNATE_LANGUAGES, episode
    expected = episode["picture"]
    duration = expected["frames"] / expected["fps"]
    video, upload_receipt = verify_upload(package, episode, archives["locked-picture"], duration)

    covers = verify_covers(package)
    youtube_tags = verify_youtube_tags(package)
    timeline = read_json(package / "07_assets/timeline.json")
    outro = timeline["audio"]["outro"]["startFrame"]
    outro_digest = outro_pcm_digest(package / "02_audio/en/youtube-dub-en.wav", outro, expected["fps"])
    reports = {}
    for language in LANGUAGES:
        caption = package / "04_captions" / f"captions-{language}.srt"
        verify_metadata(package, language)
        stems = package / "02_audio" / language
        wanted = {ext: stems / f"youtube-dub-{language}.{ext}" for ext in ("wav", "mp3")}
        whisper = stems / f"whisper-{language}.json"
        mix_file = stems / "dub-qa.json"
        reused_turkish_mix = language == "tr" and not mix_file.is_file()
        if reused_turkish_mix:
            mix_file = stems / "audio-mix-validation.json"
        missing = [str(p.relative_to(package)) for p in (caption, *wanted.values(), whisper, mix_file)
                   if not p.is_file()]
        entry = {"status": "INCOMPLETE" if missing else "READY_TECHNICAL",
                 "missing": missing, "coverPixels": [1280, 720], "cover": covers[language],
                 "audioRole": "original" if language == ORIGINAL_LANGUAGE else "alternate",
                 "hardwareListening": "PENDING_HUMAN_REVIEW", "audio": {}, "srt": None}
        for ext, file in wanted.items():
            if file.is_file():
                track = probe(file)
                assert len(track["streams"]) == 1, track
                audio = track["streams"][0]
                assert audio["codec_type"] == "audio" and audio["codec_name"] == (
                    "mp3" if ext == "mp3" else "pcm_s24le"), audio
                assert audio["channels"] == 2 and audio["sample_rate"] == "48000", audio
                assert abs(track["duration"] - duration) <= .05, track
                entry["audio"][ext] = track
        if caption.is_file():
            entry["srt"] = check_srt(caption, duration)
        if wanted["wav"].is_file():
            digest = outro_pcm_digest(wanted["wav"], outro, expected["fps"])
            assert digest == outro_digest, (language, "The closing PCM differs from the original mix.")
            entry["outroPcmSha256"] = digest
        live_measurements = stems / "publishing-audio-qa.json"
        if live_measurements.is_file():
            measured = read_json(live_measurements)
            assert measured["wavSamples"] == measured["decodedMp3Samples"] == round(
                duration * measured["sampleRate"]
            ), (language, measured)
            for ext in ("wav", "mp3"):
                assert measured[f"{ext}Sha256"] == sha256(wanted[ext]), (language, ext)
            entry["decodedSamples"] = measured["decodedMp3Samples"]
        if mix_file.is_file() and reused_turkish_mix:
            details = read_json(mix_file)
            entry["loudness"] = {"archivedV4Aac": details["final"], "archivedV4SourcePcm": details["pcm"]}
            entry["whisperMode"] = "Approved V4 correction using preserved Turkish Whisper medium"
            entry["programSource"] = "Exact V4 PCM pre-master. MP3 encoded separately."
            if live_measurements.is_file():
                entry["loudness"].update(measured["measurements"])
        elif mix_file.is_file():
            details = read_json(mix_file)
            assert details["whisperModel"] == "medium"
            assert details["finalWhisperInputSha256"] == sha256(wanted["wav"])
            for ext in ("wav", "mp3"):
                assert details["mix"][ext]["measurements"]["truePeakDbtp"] <= -1, language
            entry["loudness"] = {ext: details["mix"][ext]["measurements"] for ext in ("wav", "mp3")}
            entry["whisperAgreement"] = details["whisperTextAgreement"]
            entry["mixReport"] = str(mix_file.relative_to(package))
            entry["programSource"] = "Engin narration plus the frozen picture's music and effects."
        reports[language] = entry

    status = "READY_TECHNICAL" if all(r["status"] == "READY_TECHNICAL" for r in reports.values()) else "INCOMPLETE"
    language_roles = {"originalAudioLanguage": ORIGINAL_LANGUAGE,
                      "alternateAudioLanguages": list(ALTERNATE_LANGUAGES),
                      "defaultMetadataLanguage": ORIGINAL_LANGUAGE,
                      "defaultCoverLanguage": ORIGINAL_LANGUAGE}
    qa = {"status": status, "rights": provenance["sourceStatus"], "upload": "NOT_PERFORMED",
          "pictureDuration": duration, "video": video, "sourceCopyHashesVerified": len(same),
          "archiveSourceHashesVerified": len(archives), "uploadVideo": upload_receipt,
          "outroPcmStartFrame": outro, "outroPcmSha256": outro_digest,
          "defaultThumbnail": covers[ORIGINAL_LANGUAGE], "youtubeTags": youtube_tags,
          **language_roles, "languages": reports,
          "listenerNotes": "No human pronunciation or 1× hardware listening performed."}
    files = []
    for file in sorted(package.rglob("*")):
        rel = file.relative_to(package)
        if rel.parts[0] in {"_work", "08_delivery"} or not file.is_file():
            continue
        files.append({"path": rel.as_posix(), "bytes": file.stat().st_size, "sha256": sha256(file)})
    manifest = {"schemaVersion": 1, "channel": episode["channel"], "slug": episode["slug"],
                "status": status, "rights": provenance["sourceStatus"], "pictureDuration": duration,
                "masterLanguage": ORIGINAL_LANGUAGE, **language_roles,
                "uploadVideo": expected["path"], "uploadVideoQa": "08_delivery/upload-video-qa.json",
                "covers": covers, "defaultThumbnail": covers[ORIGINAL_LANGUAGE], "youtubeTags": youtube_tags["path"],
                "files": files, "qa": "08_delivery/qa.json", "inventoryScope": "Episode files in 00-07",
                "channelAssets": channel_assets(repo)}
    delivery.mkdir(exist_ok=True)
    for name, document in (("qa.json", qa), ("manifest.json", manifest)):
        output = delivery / name
        temporary = package / "_work" / f"{name}.part"
        temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)
    print(f"{status} · {len(files)} files · {duration:.3f} s · {provenance['sourceStatus']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    arguments = parser.parse_args()
    publish_report(arguments.package.resolve())
