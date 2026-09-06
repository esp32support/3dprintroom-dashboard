"""One-shot temp script - applies the two permanent write-offs (see
gcode-sync.js's `skip` path and app.js's override.skip handling) the
moment the 2026-09-06 Workers KV daily put-quota resets at
2026-09-07 00:00:00 UTC. Retries a few times with backoff in case the
reset lands a little later than GitHub's own cron actually fires (GH
Actions schedules are not guaranteed to the minute - see
printer-sync.yml's own comment on this).

Removed from the repo (along with the cron workflow that runs it) once
confirmed applied - this is not meant to be a permanent script."""
import json
import os
import time
import urllib.error
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
UA = "Mozilla/5.0 (compatible; writeoff-apply-github-actions)"

WRITEOFFS = [
    {
        "printName": "02_anchor_pegs_x3.stl",
        "startTime": "2026-09-01 20:16:51",
        "skip": True,
        "reason": "Charcoal Black PLA spool empty (0g remaining, not restocked) - no deduction possible",
    },
    {
        "printName": "0.2mm layer, 2 walls, 15% infill",
        "startTime": "2026-09-05 08:59:53",
        "skip": True,
        "reason": "reported ABS/000000 with no library match - this room never prints ABS, confirmed a mislabeled tray, not a missing filament entry",
    },
]


def post(secret, payload):
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode(),
        headers={
            "X-Sync-Secret": secret,
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    for entry in WRITEOFFS:
        last_err = None
        for attempt in range(1, 6):
            try:
                result = post(secret, entry)
                print(f"OK: {entry['printName']!r} -> {result}")
                last_err = None
                break
            except urllib.error.HTTPError as e:
                last_err = e
                body = e.read().decode(errors="replace")
                print(f"attempt {attempt} failed for {entry['printName']!r}: HTTP {e.code} {body}")
                if attempt < 5:
                    time.sleep(30 * attempt)
        if last_err is not None:
            raise SystemExit(f"giving up on {entry['printName']!r} after 5 attempts: {last_err}")


if __name__ == "__main__":
    main()
