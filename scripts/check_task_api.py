"""Temp check - fetches Bambu Task API data via the dashboard's own
/api/printer-task endpoint to find the real weight/duration for
washer_ring_51.5x45.5x3_PETG_v2.stl, since CYD's own device history got
corrupted by the connectivity outage (wrong outcome, wrong layers, wrong
duration)."""
import json
import os
import urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
USER_AGENT = "Mozilla/5.0 (compatible; task-api-check-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    for t in data.get("tasks", []):
        print(json.dumps(t, indent=2))
        print("---")


if __name__ == "__main__":
    main()
