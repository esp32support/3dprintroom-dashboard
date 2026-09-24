"""One-off: push the gcode-sync correction for iso_adapter_final.stl,
which finished today but hasn't been auto-deducted yet (needs an open
browser tab to run, or cron-worker's own gcode-sync push, which requires
having observed the RUNNING->FINISH transition live - missed here since
CYD's Bambu Cloud link was down for the whole print). Task API confirms:
weight=9.13g, PLA, color FFFFFF (slot 0), slot 0 is assigned to filament
dnej3izu = Cotton White PLA, spool b7ioc3r7 - the SAME spool
iso_adapter.stl (the earlier, different print today) already deducted
from cleanly. startTime converted from Task API's UTC
"2026-09-24T15:56:57Z" to device-local "2026-09-24 17:56:57" (+2h,
matching the printer's own observed UTC+2 offset from the live snapshot
read earlier this session)."""
import json
import os
import urllib.request

SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
UA = "Mozilla/5.0 (compatible; add-iso-final-github-actions)"


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    body = {
        "printName": "iso_adapter_final.stl",
        "startTime": "2026-09-24 17:56:57",
        "material": "PLA",
        "colorHex": "FFFFFF",
        "weight": 9.13,
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(SYNC_URL, data=data, method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": UA,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(f"status={resp.status} body={resp.read().decode()}")


if __name__ == "__main__":
    main()
