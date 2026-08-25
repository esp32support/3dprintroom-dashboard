"""
One-off, read-only audit: reconstructs the full deduction history for the
Fossil Gray spool by replicating the EXACT color-distance matching
processFilamentDeductions() itself uses (app.js), not a naive exact-hex
filter - deductionLog's per-print keys are the RAW hex Bambu reported for
that job, which can differ slightly from Fossil Gray's own stored hex
while still correctly matching it as the closest same-material filament
within COLOR_MATCH_THRESHOLD. An exact "BBBBBB" string filter would miss
any entry logged under a close-but-not-identical hex.

Not wired into the scheduled workflow - run by hand via workflow_dispatch,
then removed again.
"""
import json
import math
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-fossil-gray-github-actions)"
COLOR_MATCH_THRESHOLD = 80


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def color_distance(hex_a, hex_b):
    if not hex_a or not hex_b or len(hex_a) < 6 or len(hex_b) < 6:
        return float("inf")
    a = int(hex_a[:6], 16)
    b = int(hex_b[:6], 16)
    dr = ((a >> 16) & 0xFF) - ((b >> 16) & 0xFF)
    dg = ((a >> 8) & 0xFF) - ((b >> 8) & 0xFF)
    db = (a & 0xFF) - (b & 0xFF)
    return math.sqrt(dr * dr + dg * dg + db * db)


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    lib = fetch_filament_library(sync_secret)
    filaments = lib.get("filaments", [])

    fossil = next((f for f in filaments if f.get("colorHex", "").upper() == "BBBBBB"), None)
    if not fossil:
        log("Fossil Gray filament entry not found")
        return

    log(f"Filament: {fossil.get('material')} {fossil.get('color')} ({fossil.get('brand')}), id={fossil.get('id')}")
    for s in fossil.get("spools", []):
        log(f"  spool {s.get('id')}: total={s.get('total')}g remaining={s.get('remaining')}g created={s.get('createdAt')} removed={s.get('removedAt')}")

    deduction_log = lib.get("deductionLog") or {}

    # Every deductionLog entry is keyed "name__start", value {hex: grams}.
    # Deduction (and this reconstruction) is scoped to material - group
    # filaments by material to replicate the SAME candidate pool
    # processFilamentDeductions() itself filters against for each hex.
    entries = []
    for key, colors in deduction_log.items():
        for hex_color, grams in colors.items():
            if not grams:
                continue

            candidates = [f for f in filaments if f.get("material", "").upper() == "PLA"]
            scored = sorted(
                ((f, color_distance(hex_color, f.get("colorHex", "").upper())) for f in candidates),
                key=lambda t: t[1],
            )
            best = scored[0] if scored and scored[0][1] <= COLOR_MATCH_THRESHOLD else None

            if best and best[0].get("id") == fossil.get("id"):
                entries.append((key, hex_color, grams))

    entries.sort(key=lambda e: e[0])

    log("")
    log("=== ALL deductionLog entries that resolve to Fossil Gray (color-distance matched, not exact hex) ===")
    log("=" * 100)

    total_deducted = 0.0
    for key, hex_color, grams in entries:
        log(f"{grams:8.2f}g  hex={hex_color}  <-  {key}")
        total_deducted += grams

    log("=" * 100)
    log(f"TOTAL deducted across {len(entries)} entries: {total_deducted:.2f}g")

    spool_total = sum(s.get("total", 0) for s in fossil.get("spools", []) if not s.get("removedAt"))
    spool_remaining = sum(s.get("remaining", 0) for s in fossil.get("spools", []) if not s.get("removedAt"))

    log("")
    log(f"Spool total (fresh):       {spool_total:.2f}g")
    log(f"Total deducted (all-time): {total_deducted:.2f}g")
    log(f"Expected remaining:        {spool_total - total_deducted:.2f}g")
    log(f"Actual remaining in KV:    {spool_remaining:.2f}g")
    log(f"Unexplained difference:    {(spool_total - total_deducted) - spool_remaining:.2f}g")


if __name__ == "__main__":
    main()
