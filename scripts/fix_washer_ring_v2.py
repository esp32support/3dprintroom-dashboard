"""Temp one-shot fix - washer_ring_51.5x45.5x3_PETG_v2.stl finished normally
(confirmed: Task API shows a clean 12m16s run, weight 1.46g, PETG slot 2 -
matches the prior washer_ring print almost exactly), but the automatic
deduction skipped it because CYD's own device history got its outcome
corrupted to "IDLE" (and layers to 0) during a Bambu-cloud connectivity
outage that was happening around this exact print. Pushing the correct
single-color override directly, same mechanism print_watch.py itself would
have used had the outcome not been corrupted.

startTime below is CYD's own (buggy) recorded start for this history entry,
not the real print time - the dashboard's match key is printName__startTime
against lastHistoryItems, so this has to agree with what's actually stored
there for the override to attach to the right entry."""
import json
import os
import urllib.request

SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
USER_AGENT = "Mozilla/5.0 (compatible; manual-fix-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    body = {
        "printName": "washer_ring_51.5x45.5x3_PETG_v2.stl",
        "startTime": "2026-09-05 12:26:20",
        "material": "PETG",
        "colorHex": "161616",
        "weight": 1.46,
    }

    req = urllib.request.Request(
        SYNC_URL,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "X-Sync-Secret": secret,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        print(json.dumps(json.loads(resp.read()), indent=2))


if __name__ == "__main__":
    main()
