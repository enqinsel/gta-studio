"""One heavy production job per OS user across checkouts and Codex sessions.

The stable lock inode is NEVER unlinked. POSIX flock owns it until the final
inheriting process closes it, including after a supervisor crash. JSON is only
diagnostic metadata; a stale PID never authorizes deleting a live lock.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
from functools import wraps
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import uuid

LOCK_PATH = Path('/private/tmp' if sys.platform == 'darwin' else '/tmp') / f'bay-referee-heavy-{os.getuid()}.lock'
TOKEN_ENV = 'BAY_REFEREE_HEAVY_TOKEN'


class HeavyJobBusy(RuntimeError):
    pass


def process_table():
    result = subprocess.run(['ps', '-axo', 'uid=,pid=,ppid=,pgid=,stat=,command='], check=True, capture_output=True, text=True)
    rows = []
    for line in result.stdout.splitlines():
        parts = line.strip().split(None, 5)
        if len(parts) == 6:
            uid, pid, ppid, pgid, state, command = parts
            rows.append(dict(uid=int(uid), pid=int(pid), ppid=int(ppid), pgid=int(pgid), state=state, command=command))
    return rows


def ancestors(rows, pid=None):
    by_pid = {r['pid']: r for r in rows}
    found = set()
    pid = os.getpid() if pid is None else pid
    while pid and pid not in found:
        found.add(pid)
        pid = by_pid.get(pid, {}).get('ppid', 0)
    return found


def read_metadata(fd):
    os.lseek(fd, 0, os.SEEK_SET)
    try:
        return json.loads(os.read(fd, 16384))
    except (ValueError, UnicodeDecodeError):
        return {}


def write_metadata(fd, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    os.lseek(fd, 0, os.SEEK_SET)
    os.ftruncate(fd, 0)
    os.write(fd, data)
    os.fsync(fd)


def group_members(rows, metadata):
    group = metadata.get('child_pgid')
    return [r for r in rows if group and r['uid'] == os.getuid() and r['pgid'] == group and not r['state'].startswith('Z')]


def looks_heavy(command):
    try:
        args = shlex.split(command)
    except ValueError:
        return False
    if not args:
        return False
    executable = Path(args[0]).name.lower()
    if executable in {'ffmpeg', 'whisper', 'whisper-cli'}:
        return not any(a in {'-version', '--help', '-h', '--version'} for a in args[1:])
    if executable.startswith(('python', 'node')) or executable in {'tsx', 'bun'}:
        # Match executable/script positions, not arbitrary prose in shell commands.
        script = next((a for a in args[1:] if not a.startswith('-')), '')
        name = Path(script).name.lower()
        return (name in {'transcribe.py', 'render-smoke.mjs', 'render.mjs', 'render.py', 'renderer.mjs'}
                or bool(re.search(r'(?:whisper|transcrib)', name))
                or ('hyperframes' in script and any(a in {'render', 'snapshot', 'check', 'preview'} for a in args))) and '--validate-install' not in args
    return executable == 'hyperframes' and any(a in {'render', 'snapshot', 'check', 'preview'} for a in args)


@contextmanager
def heavy_job(label, *, lock_path=LOCK_PATH):
    """Fail closed on contention; reuse only a verifiable ancestor-owned lease."""
    flags = os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(lock_path, flags, 0o600)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1:
            raise RuntimeError(f'Unsafe heavy-job lock file: {lock_path}')
        rows = process_table()
        parent_ids = ancestors(rows)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            previous = read_metadata(fd)
            token = os.environ.get(TOKEN_ENV)
            if token and token == previous.get('token') and previous.get('owner_pid') in parent_ids and previous.get('owner_pid') != os.getpid():
                # Reuse requires BOTH an actually held kernel lock and a verified
                # ancestor. Stale environment/metadata alone never grants access.
                # This helper must remain sequential inside its parent's lease.
                yield {'nested': True, 'fd': None, 'metadata': previous, 'path': str(lock_path)}
                return
            raise HeavyJobBusy(f'Heavy job already running: {previous.get("label", "unknown owner")} (PID {previous.get("owner_pid", "unknown")}); lock retained: {lock_path}') from exc
        previous = read_metadata(fd)
        # A crashed wrapper may have left a child whose executable closed inherited
        # descriptors. Never steal its still-active process group.
        lingering = group_members(rows, previous)
        external = [r for r in rows if r['uid'] == os.getuid() and r['pid'] not in parent_ids and not r['state'].startswith('Z') and looks_heavy(r['command'])]
        if lingering or external:
            active = {r['pid']: r for r in lingering + external}
            detail = ', '.join(f'PID {r["pid"]}: {r["command"][:180]}' for r in active.values())
            raise HeavyJobBusy(f'Existing heavy process detected; new job withheld: {detail}')
        metadata = {'schema_version': 1, 'label': label, 'owner_pid': os.getpid(), 'uid': os.getuid(), 'token': uuid.uuid4().hex, 'started_at': datetime.now(timezone.utc).isoformat(), 'cwd': str(Path.cwd())}
        write_metadata(fd, metadata)
        prior_token = os.environ.get(TOKEN_ENV)
        os.environ[TOKEN_ENV] = metadata['token']
        try:
            yield {'nested': False, 'fd': fd, 'metadata': metadata, 'path': str(lock_path)}
        finally:
            if prior_token is None:
                os.environ.pop(TOKEN_ENV, None)
            else:
                os.environ[TOKEN_ENV] = prior_token
            # Do NOT LOCK_UN: an inherited descriptor may still protect a child.
            # Closing this descriptor releases only this process's ownership.
    finally:
        os.close(fd)


def serialized_heavy(label):
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            with heavy_job(label):
                return function(*args, **kwargs)
        return wrapped
    return decorate
