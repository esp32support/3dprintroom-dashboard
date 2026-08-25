"""
Full ledger dump - every deductionLog entry with ALL its hex keys (not just
one color), its override, and whether it's marked processed. The earlier
per-color audits only printed the hex they were looking for, which hid
whether a print had ALSO been re-deducted under its corrected color - the
exact double-charge this is meant to expose.

Temporary, remove after use.
"""
import json
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-full-state-github-actions)"

COLOR_MATCH_THRESHOLD = 80


def log(msg):
    print(msg, flush=True)


def color_distance(a, b):
    if not a or not b or len(a) < 6 or len(b) < 6:
        return float("inf")
    ai, bi = int(a[:6], 16), int(b[:6], 16)
    dr = ((ai >> 16) & 0xFF) - ((bi >> 16) & 0xFF)
    dg = ((ai >> 8) & 0xFF) - ((bi >> 8) & 0xFF)
    db = (ai & 0xFF) - (bi & 0xFF)
    return (dr * dr + dg * dg + db * db) ** 0.5


def main():
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": os.environ["FILAMENT_SYNC_SECRET"],
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        lib = json.loads(resp.read())

    filaments = lib.get("filaments", [])
    deduction_log = lib.get("deductionLog") or {}
    overrides = lib.get("historyOverrides") or {}
    processed = set(lib.get("processedPrints") or [])

    log("=== SPOOLS ===")
    for f in filaments:
        for s in f.get("spools", []):
            if s.get("removedAt"):
                continue
            log(f"  {f.get('name','?'):<28} {f.get('colorHex','?'):>7}  "
                f"{s.get('remaining',0):8.2f} / {s.get('total',0)}   id={s.get('id')}")

    log("")
    log("=== SLOT ASSIGNMENTS ===")
    for slot, fid in sorted((lib.get("slotAssignments") or {}).items()):
        match = next((f for f in filaments if f.get("id") == fid), None)
        log(f"  slot {slot} -> {fid}  ({match.get('name') if match else 'MISSING'})")

    log("")
    log("=== DEDUCTION LOG (all colors per print) ===")
    totals = {}
    for key in sorted(deduction_log.keys()):
        entry = deduction_log[key] or {}
        ov = overrides.get(key)
        log(f"\n  {key}")
        log(f"    processed={key in processed}  override={json.dumps(ov)}")
        for hex_key, grams in entry.items():
            totals[hex_key] = totals.get(hex_key, 0) + grams
            log(f"      {hex_key}: {grams:.2f}g")

        # Flag the double-charge shape: a single-color override whose log
        # holds a hex that is NOT the override's color, yet was left in
        # place because the two colors are near-identical (reconcile only
        # refunds when they are further apart than the match threshold).
        if ov and not ov.get("details") and isinstance(ov.get("colorHex"), str):
            correct = ov["colorHex"].upper()
            for hex_key in entry:
                if hex_key == correct:
                    continue
                d = color_distance(hex_key, correct)
                flag = "NOT refunded (dist under threshold)" if d <= COLOR_MATCH_THRESHOLD else "would refund"
                log(f"      !! stale {hex_key} vs correct {correct}: dist={d:.2f} -> {flag}")

    log("")
    log("=== TOTAL DEDUCTED PER COLOR (across all prints) ===")
    for hex_key, grams in sorted(totals.items(), key=lambda kv: -kv[1]):
        match = next((f for f in filaments if (f.get("colorHex") or "").upper() == hex_key), None)
        log(f"  {hex_key}  {grams:9.2f}g   ({match.get('name') if match else 'no exact library match'})")


if __name__ == "__main__":
    main()
