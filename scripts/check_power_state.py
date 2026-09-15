import json
import os
import urllib.request

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
PER_PRINT_URL = "https://3dprintroom-dashboard.pages.dev/api/power-per-print"


def get(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": "Mozilla/5.0 (compatible; check-power-state-github-actions)",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    print("printer-watch-state:", json.dumps(get(STATE_URL, secret)))
    print("power-per-print:", json.dumps(get(PER_PRINT_URL, secret)))


if __name__ == "__main__":
    main()
