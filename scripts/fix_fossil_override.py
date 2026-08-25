"""
One-off correction: this print's gcode-sync override was recorded with the
wrong color (C0C0C0 / Basic Silver) because print_watch.py used to read the
printer's own raw generic AMS color instead of the dashboard's explicit
slot assignment (A2 -> Fossil Gray, BBBBBB) - now fixed in that script, but
this one print was already pushed before the fix. Pushing a corrected
override here also un-marks it as processed (see gcode-sync.js's own
comment), so the dashboard will automatically re-deduct 151.9g against the
CORRECT filament (Fossil Gray) the next time it's open. It will NOT undo
the wrong 151.9g already taken from Basic Silver - that spool's remaining
weight needs a manual +151.9g correction via the UI.

Not wired into the scheduled workflow - run once by hand, then removed.
"""
import json
import os
import urllib.request

SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
USER_AGENT = "Mozilla/5.0 (compatible; fix-fossil-override-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]

    body = json.dumps({
        "printName": "0.08mm layer, 2 walls, 15% infill",
        "startTime": "2026-08-25 10:02:48",
        "material": "PLA",
        "colorHex": "BBBBBB",
        "weight": 151.9,
    }).encode()

    req = urllib.request.Request(SYNC_URL, data=body, method="POST", headers={
        "X-Sync-Secret": sync_secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })

    with urllib.request.urlopen(req, timeout=15) as resp:
        log(json.loads(resp.read()))


if __name__ == "__main__":
    main()
