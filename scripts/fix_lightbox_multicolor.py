"""
One-off correction: restores Lightbox_Draft__2026-08-27 22:55:54's true
5-color breakdown, which print_watch.py's now-fixed bug overwrote with a
wrong single-color (Black-only) verdict, causing reconcileDeductionLog()
to refund the other 4 colors back to their spools - see print_watch.py's
own comment on the FINISH-gate fix for the full story.

True breakdown, from Task API's own amsDetail for this exact job
(weight totals to 117.49g, matching Task API's own reported total):
  Yellow (EXT/254)     4.02g
  Red (slot 1)         5.83g
  Sapphire Blue (slot2) 10.68g  (9.50 + 1.18, two amsDetail rows same slot)
  Cotton White (slot0) 8.84g
  Charcoal Black(slot3) 88.12g  <- already correctly logged, weight
                                   unchanged here so the client's own
                                   diffing (delta = weight - already)
                                   skips re-deducting it - no double charge.

Uses each filament's OWN assigned colorHex (not Bambu's raw reported
color) - an override's details[] carry no slot/amsId, so the client
resolves by color-distance, and supplying the exact assigned color
guarantees the right filament matches.

Temporary, remove after use.
"""
import json
import os
import urllib.request

SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
USER_AGENT = "Mozilla/5.0 (compatible; fix-lightbox-multicolor-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    body = {
        "printName": "Lightbox_Draft",
        "startTime": "2026-08-27 22:55:54",
        "details": [
            {"material": "PLA", "colorHex": "FFF144", "weight": 4.02},   # Basic Yellow (EXT)
            {"material": "PLA", "colorHex": "FF0000", "weight": 5.83},   # Red
            {"material": "PLA", "colorHex": "2850E0", "weight": 10.68},  # Sapphire Blue
            {"material": "PLA", "colorHex": "FFFFFF", "weight": 8.84},   # Cotton White
            {"material": "PLA", "colorHex": "161616", "weight": 88.12},  # Charcoal Black
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
