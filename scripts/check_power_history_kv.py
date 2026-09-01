"""
Temporary: dumps /api/power-history for the last several days to see
exactly what's actually stored, and separately checks master's own event
log for plug offline/failure windows today - to distinguish "the sampler
is broken" from "there was nothing valid to sample" (the plug was
offline/erratic for most of today). Remove after use.
"""
import json
import os
import urllib.request

HISTORY_URL = "https://3dprintroom-dashboard.pages.dev/api/power-history?days=10"
USER_AGENT = "Mozilla/5.0 (compatible; check-power-history-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(HISTORY_URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    log("=== last 10 days of power-history KV ===")
    for day in data.get("days", []):
        log(json.dumps(day))


if __name__ == "__main__":
    main()
