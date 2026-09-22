"""TEMP, read-only: reconstruct the full ledger for PETG Basic Black
spool an2bfvih (filament 3b8gl3xg) from the deduction-audit trail, to
verify the current 177.58g remaining is actually correct."""
import json
import os
import urllib.request

AUDIT_URL = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit"
FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; reconcile-github-actions)"

SPOOL_ID = "an2bfvih"
FILAMENT_ID = "3b8gl3xg"
SPOOL_TOTAL = 1000
SPOOL_CREATED = "2026-08-06T17:21:59.364Z"


def api_get(url, secret):
    req = urllib.request.Request(url, headers={"X-Sync-Secret": secret, "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    lib = api_get(FILAMENT_URL, secret)
    f = next((x for x in lib.get("filaments", []) if x.get("id") == FILAMENT_ID), None)
    spool = next((s for s in (f.get("spools") or []) if s.get("id") == SPOOL_ID), None)
    live_remaining = spool.get("remaining") if spool else None

    data = api_get(AUDIT_URL, secret)
    entries = data.get("entries", [])

    print(f"total audit entries stored: {data.get('count')}")
    print(f"spool {SPOOL_ID} created {SPOOL_CREATED}, total {SPOOL_TOTAL}g")
    print(f"LIVE remaining right now (per /api/device-filament): {live_remaining}")
    print()

    running = float(SPOOL_TOTAL)
    touched = 0

    print(f"{'ts':<21} {'event':<8} {'delta':>8} {'running':>9}  print / source")
    print("-" * 100)

    for e in entries:
        if e.get("spoolId") != SPOOL_ID and e.get("filamentId") != FILAMENT_ID:
            continue

        event = e.get("event", "?")
        delta = e.get("delta")

        if event == "deduct" and isinstance(delta, (int, float)):
            running -= abs(delta)
            touched += 1
        elif event == "refund" and isinstance(delta, (int, float)):
            running += abs(delta)
            touched += 1
        elif event == "purge":
            # purge drops a stale log row WITHOUT a real weight change (per
            # its own "no refund" semantics in read_deduction_audit.py) -
            # printed for visibility but not applied to the running total.
            ts = (e.get("ts") or "")[:19].replace("T", " ")
            print(f"{ts:<21} {'purge':<8} {'(none)':>8} {running:>9.2f}  {e.get('printName') or e.get('printKey','?')} [{e.get('source','?')}] - not applied")
            continue
        else:
            continue

        ts = (e.get("ts") or "")[:19].replace("T", " ")
        print(f"{ts:<21} {event:<8} {delta:>8.2f} {running:>9.2f}  {e.get('printName') or e.get('printKey','?')} [{e.get('source','?')}]")

    print("-" * 100)
    print(f"entries touching this spool: {touched}")
    print(f"RECONSTRUCTED remaining from full ledger replay: {running:.2f}g")
    print(f"LIVE remaining per current KV state:              {live_remaining}")
    if live_remaining is not None:
        print(f"difference (live - reconstructed): {live_remaining - running:.2f}g")

    print()
    all_ts = [e.get("ts") for e in entries if e.get("ts")]
    if all_ts:
        print(f"audit log itself covers {min(all_ts)[:19]} .. {max(all_ts)[:19]}  "
              f"(cap is 2000 entries total, oldest trimmed first - "
              f"if this starts well after spool creation {SPOOL_CREATED[:19]}, "
              f"early deductions for THIS spool may be missing from the replay above)")


if __name__ == "__main__":
    main()
