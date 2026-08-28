"""
Pulls recent deduction-audit entries (all events, not just deduct) plus
the device's own print history, to reconstruct what happened on the last
print - which used the EXT spool with manual pauses to swap the physical
spool by hand. Temporary, remove after use.
"""
import json
import os
import urllib.request

AUDIT_URL = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit"
FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
USER_AGENT = "Mozilla/5.0 (compatible; audit-recent-print-github-actions)"


def log(msg):
    print(msg, flush=True)


def api_get(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    log("=== last 30 deduction-audit entries (any event) ===")
    audit = api_get(f"{AUDIT_URL}?limit=30", secret)
    for e in audit.get("entries", []):
        log(json.dumps(e))

    log("")
    log("=== current filament library: spools + slot assignments ===")
    lib = api_get(FILAMENT_URL, secret)
    for f in lib.get("filaments", []):
        for s in f.get("spools", []):
            if s.get("removedAt"):
                continue
            log(f"  {f.get('color','?'):<20} [{f.get('colorHex','?')}] {s.get('remaining',0):.2f}/{s.get('total',0)}")
    log(f"  slotAssignments: {json.dumps(lib.get('slotAssignments'))}")
    log(f"  processedPrints (last 10): {json.dumps(lib.get('processedPrints', [])[-10:])}")

    log("")
    log("=== recent Task API history (last 10) ===")
    try:
        tasks = api_get(TASK_URL, secret)
        for t in tasks.get("tasks", [])[:10]:
            log(json.dumps({
                "title": t.get("title"),
                "startTime": t.get("startTime"),
                "weight": t.get("weight"),
                "amsDetail": t.get("amsDetail"),
            }))
    except Exception as e:
        log(f"task API fetch failed: {e}")


if __name__ == "__main__":
    main()
