#!/usr/bin/env python3
"""Map completed local voice takes to the locked shot windows for dub-scenes.py."""

import argparse
import os
from pathlib import Path
import re

from narration import read_json, write_json


def section_windows(revision):
    timeline = read_json(revision / "storyboard/timeline.json")
    windows = {}
    previous = None
    for shot in timeline["shots"]:
        section = shot["sectionId"]
        if section != "outro":
            start, end = shot["startFrame"], shot["endFrame"]
            if type(start) is not int or type(end) is not int or not 0 <= start < end:
                raise ValueError(f"Invalid picture frames for {section}")
            if section in windows:
                first, last = windows[section]
                if section != previous or start != last:
                    raise ValueError(f"Noncontiguous picture window for {section}")
                start = first
            windows[section] = (start, end)
        previous = section
    if not windows:
        raise ValueError("The locked timeline has no narration windows")
    return windows


def stem_path(directory, section, manifest_dir):
    choices = [directory / f"{section}.{extension}" for extension in ("mp3", "wav")]
    stems = [candidate for candidate in choices if candidate.is_file()]
    if len(stems) != 1 or not stems[0].stat().st_size:
        raise ValueError(f"Expected one nonempty MP3 or WAV stem for {section} in {directory}")
    stem = stems[0].resolve()
    try:
        return os.path.relpath(stem, start=manifest_dir)
    except ValueError:  # On Windows, the paths can be on different volumes.
        return str(stem)


def fit_settings(row, section, start, end):
    options = {}
    if "maximumQuietHolds" in row:
        limit = row["maximumQuietHolds"]
        if type(limit) is not int or limit < 0:
            raise ValueError(f"Invalid maximumQuietHolds for {section}")
        options["maximumQuietHolds"] = limit
    if "anchors" in row:
        anchors = row["anchors"]
        if not isinstance(anchors, list) or any(
            not isinstance(anchor, dict)
            or not isinstance(anchor.get("phrase"), str) or not anchor["phrase"].strip()
            or type(anchor.get("targetFrame")) is not int or not start <= anchor["targetFrame"] < end
            for anchor in anchors
        ):
            raise ValueError(f"Invalid picture anchor for {section}")
        options["anchors"] = [
            {"phrase": anchor["phrase"], "targetFrame": anchor["targetFrame"]}
            for anchor in anchors
        ]
    return options


def build_manifest(revision, language, script, stems, output):
    windows = section_windows(revision)
    rows = read_json(script)
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise ValueError("The localized script must be an array of section objects")
    if [row.get("id") for row in rows] != list(windows):
        raise ValueError("Script section IDs must match the locked picture order")
    sections = []
    for row, (section, (start, end)) in zip(rows, windows.items(), strict=True):
        if not isinstance(section, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", section):
            raise ValueError("Each section ID must be a safe stem filename")
        spoken = row.get("text")
        if not isinstance(spoken, str) or not spoken.strip():
            raise ValueError(f"Missing approved voice text for {section}")
        if row.get("startFrame", start) != start or row.get("endFrame", end) != end:
            raise ValueError(f"Script frame clock differs from the locked picture for {section}")
        sections.append({
            "id": section,
            "text": spoken,
            "startFrame": start,
            "endFrame": end,
            "path": stem_path(stems, section, output.parent),
            **fit_settings(row, section, start, end),
        })
    return {"language": language, "sections": sections}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision", type=Path)
    parser.add_argument("language", choices=("en", "tr", "es", "de"))
    parser.add_argument("script_json", type=Path)
    parser.add_argument("stem_dir", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()
    output = args.output_json.resolve()
    try:
        manifest = build_manifest(args.revision, args.language, args.script_json, args.stem_dir, output)
        write_json(output, manifest)
    except (KeyError, OSError, TypeError, ValueError) as error:
        parser.exit(1, f"{parser.prog}: {error}\n")
    print(f"{len(manifest['sections'])} locked narration windows written to {output}")


if __name__ == "__main__":
    main()
