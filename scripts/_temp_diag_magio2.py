"""TEMP: re-check magio_mg640_compound_gear.stl state after the refund -
user still sees 2 prints/32.94g in the dashboard after a page refresh."""
import json
import os
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; temp-diag2-github-actions)"


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
    print("=== filament 3b8gl3xg (Basic Black PETG) spools ===")
    f = next((x for x in lib.get("filaments", []) if x.get("id") == "3b8gl3xg"), None)
    print(" ", json.dumps(f))


if __name__ == "__main__":
    main()
