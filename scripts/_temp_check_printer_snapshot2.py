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
        print("fetchedAt:", data.get("fetchedAt"))
        print("displayVersion:", snap.get("displayVersion"))
        print("wifiConnected:", snap.get("wifiConnected"))
        print("bambuConnected:", snap.get("bambuConnected"))
        print("gcodeState:", snap.get("gcodeState"))
        print("subtaskName:", snap.get("subtaskName"))
        print("now:", snap.get("now"))
        print("bootHistory[0]:", (snap.get("bootHistory") or [{}])[0])
        print()
        print("FULL:")
        print(json.dumps(snap, indent=2))


if __name__ == "__main__":
    main()
