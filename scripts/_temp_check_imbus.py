import json
import os
import urllib.request

TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
UA = "Mozilla/5.0 (compatible; check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(TASK_URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        tasks = json.loads(resp.read()).get("tasks", [])
    matches = [t for t in tasks if "imbus" in (t.get("title") or "").lower()]
    print(json.dumps(matches, indent=2))


if __name__ == "__main__":
    main()
