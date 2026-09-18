import json
import os
import urllib.error
import urllib.request

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
PER_PRINT_URL = "https://3dprintroom-dashboard.pages.dev/api/power-per-print"


def get_raw(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": "Mozilla/5.0 (compatible; check-power-state-github-actions)",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read()
            print(f"{url} -> status={resp.status} body={body!r}")
            return body
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"{url} -> HTTPError {e.code} body={body!r}")
        return None


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    get_raw(STATE_URL, secret)
    get_raw(PER_PRINT_URL, secret)


if __name__ == "__main__":
    main()
