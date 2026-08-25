"""
One-off, read-only audit: checks the just-finished print's deduction against
Fossil Gray and Basic Silver, plus the CURRENT slotAssignments state (to
confirm A2's assignment is still intact and wasn't reset somehow).

Not wired into the scheduled workflow - run by hand via workflow_dispatch,
then removed again.
"""
import json
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-fossil-recheck-github-actions)"


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    lib = fetch_filament_library(sync_secret)

    log("=== slotAssignments (current) ===")
    log(json.dumps(lib.get("slotAssignments", {}), indent=2))

    log("")
    log("=== Fossil Gray + Basic Silver current state ===")
    for f in lib.get("filaments", []):
        if f.get("colorHex", "").upper() in ("BBBBBB", "C0C0C0"):
            log(json.dumps(f, indent=2))

    key = "0.08mm layer, 2 walls, 15% infill__2026-08-25 10:02:48"
    deduction_log = lib.get("deductionLog") or {}
    processed = set(lib.get("processedPrints") or [])
    overrides = lib.get("historyOverrides") or {}

    log("")
    log(f"=== Deduction record for THIS print (key={key}) ===")
    log(f"processed: {key in processed}")
    log(f"override: {key in overrides}")
    log(f"deductionLog entry: {json.dumps(deduction_log.get(key))}")


if __name__ == "__main__":
    main()
