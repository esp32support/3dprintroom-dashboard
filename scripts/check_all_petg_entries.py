"""
Full current picture: every deductionLog entry touching White/Black
(FFFFFF/000000/161616), which prints they belong to, and whether each has
already been deducted - to know exactly which entries need a filamentId
backfill for the PLA/PETG White-Black color collision. Temporary, remove
after use.
"""
import json
import os
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; check-all-petg-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(FILAMENT_URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        lib = json.loads(resp.read())

    log("=== filaments at FFFFFF or 000000/161616 ===")
    for f in lib.get("filaments", []):
        hexv = (f.get("colorHex") or "").upper()
        if hexv in ("FFFFFF", "161616", "000000"):
            log(f"  id={f.get('id')}  {f.get('material')}  {f.get('color')}  [{hexv}]")

    log("")
    log("=== deductionLog entries touching those hexes ===")
    for key, entry in (lib.get("deductionLog") or {}).items():
        for hex_key, val in (entry or {}).items():
            if hex_key.upper() in ("FFFFFF", "161616", "000000"):
                log(f"  {key}  ::  {hex_key} = {json.dumps(val)}")

    log("")
    log(f"processedPrints (last 15): {json.dumps(lib.get('processedPrints', [])[-15:])}")


if __name__ == "__main__":
    main()
