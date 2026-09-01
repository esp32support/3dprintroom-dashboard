"""
Temporary: checks today's power-history KV entry specifically, and prints
current UTC time so we can see whether any top-of-hour (minute 0-4)
window has actually landed since the plug got fixed. Remove after use.
"""
import datetime
import json
import os
import urllib.request

HISTORY_URL = "https://3dprintroom-dashboard.pages.dev/api/power-history?days=1"
USER_AGENT = "Mozilla/5.0 (compatible; check-today-kv-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    now = datetime.datetime.now(datetime.timezone.utc)
    log(f"current UTC time: {now.isoformat()}  (minute={now.minute})")

    req = urllib.request.Request(HISTORY_URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    log(f"today's KV entry: {json.dumps(data)}")


if __name__ == "__main__":
    main()
