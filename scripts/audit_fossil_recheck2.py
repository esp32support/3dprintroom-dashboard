"""
Follow-up: dump the actual historyOverrides entry for the just-finished
print, to see why its recorded color resolved to Basic Silver instead of
Fossil Gray despite the correct slot assignment.
"""
import json
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-fossil-recheck2-github-actions)"


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    lib = fetch_filament_library(sync_secret)

    key = "0.08mm layer, 2 walls, 15% infill__2026-08-25 10:02:48"
    overrides = lib.get("historyOverrides") or {}

    log(f"=== historyOverrides[{key}] ===")
    log(json.dumps(overrides.get(key), indent=2))


if __name__ == "__main__":
    main()
