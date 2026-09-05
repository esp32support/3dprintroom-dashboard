"""Temp check - verify washer_ring_v2's override now carries
durationSeconds/layers."""
import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; override-check3-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    key = "washer_ring_51.5x45.5x3_PETG_v2.stl__2026-09-05 12:26:20"
    print(json.dumps(data.get("historyOverrides", {}).get(key), indent=2))


if __name__ == "__main__":
    main()
