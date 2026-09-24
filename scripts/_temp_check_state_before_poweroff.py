import json
import os
import urllib.request

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
UA = "Mozilla/5.0 (compatible; check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(STATE_URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(json.dumps(json.loads(resp.read()), indent=2))


if __name__ == "__main__":
    main()
