import json
import os
import urllib.request

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
UA = "Mozilla/5.0 (compatible; inspect-github-actions)"


def api_get(url, secret):
    req = urllib.request.Request(url, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    state = api_get(STATE_URL, secret)
    print("=== printer-watch-state ===")
    print(json.dumps(state, indent=2))

    tasks = api_get(TASK_URL, secret).get("tasks", [])
    matches = [t for t in tasks if "iso_adapter" in (t.get("title") or "").lower()]
    print()
    print(f"=== Task API entries matching 'iso_adapter' ({len(matches)}) ===")
    for t in matches:
        print(json.dumps(t, indent=2))

    lib = api_get(FILAMENT_URL, secret)
    print()
    print("=== slotAssignments ===")
    print(json.dumps(lib.get("slotAssignments"), indent=2))


if __name__ == "__main__":
    main()
