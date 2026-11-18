#!/usr/bin/env python3
"""Restore registered Rockstar source media without changing a frozen register."""

import argparse
from contextlib import contextmanager
from hashlib import file_digest
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
from tempfile import mkstemp
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


SCRIPT_DIR = Path(__file__).resolve().parent
VALID_RIGHTS = {"APPROVED", "REVIEW"}
DIGEST_PATTERN = re.compile(r"[0-9a-f]{64}")


def sha256(path):
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def expected_hash(value, context):
    if not isinstance(value, str) or not DIGEST_PATTERN.fullmatch(value):
        raise ValueError(f"Missing or invalid SHA-256: {context}")
    return value


def https_url(value):
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        raise ValueError("The registered source must use a direct HTTPS URL without credentials.")
    return value


class HTTPSRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, https_url(newurl))


def safe_path(root, relative, base):
    path = PurePosixPath(relative)
    if path.parts[:len(base)] != base or len(path.parts) <= len(base) or ".." in path.parts:
        raise ValueError(f"Unexpected asset path: {relative}")
    local = root.joinpath(*path.parts)
    if local.resolve() != local:
        raise ValueError(f"Symlinks are not accepted for asset paths: {relative}")
    return local


@contextmanager
def temporary_file(target):
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = mkstemp(prefix=f".{target.stem}-", suffix=target.suffix, dir=target.parent)
    os.close(descriptor)
    try:
        yield Path(name)
    finally:
        Path(name).unlink(missing_ok=True)


def place(staged, target, expected):
    if sha256(staged) != expected:
        raise ValueError(f"Checksum mismatch: {target.name}")
    try:
        os.link(staged, target)
    except FileExistsError:
        if sha256(target) != expected:
            raise ValueError(f"An existing asset differs and was preserved: {target.name}") from None


def download(url, target, expected):
    opener = build_opener(HTTPSRedirect)
    request = Request(https_url(url), headers={"User-Agent": "VALEA-gta-studio/1.0"})
    with temporary_file(target) as staged:
        with opener.open(request, timeout=60) as response, staged.open("wb") as output:
            shutil.copyfileobj(response, output, 1024 * 1024)
        place(staged, target, expected)


def get_source(asset, cache, originals):
    expected = expected_hash(asset.get("original_sha256"), asset["id"])
    if expected in originals:
        return originals[expected]
    source = cache / f"{expected}.mp4"
    if source.exists():
        if source.is_symlink() or sha256(source) != expected:
            raise ValueError("The cached original differs and was preserved.")
    else:
        print(f"Downloading verified original for {asset['id']}…", flush=True)
        download(asset["original_url"], source, expected)
    originals[expected] = source
    return source


def receipt(asset, digest):
    return {
        "path": asset["path"],
        "upstreamSha256": asset["original_sha256"],
        "sha256": digest,
        "sourceStartFrame": asset["source_start_frame"],
        "sourceEndFrame": asset["source_end_frame"],
    }


def trim_clip(source, staged, asset):
    start = asset["source_start_frame"]
    end = asset["source_end_frame"]
    frames = asset["source_duration_frames"]
    width, height, fps = (asset[key] for key in ("width", "height", "fps"))
    if not all(type(value) is int for value in (start, end, frames, width, height, fps)):
        raise ValueError("The frame range, dimensions and frame rate must be integers.")
    if start < 0 or min(frames, width, height, fps) < 1 or end - start != frames:
        raise ValueError("Invalid registered video frame range.")
    if asset["source_audio"] != "omitted" or asset["source_type"] != "official_trailer_excerpt":
        raise ValueError("Only registered, silent official trailer excerpts are supported.")

    # Reproduce the saved EP01 extraction settings as closely as the current FFmpeg permits.
    bicubic_ids = {"trailer-1-leonida-dawn-clean", "trailer-1-jason-lucia-v4"}
    bicubic = asset["id"] in bicubic_ids
    quality = "17" if asset["original_title"] == "Grand Theft Auto VI Trailer 2" else "16"
    command = [
        sys.executable, str(SCRIPT_DIR / "heavy-job.py"), "--label", "gta-restore-trailer-excerpt", "--",
        "ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y",
    ]
    if not bicubic:
        command.extend(["-threads", "3"])
    scale_flags = "" if bicubic else ":flags=lanczos"
    command.extend([
        "-ss", f"{start / fps:.9f}", "-i", str(source), "-frames:v", str(frames),
        "-map", "0:v:0", "-an", "-vf", f"scale={width}:{height}{scale_flags},setsar=1",
        "-c:v", "libx264", "-threads", "15" if bicubic else "3",
        "-preset", "veryfast" if bicubic else "fast", "-crf", quality,
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(staged),
    ])
    subprocess.run(command, check=True)
    encoded = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,width,height,nb_frames,avg_frame_rate", "-of", "json", str(staged),
    ]))
    videos = [stream for stream in encoded["streams"] if stream["codec_type"] == "video"]
    if len(videos) != 1 or any(stream["codec_type"] == "audio" for stream in encoded["streams"]):
        raise ValueError("The excerpt must have one picture stream and no sound.")
    video = videos[0]
    measured = (video["width"], video["height"], int(video["nb_frames"]), video["avg_frame_rate"])
    if measured != (width, height, frames, f"{fps}/1"):
        raise ValueError(f"Unexpected dimensions or frame count: {measured}")


