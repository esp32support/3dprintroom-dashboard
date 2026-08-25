"""
After the bulk correction, check whether ANY deductionLog entry is still
legitimately attributed to Basic Silver (C0C0C0) - if none remain, the
spool has never actually been used and its true remaining is simply its
fresh total (1000g), not something to compute incrementally on top of a
manual correction that may itself have been based on incomplete
information.
"""
import json
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-silver-final-github-actions)"


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

    deduction_log = lib.get("deductionLog") or {}
    overrides = lib.get("historyOverrides") or {}

    remaining_silver_entries = []
    for key, colors in deduction_log.items():
        grams = colors.get("C0C0C0")
        if grams:
            remaining_silver_entries.append((key, grams, overrides.get(key)))

    log(f"=== Remaining deductionLog entries still attributed to C0C0C0 (Basic Silver) ===")
    for key, grams, ov in remaining_silver_entries:
        log(f"{grams:8.2f}g  <-  {key}   override={json.dumps(ov)}")

    log("")
    log(f"total still legitimately on Silver: {sum(g for _, g, _ in remaining_silver_entries):.2f}g")

    silver = next((f for f in lib.get("filaments", []) if f.get("colorHex", "").upper() == "C0C0C0"), None)
    if silver:
        log("")
        log(f"Basic Silver spool: {json.dumps(silver['spools'])}")

    fossil = next((f for f in lib.get("filaments", []) if f.get("colorHex", "").upper() == "BBBBBB"), None)
    if fossil:
        log(f"Fossil Gray spool: {json.dumps(fossil['spools'])}")


if __name__ == "__main__":
    main()
