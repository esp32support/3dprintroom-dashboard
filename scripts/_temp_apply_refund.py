import os
import urllib.error
import urllib.request

REFUND_URL = "https://3dprintroom-dashboard.pages.dev/api/temp-refund-fix"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(REFUND_URL, data=b"{}", method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; refund-github-actions)",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"status={resp.status} body={resp.read()!r}")
    except urllib.error.HTTPError as e:
        print(f"HTTPError {e.code} body={e.read()!r}")


if __name__ == "__main__":
    main()
