"""Temp check - re-verify the washer_ring_v2 override still exists (ruling
out another browser tab silently overwriting it with a stale copy via
saveFilamentLibrary's full-object POST)."""
import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; override-check2-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    overrides = data.get("historyOverrides", {})
    key = "washer_ring_51.5x45.5x3_PETG_v2.stl__2026-09-05 12:26:20"
    print("override present:", key in overrides)
    if key in overrides:
        print(overrides[key])

    # Also check the current Basic Black PETG spool weight directly.
    for f in data.get("filaments", []):
        if f.get("colorHex", "").upper() == "161616" and f.get("material") == "PETG":
            for s in f.get("spools", []):
                if not s.get("removedAt"):
                    print("Basic Black PETG spool:", s.get("id"), "remaining:", s.get("remaining"))


if __name__ == "__main__":
    main()
