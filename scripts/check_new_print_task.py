"""
Checks whether Bambu's Task API now has an entry for the print that
started 2026-08-28 03:40:53 (the one the dashboard shows "No filament
usage recorded" for) - it may have simply not been available yet when the
dashboard first tried. Temporary, remove after use.
"""
import json
import os
import urllib.request

TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
USER_AGENT = "Mozilla/5.0 (compatible; check-new-print-task-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(TASK_URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    log("=== last 10 Task API entries ===")
    for t in data.get("tasks", [])[:10]:
        log(json.dumps({
            "title": t.get("title"),
            "startTime": t.get("startTime"),
            "weight": t.get("weight"),
            "amsDetail": t.get("amsDetail"),
        }))


if __name__ == "__main__":
    main()
