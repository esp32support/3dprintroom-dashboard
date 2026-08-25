"""
One-off bulk correction: every gcode-sourced (print_watch.py) single-color
override recorded as Basic Silver (C0C0C0) that has a NONZERO deductionLog
entry is corrected to Fossil Gray (BBBBBB), IF the raw Bambu Task API
confirms that print actually ran in AMS slot 1 (A2) - the slot that's been
assigned to Fossil Gray this whole time. Confirmed live: every single
candidate checked ran in slot 1, matching the systemic print_watch.py bug
(fixed going forward) that recorded the printer's own generic reported
color instead of the dashboard's explicit slot assignment.

Each correction pushed via /api/gcode-sync (same endpoint print_watch.py
itself uses) - this both fixes the override AND un-marks the print as
processed, so the dashboard will auto re-deduct the correct amount from
Fossil Gray on its next live tick. Does NOT touch Basic Silver's spool
weight - that still needs a manual "add back the total" correction via the
UI, since this script has no write access to spool weights directly.

Not wired into the scheduled workflow - run once by hand, then removed.
"""
import json
import os
import urllib.request

FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"
USER_AGENT = "Mozilla/5.0 (compatible; bulk-fix-fossil-github-actions)"

BAMBU_TOKEN = "AQCkmGqOZN785pMjPEBYMnP9-SrzvGkwGC1PphiEAES3dPCcC9IsE7yBN_4XMe00SnK7X2bbLa1ObZwptKQYQjAJg3VIvL4S8YTzd7fJHZYWreeKK7rplLLKOOPx_z8gqqr8QwUvxObsYw"
BAMBU_DEVICE_ID = "03900D610819984"


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_bambu_tasks():
    url = f"https://api.bambulab.com/v1/user-service/my/tasks?limit=50&deviceId={BAMBU_DEVICE_ID}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {BAMBU_TOKEN}",
        "User-Agent": "Mozilla/5.0",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read()).get("hits", [])


def push_correction(sync_secret, print_name, start_time, material, color_hex, weight):
    body = json.dumps({
        "printName": print_name,
        "startTime": start_time,
        "material": material,
        "colorHex": color_hex,
        "weight": weight,
    }).encode()

    req = urllib.request.Request(SYNC_URL, data=body, method="POST", headers={
        "X-Sync-Secret": sync_secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })

    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]

    lib = fetch_filament_library(sync_secret)
    deduction_log = lib.get("deductionLog") or {}
    overrides = lib.get("historyOverrides") or {}

    # Already fixed by hand last time - skip it here.
    already_fixed = "0.08mm layer, 2 walls, 15% infill__2026-08-25 10:02:48"

    candidates = []
    for key, colors in deduction_log.items():
        grams = colors.get("C0C0C0")
        if not grams or key == already_fixed:
            continue
        ov = overrides.get(key) or {}
        if ov.get("source") != "gcode":
            continue
        candidates.append((key, grams))

    log(f"found {len(candidates)} candidate C0C0C0 entries with real deductions")

    tasks = fetch_bambu_tasks()

    total_moved = 0.0
    fixed = []
    skipped = []

    for key, grams in candidates:
        name, start = key.rsplit("__", 1)

        # Match by title + rough time window (mirrors print_watch.py's own
        # find_matching_task tiebreak) to find this exact task's raw ams
        # slot data.
        matches = [t for t in tasks if t.get("title") == name]
        match = None
        for t in matches:
            # startTime is UTC ISO; local key has no offset info readily
            # comparable here without a full date library - just take the
            # closest weight match as a sanity cross-check instead, since
            # weight is already known precisely from deductionLog.
            if abs((t.get("weight") or 0) - grams) < 0.05:
                match = t
                break

        if not match:
            skipped.append((key, grams, "no matching task found"))
            continue

        slots = sorted(set(d.get("ams") for d in match.get("amsDetailMapping", [])))

        if slots != [1]:
            skipped.append((key, grams, f"ran in slot(s) {slots}, not just A2 - leaving as-is"))
            continue

        result = push_correction(sync_secret, name, start, "PLA", "BBBBBB", grams)
        fixed.append((key, grams))
        total_moved += grams
        log(f"corrected: {key} -> Fossil Gray ({grams:.2f}g) - {result}")

    log("")
    log(f"=== SUMMARY ===")
    log(f"Corrected {len(fixed)} entries, total {total_moved:.2f}g moved from Basic Silver to Fossil Gray")
    for key, grams, reason in skipped:
        log(f"SKIPPED: {key} ({grams:.2f}g) - {reason}")
    log("")
    log(f"Manual step still needed: add {total_moved:.2f}g back to Basic Silver's remaining weight via the UI")
    log(f"Fossil Gray will auto-correct on the next live dashboard tick (same as last time)")


if __name__ == "__main__":
    main()
