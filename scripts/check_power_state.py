import json
import os
import urllib.error
import urllib.request

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
PER_PRINT_URL = "https://3dprintroom-dashboard.pages.dev/api/power-per-print"
TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
HISTORY_URL = "https://3dprintroom-dashboard.pages.dev/api/power-history?days=2"


def get_raw(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": "Mozilla/5.0 (compatible; check-github-actions)",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"{url} -> {resp.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"{url} -> HTTPError {e.code} {e.read()!r}")


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    get_raw(STATE_URL, secret)
    get_raw(PER_PRINT_URL, secret)
    get_raw(TASK_URL, secret)
    get_raw(HISTORY_URL, secret)


if __name__ == "__main__":
    main()
