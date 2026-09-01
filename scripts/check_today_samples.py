"""Temporary: dumps today's raw KV day record to see countW/countA -
confirming whether real multiple samples accumulated despite the "1"
shown on the dashboard. Remove after use."""
import json
import os
import urllib.request

HISTORY_URL = "https://3dprintroom-dashboard.pages.dev/api/power-history?days=1"
USER_AGENT = "Mozilla/5.0 (compatible; check-today-samples-github-actions)"

secret = os.environ["FILAMENT_SYNC_SECRET"]
req = urllib.request.Request(HISTORY_URL, headers={
    "X-Sync-Secret": secret,
    "User-Agent": USER_AGENT,
})
with urllib.request.urlopen(req, timeout=15) as resp:
    data = json.loads(resp.read())

print(json.dumps(data, indent=2), flush=True)
