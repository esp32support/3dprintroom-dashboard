"""
Round-trip self-test for /api/deduction-audit: posts one entry in exactly
the shape app.js emits for a real deduction, then reads it back, so the
append path, the storage shape and the reader's formatting are all proven
against real data rather than assumed.

Writes ONE clearly-labelled row into the audit log. Temporary, remove
after use.
"""
import json
import os
import urllib.request

BASE = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit"
USER_AGENT = "Mozilla/5.0 (compatible; audit-selftest-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    # Mirrors the deduct-row shape built in processFilamentDeductions:
    # a slot-assignment-driven hit on Fossil Gray, the exact case that was
    # being mis-attributed before the fix.
    entry = {
        "ts": "2026-08-25T18:30:00.000Z",
        "printKey": "SELF-TEST__2026-08-25 18:30:00",
        "printName": "SELF-TEST (audit plumbing check, not a real print)",
        "printStart": "2026-08-25 18:30:00",
        "event": "deduct",
        "source": "override-single",
        "sourceHex": "BBBBBB",
        "sourceMaterial": "PLA",
        "slotIndex": 1,
        "viaSlotAssignment": True,
        "weightClaimed": 50.0,
        "filamentId": "d0a9v8by",
        "filamentColor": "Fossil Gray",
        "filamentColorHex": "BBBBBB",
        "filamentMaterial": "PLA",
        "spoolId": "v1c4t151",
        "alreadyDeducted": 0,
        "delta": 50.0,
        "remainingBefore": 750.0,
        "remainingAfter": 700.0,
    }

    body = json.dumps({"entries": [entry]}).encode()
    req = urllib.request.Request(BASE, data=body, method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        log(f"POST -> {json.loads(resp.read())}")

    req = urllib.request.Request(f"{BASE}?limit=5", headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    log(f"GET  -> count={data.get('count')}")
    for e in data.get("entries", []):
        log(json.dumps(e, indent=2))


if __name__ == "__main__":
    main()
