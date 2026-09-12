"""Temp read-only check - list every filament's colorHex/color name/material
currently in the real library, to sanity-check the new color-family
bucketing against real data before shipping it."""
import json, os, urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
UA = "Mozilla/5.0 (compatible; color-check-github-actions)"

def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    for f in data.get("filaments", []):
        print(f"{f.get('material'):6} #{f.get('colorHex','??????'):6} {f.get('color')!r} brand={f.get('brand')!r}")

if __name__ == "__main__":
    main()
