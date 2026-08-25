"""
Follow-up to audit_fossil_gray.py: checks for duplicate/near-duplicate
Fossil Gray filament entries in the library (which would silently split
deductions across two spool records), and dumps every deductionLog entry
from the last 6 days regardless of what it resolved to, to see what
actually happened recently.
"""
import json
import os
import urllib.request
from datetime import datetime, timedelta

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-fossil-gray-2-github-actions)"


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
    filaments = lib.get("filaments", [])

    log("=== Every PLA filament with 'gray'/'grey'/'silver' in its name, or a near-gray hex ===")
    for f in filaments:
        color = f.get("color", "").lower()
        hexv = f.get("colorHex", "").upper()
        if "gray" in color or "grey" in color or "silver" in color or hexv in ("BBBBBB", "BCBCBC", "C0C0C0", "AAAAAA", "999999"):
            log(json.dumps(f))

    deduction_log = lib.get("deductionLog") or {}

    log("")
    log("=== ALL deductionLog entries (any color) from the last 6 days ===")
    log("=" * 100)

    cutoff = datetime.utcnow() - timedelta(days=6)

    def parse_key_date(key):
        # key = "name__YYYY-MM-DD HH:MM:SS"
        try:
            date_str = key.rsplit("__", 1)[1]
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None

    recent = []
    for key, colors in deduction_log.items():
        d = parse_key_date(key)
        if d and d >= cutoff:
            recent.append((key, colors, d))

    recent.sort(key=lambda t: t[2])

    for key, colors, d in recent:
        log(f"{key}")
        log(f"    {json.dumps(colors)}")

    log("=" * 100)
    log(f"{len(recent)} deductionLog entries in the last 6 days (any color)")


if __name__ == "__main__":
    main()
