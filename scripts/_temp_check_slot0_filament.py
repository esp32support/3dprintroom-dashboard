import json
import os
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
UA = "Mozilla/5.0 (compatible; check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(FILAMENT_URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        lib = json.loads(resp.read())

    f = next((x for x in lib.get("filaments", []) if x.get("id") == "dnej3izu"), None)
    print("=== filament dnej3izu ===")
    print(json.dumps(f, indent=2) if f else "NOT FOUND in library")

    print()
    print("=== ALL filaments (id, material, color, colorHex, active spool count) ===")
    for x in lib.get("filaments", []):
        active = [s for s in x.get("spools", []) if not s.get("removedAt")]
        print(f"  {x.get('id')}  {x.get('material')}  {x.get('color')}  [{x.get('colorHex')}]  active_spools={len(active)}")


if __name__ == "__main__":
    main()
