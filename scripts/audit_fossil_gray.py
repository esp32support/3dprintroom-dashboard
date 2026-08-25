"""
One-off, read-only audit: reconstructs the full deduction history for the
Fossil Gray spool (colorHex BBBBBB) to verify its current remaining value
is arithmetically correct - starting total minus every deductionLog entry
that touched this exact color.

Not wired into the scheduled workflow - run by hand via workflow_dispatch,
then removed again.
"""
import json
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-fossil-gray-github-actions)"
TARGET_HEX = "BBBBBB"


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

    fossil = next((f for f in lib.get("filaments", []) if f.get("colorHex", "").upper() == TARGET_HEX), None)
    if not fossil:
        log("Fossil Gray filament entry not found")
        return

    log(f"Filament: {fossil.get('material')} {fossil.get('color')} ({fossil.get('brand')})")
    for s in fossil.get("spools", []):
        log(f"  spool {s.get('id')}: total={s.get('total')}g remaining={s.get('remaining')}g created={s.get('createdAt')} removed={s.get('removedAt')}")

    deduction_log = lib.get("deductionLog") or {}

    entries = []
    for key, colors in deduction_log.items():
        grams = colors.get(TARGET_HEX)
        if grams:
            entries.append((key, grams))

    entries.sort(key=lambda e: e[0])

    log("")
    log(f"=== ALL deductionLog entries touching {TARGET_HEX} (Fossil Gray) ===")
    log("=" * 100)

    total_deducted = 0.0
    for key, grams in entries:
        log(f"{grams:8.2f}g  <-  {key}")
        total_deducted += grams

    log("=" * 100)
    log(f"TOTAL deducted across {len(entries)} entries: {total_deducted:.2f}g")

    spool_total = sum(s.get("total", 0) for s in fossil.get("spools", []) if not s.get("removedAt"))
    spool_remaining = sum(s.get("remaining", 0) for s in fossil.get("spools", []) if not s.get("removedAt"))

    log("")
    log(f"Spool total (fresh):     {spool_total:.2f}g")
    log(f"Total deducted (all-time): {total_deducted:.2f}g")
    log(f"Expected remaining:      {spool_total - total_deducted:.2f}g")
    log(f"Actual remaining in KV:  {spool_remaining:.2f}g")
    log(f"Difference:              {(spool_total - total_deducted) - spool_remaining:.2f}g")


if __name__ == "__main__":
    main()
