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
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            print("slotAssignments:", json.dumps(data.get("slotAssignments")))
            for f in data.get("filaments", []):
                remaining = sum(s.get("remaining", 0) for s in f.get("spools", []) if not s.get("removedAt"))
                print(f"  {f['id']} {f['material']} {f['color']} #{f['colorHex']} remaining={remaining}")
            print("recent deductionLog entries:")
            for k, v in list(data.get("deductionLog", {}).items())[-6:]:
                print(" ", k, "->", json.dumps(v))
    except urllib.error.HTTPError as e:
        print(f"HTTPError {e.code} body={e.read()!r}")


if __name__ == "__main__":
    main()
