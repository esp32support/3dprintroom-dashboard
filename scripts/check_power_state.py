import json
import os
import urllib.error
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(FILAMENT_URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": "Mozilla/5.0 (compatible; check-github-actions)",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    print("=== filaments (PETG only) ===")
    for f in data.get("filaments", []):
        if f.get("material") == "PETG":
            remaining = sum(s.get("remaining", 0) for s in f.get("spools", []) if not s.get("removedAt"))
            print(f"  {f['id']} {f['color']} remaining={remaining}")

    print("=== deductionLog entries for 2026-09-20 ===")
    for k, v in data.get("deductionLog", {}).items():
        if "2026-09-20" in k:
            print(" ", k, "->", json.dumps(v))

    print("=== historyOverrides for 2026-09-20 ===")
    for k, v in data.get("historyOverrides", {}).items():
        if "2026-09-20" in k:
            print(" ", k, "->", json.dumps(v))

    print("=== processedPrints for 2026-09-20 ===")
    for k in data.get("processedPrints", []):
        if "2026-09-20" in k:
            print(" ", k)


if __name__ == "__main__":
    main()
