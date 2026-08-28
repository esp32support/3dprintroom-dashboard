"""
Lightbox_Draft__2026-08-28 03:40:53: Task API has no data at all for this
print (checked - not present in the last 10 tasks, presumably just hasn't
been published to Bambu Cloud yet). Pushes a manual single-color
correction using what the user directly reported: Charcoal Black
(A4/slot 3), 54.43g.

The separate Sapphire Blue double-charge on the OTHER Lightbox_Draft print
(22:55:54) needs no push here - it self-heals via the reconcileDeductionLog()
fix in app.js (deployed alongside this script) the next time the dashboard
loads, since that function previously skipped multi-color overrides
entirely and now handles them too.

Temporary, remove after use.
"""
import json
import os
import urllib.request

SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
USER_AGENT = "Mozilla/5.0 (compatible; fix-two-issues-github-actions)"


def log(msg):
    print(msg, flush=True)


def api_post(url, secret, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    log("=== push correction for the new print (03:40:53, Black, 54.43g) ===")
    result = api_post(SYNC_URL, secret, {
        "printName": "Lightbox_Draft",
        "startTime": "2026-08-28 03:40:53",
        "material": "PLA",
        "colorHex": "161616",
        "weight": 54.43,
    })
    log(f"pushed: {result}")


if __name__ == "__main__":
    main()
