import json
import os
import urllib.request

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
CONFIG_URL = "https://3dprintroom-dashboard.pages.dev/api/auto-off-config"
UA = "Mozilla/5.0 (compatible; check-autooff-github-actions)"


def api_get(url, secret):
    req = urllib.request.Request(url, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    print("=== auto-off-config ===")
    print(json.dumps(api_get(CONFIG_URL, secret), indent=2))

    print()
    print("=== printer-watch-state ===")
    print(json.dumps(api_get(STATE_URL, secret), indent=2))


if __name__ == "__main__":
    main()
