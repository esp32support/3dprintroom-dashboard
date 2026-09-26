import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/_temp-printer-snapshot"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={"X-Sync-Secret": secret, "User-Agent": "Mozilla/5.0 (compatible; diag)"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
        snap = data.get("snapshot") or {}
        history = snap.get("history") or []
        matches = [h for h in history if "imbus" in (h.get("name") or "").lower()]
        print("=== device's own history entries matching 'imbus' ===")
        print(json.dumps(matches, indent=2))
        print()
        print("=== first 5 history entries overall (for context) ===")
        print(json.dumps(history[:5], indent=2))


if __name__ == "__main__":
    main()
