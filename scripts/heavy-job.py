#!/usr/bin/env python3
"""Run one heavy job under the shared, crash-safe production lease. No polling."""
import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.runtime.heavy_job import HeavyJobBusy, heavy_job, group_members, process_table, write_metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', default='production')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('a command is required after --')
    try:
        with heavy_job(args.label) as lease:
            nested = lease['nested']
            child = subprocess.Popen(command, start_new_session=not nested, pass_fds=() if nested else (lease['fd'],))
            if not nested:
                lease['metadata']['child_pgid'] = child.pid
                lease['metadata']['command'] = command
                write_metadata(lease['fd'], lease['metadata'])
            def forward(signum, _frame):
                if child.poll() is None:
                    try:
                        if nested:
                            child.send_signal(signum)
                        else:
                            os.killpg(child.pid, signum)
                    except ProcessLookupError:
                        pass
            for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                signal.signal(sig, forward)
            status = child.wait()
            # Keep ownership if a direct child exits before its worker processes.
            if not nested:
                while group_members(process_table(), lease['metadata']):
                    time.sleep(0.25)
            return status if status >= 0 else 128 - status
    except HeavyJobBusy as exc:
        print(f'HEAVY_JOB_BUSY: {exc}', file=sys.stderr)
        return 75
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f'HEAVY_JOB_ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
