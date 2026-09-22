"""TEMP: dump processedPrints/historyOverrides/recoveredTaskIds keys for
the magio_mg640_compound_gear.stl double-deduction on 2026-09-22, to see
the exact two print keys used by the two sources that both deducted it."""
import json
import os
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; temp-diag-github-actions)"


def api_get(url, secret):
    req = urllib.request.Request(url, headers={"X-Sync-Secret": secret, "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    lib = api_get(FILAMENT_URL, secret)

    print("=== processedPrints containing 'magio' ===")
    for k in lib.get("processedPrints", []):
        if "magio" in k.lower():
            print(" ", repr(k))

    print()
    print("=== historyOverrides containing 'magio' ===")
    for k, v in lib.get("historyOverrides", {}).items():
        if "magio" in k.lower():
            print(" ", repr(k), "->", json.dumps(v))

    print()
    print("=== deductionLog containing 'magio' ===")
    for k, v in lib.get("deductionLog", {}).items():
        if "magio" in k.lower():
            print(" ", repr(k), "->", json.dumps(v))

    print()
    print("=== recoveredTaskIds (all) ===")
    print(" ", lib.get("recoveredTaskIds", []))


if __name__ == "__main__":
    main()