def save_receipts(path, records):
    with temporary_file(path) as staged:
        staged.write_text(json.dumps({"assets": sorted(records.values(), key=lambda item: item["path"])},
                                     indent=2) + "\n", encoding="utf-8")
        staged.replace(path)


def restore(arguments):
    root = arguments.revision.resolve(strict=True)
    register = root / "assets/source-register.json"
    work = safe_path(root, "_work/source-cache", ("_work",))
    receipt_path = safe_path(root, "_work/source-restore.json", ("_work",))
    records = json.loads(receipt_path.read_text(encoding="utf-8"))["assets"] if receipt_path.exists() else []
    receipts = {record["path"]: record for record in records}
    originals = {sha256(path.resolve(strict=True)): path.resolve() for path in arguments.original}
    backup = arguments.backup.resolve(strict=True) if arguments.backup else None
    assets = json.loads(register.read_text(encoding="utf-8"))["assets"]
    exact = derived = failures = 0
    for asset in assets:
        if asset["kind"] not in {"image", "video"} or asset.get("rights_status") not in VALID_RIGHTS:
            continue
        is_video = asset["kind"] == "video"
        path = asset["path"]
        is_graphic = not is_video and path.startswith("assets/graphics/")
        base = ("assets", "video" if is_video else "graphics" if is_graphic else "images")
        try:
            target = safe_path(root, path, base)
            expected = expected_hash(asset.get("sha256"), path)
            if target.exists():
                actual = sha256(target)
                if actual == expected:
                    exact += 1
                    continue
                if is_video and arguments.allow_reencoded and receipts.get(path) == receipt(asset, actual):
                    derived += 1
                    continue
                raise ValueError("An existing asset differs and was preserved.")
            if arguments.check:
                raise ValueError("Asset is missing.")
            backup_file = safe_path(backup, path, base) if backup else None
            if backup_file and backup_file.is_file():
                with temporary_file(target) as staged:
                    shutil.copyfile(backup_file, staged)
                    place(staged, target, expected)
            elif is_graphic:
                raise ValueError("A local graphic is missing. Recover it from Git or an exact revision backup.")
            elif is_video:
                source = get_source(asset, work, originals)
                with temporary_file(target) as staged:
                    trim_clip(source, staged, asset)
                    actual = sha256(staged)
                    if actual == expected:
                        place(staged, target, expected)
                    elif arguments.allow_reencoded:
                        receipts[path] = receipt(asset, actual)
                        save_receipts(receipt_path, receipts)
                        place(staged, target, actual)
                        derived += 1
                        print(f"Restored local re-encode: {path}")
                        continue
                    else:
                        raise ValueError("The local encoder produced different bytes. Import an exact backup or use --allow-reencoded for a local reconstruction.")
            else:
                download(asset["original_url"], target, expected)
            exact += 1
            print(f"Restored exact bytes: {path}")
        except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
            failures += 1
            print(f"{path}: {error}", file=sys.stderr)
    print(f"Asset check: {exact} exact, {derived} verified local re-encodes, {failures} missing or invalid.")
    return int(failures > 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision", type=Path)
    parser.add_argument("--check", action="store_true", help="Verify existing assets and use no network.")
    parser.add_argument("--backup", type=Path, help="Import exact assets from a backup of this revision.")
    parser.add_argument("--original", type=Path, action="append", default=[],
                        help="Reuse a local copy of a verified original trailer. Repeat for multiple trailers.")
    parser.add_argument("--allow-reencoded", action="store_true",
                        help="Allow matching picture ranges encoded on this computer for local reconstruction.")
    try:
        sys.exit(restore(parser.parse_args()))
    except (OSError, ValueError, KeyError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
