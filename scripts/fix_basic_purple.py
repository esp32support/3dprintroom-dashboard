"""
One-off correction: Basic_Purple.3mf__2026-09-01 12:06:08 is the print
that actually finished (18m24s, confirmed by the user) - the physical
job's real Task API record (id 1213252218, weight 6.06g) is timestamped
close enough to the earlier PAUSED attempt (12:01:23) to auto-match there,
but too far from this one (13min gap, outside the 10min non-title-matched
fallback window - Task API's own title "Basic_Purple" doesn't equal the
device's "Basic_Purple.3mf", so the wider 30min title-matched window never
applies). The existing override on this key only had colorHex (no
weight), missing the White portion (0.86g) entirely and leaving Purple's
weight to a match that already failed.

Pushes the full 2-color breakdown directly, so the client no longer needs
to match anything. No refund needed elsewhere - the paused attempt never
deducted (outcome != FINISH skips auto-deduction regardless of whether it
matched a task for display).

Temporary, remove after use.
"""
import json
import os
import urllib.request

SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
USER_AGENT = "Mozilla/5.0 (compatible; fix-basic-purple-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    body = {
        "printName": "Basic_Purple.3mf",
        "startTime": "2026-09-01 12:06:08",
        "details": [
            {"material": "PLA", "colorHex": "9900CC", "weight": 5.2},
            {"material": "PLA", "colorHex": "FFFFFF", "weight": 0.86},
        ],
    }

    data = json.dumps(body).encode()
    req = urllib.request.Request(SYNC_URL, data=data, method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        log(f"pushed: {json.loads(resp.read())}")


if __name__ == "__main__":
    main()
