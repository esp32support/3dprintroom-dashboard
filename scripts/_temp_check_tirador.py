import json
import os
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
UA = "Mozilla/5.0 (compatible; check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(FILAMENT_URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        lib = json.loads(resp.read())

    print("=== processedPrints keys containing 'Tirador' ===")
    for k in lib.get("processedPrints", []):
        if "tirador" in k.lower():
            print(" ", repr(k))

    print()
    print("=== historyOverrides keys containing 'Tirador' ===")
    for k, v in lib.get("historyOverrides", {}).items():
        if "tirador" in k.lower():
            print(" ", repr(k), "->", json.dumps(v))

    print()
    print("=== deductionLog keys containing 'Tirador' ===")
    for k, v in lib.get("deductionLog", {}).items():
        if "tirador" in k.lower():
            print(" ", repr(k), "->", json.dumps(v))


if __name__ == "__main__":
    main()
