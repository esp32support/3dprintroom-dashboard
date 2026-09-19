import json
import os
import urllib.error
import urllib.request

FIX_URL = "https://3dprintroom-dashboard.pages.dev/api/fix-slot-assignment"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    body = json.dumps({"slot": "2", "filamentId": None}).encode()
    req = urllib.request.Request(FIX_URL, data=body, method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; fix-slot-github-actions)",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"status={resp.status} body={resp.read()!r}")
    except urllib.error.HTTPError as e:
        print(f"HTTPError {e.code} body={e.read()!r}")


if __name__ == "__main__":
    main()
