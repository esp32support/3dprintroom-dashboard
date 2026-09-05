"""Temp one-shot fix - adds the corrected duration (736s = 12m16s, the real
Task API run time) and layer count (15) to washer_ring_51.5x45.5x3_PETG_v2's
existing override, alongside the material/colorHex/weight already set.
Re-POSTs the full override (gcode-sync.js replaces the whole object per
key, doesn't merge), so material/colorHex/weight are repeated unchanged."""
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
        "durationSeconds": 736,
        "layers": 15,
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
