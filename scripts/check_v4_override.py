"""Temp check - inspect the actual stored override for the recovered
FiatEmblem_PART1_base_CANDIDATE_v4.stl print, to see why its displayed
duration isn't showing the real ~4.5h."""
import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; v4-override-check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    print("=== historyOverrides matching CANDIDATE_v4 ===")
    for k, v in data.get("historyOverrides", {}).items():
        if "candidate_v4" in k.lower():
            print(repr(k), "->", json.dumps(v))

    print()
    print("=== recoveredTaskIds ===")
    print(data.get("recoveredTaskIds"))


if __name__ == "__main__":
    main()
