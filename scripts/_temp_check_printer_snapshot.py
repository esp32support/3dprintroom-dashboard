import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/_temp-printer-snapshot"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={"X-Sync-Secret": secret, "User-Agent": "Mozilla/5.0 (compatible; diag)"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        print(json.dumps(json.loads(resp.read()), indent=2))


if __name__ == "__main__":
    main()
