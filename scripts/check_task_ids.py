"""
Checks Task API's own "id" field against CYD's device-reported taskId
values, to see whether the exact-match path in matchTaskForHistoryItem()
actually succeeds for the two PETG prints. Temporary, remove after use.
"""
import json
import os
import urllib.request

TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
USER_AGENT = "Mozilla/5.0 (compatible; check-task-ids-github-actions)"


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

    log("=== last 12 Task API entries, with id ===")
    for t in data.get("tasks", [])[:12]:
        log(json.dumps({
            "id": t.get("id"),
            "title": t.get("title"),
            "startTime": t.get("startTime"),
            "weight": t.get("weight"),
            "materials": [d.get("type") for d in (t.get("amsDetail") or [])],
        }))


if __name__ == "__main__":
    main()
