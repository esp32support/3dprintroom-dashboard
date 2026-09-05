"""Temp check - verify the historyOverrides entry for washer_ring_v2 is
actually stored with the exact key app.js's processFilamentDeductions()
would look up."""
import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; override-check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    overrides = data.get("historyOverrides", {})
    processed = data.get("processedPrints", [])

    print("=== historyOverrides keys ===")
    for k in overrides:
        if "washer" in k.lower():
            print(repr(k), "->", overrides[k])

    print()
    print("=== processedPrints matching 'washer' ===")
    for p in processed:
        if "washer" in p.lower():
            print(repr(p))


if __name__ == "__main__":
    main()
