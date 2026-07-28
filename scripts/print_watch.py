"""
Watches the printer's live MQTT status for a print finishing, then pushes
an accurate color/material/weight correction to the dashboard - without
needing LAN access to the printer's SD card.

Replaces gcode_sync_daemon.py's FTPS-based .bbl/gcode reading with two
already-reliable cloud-only sources:
  - color/material: the live AMS tray data in the printer's own MQTT
    report (this is what the CYD's screens already trust - Bambu's Task
    API color/slotId fields are the unreliable ones for SINGLE-color
    prints, confirmed live to sometimes fall back to a placeholder).
  - weight: Bambu Cloud's Task API (functions/api/printer-task.js), whose
    weight field (and, per-detail, the slicer's own per-tray weight split
    in amsDetailMapping) has been confirmed reliable in prior testing.

State (was a print running last check, which AMS trays were seen active
during it) persists in Cloudflare KV via /api/printer-watch-state - this
runs as a stateless step in a scheduled GitHub Actions job, not a
persistent process, so there's no in-memory state between runs the way
the old PC-resident daemon had.

Multi-color prints: Task API's own amsDetail already has a per-tray
weight breakdown from the slicer - the thing that's unreliable isn't the
WEIGHT, it's occasionally the SLOT ASSIGNMENT (which physical tray it
thinks each detail came from). This script already has independent,
trustworthy knowledge of which physical trays were ACTUALLY used (the
live tray_seen set, from the printer's own MQTT report) - so before
trusting Task API's per-tray breakdown, cross-check that the SET of
slots it claims matches the SET actually seen live. If they agree, Task
API's assignment for this print wasn't scrambled, and its per-tray
weights (genuinely from the slicer) can be pushed as a real, verified
multi-color correction. If they disagree, this stays conservative and
skips - same as it always did for multi-color, rather than guessing.
"""
import json
import os
import time
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"

STATE_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-watch-state"
TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
SYNC_URL = "https://3dprintroom-dashboard.pages.dev/api/gcode-sync"

USER_AGENT = "Mozilla/5.0 (compatible; print-watch-github-actions)"


def log(msg):
    print(msg, flush=True)


def api_get(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def api_post(url, secret, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "X-Sync-Secret": secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_live_snapshot(hivemq_user, hivemq_pass):
    """One retained-message read, not a persistent subscription - this
    process only needs the printer's LATEST report, published with
    retain=true by the CYD."""
    got = {}

    def on_message(c, userdata, msg):
        got["payload"] = json.loads(msg.payload.decode())
        c.disconnect()

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(PRINTER_TOPIC)
        else:
            log(f"MQTT connect failed rc={rc}")
            c.disconnect()

    client = mqtt.Client(client_id="gh-actions-print-watch", protocol=mqtt.MQTTv311)
    client.username_pw_set(hivemq_user, hivemq_pass)
    client.tls_set()
    client.on_message = on_message
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()

    for _ in range(50):
        if "payload" in got:
            break
        time.sleep(0.2)

    client.loop_stop()
    return got.get("payload")


def find_matching_task(tasks, subtask_name, current_start):
    candidates = [t for t in tasks if t.get("title") == subtask_name]

    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    # Multiple prints with the same name - prefer the one whose startTime
    # string is closest in length/lexical order to current_start as a
    # tiebreaker (exact format alignment between the two APIs isn't
    # guaranteed, so this is a best-effort match, not exact equality).
    candidates.sort(key=lambda t: abs(len(t.get("startTime", "")) - len(current_start)))
    return candidates[0]


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    snapshot = fetch_live_snapshot(hivemq_user, hivemq_pass)

    if not snapshot:
        log("no live snapshot received this run - skipping")
        return

    gcode_state = snapshot.get("gcodeState") or ""

    # "UNKNOWN" is the CYD's own boot-time sentinel default (printer_state.h),
    # published the moment its HiveMQ connection comes up but before its
    # Bambu Cloud connection has delivered a first real report - a window
    # every device reboot passes through (OTA update, power blip, WiFi
    # drop). Confirmed live: this GitHub Action polled during exactly that
    # window mid-print and logged "print finished" for a print that was
    # still running, only avoiding a bad push because the placeholder
    # snapshot's tray data was empty too. Treating "UNKNOWN" as a real
    # non-running state risks wiping tray_seen (multi-color tracking) or
    # pushing a partial-weight correction on a genuine reboot-timing hit -
    # skip the run entirely instead, same as no snapshot at all.
    if gcode_state == "UNKNOWN":
        log("live snapshot reports the device's own boot-time placeholder state - skipping")
        return

    subtask_name = snapshot.get("subtaskName") or ""
    current_start = snapshot.get("currentStart") or ""
    tray_now = snapshot.get("trayNow")
    trays = snapshot.get("trays", [])

    state = api_get(STATE_URL, sync_secret)

    was_running = state.get("gcodeState") == "RUNNING"
    now_running = gcode_state == "RUNNING"

    # 255 = "no tray selected" - a transient state during warmup/pauses/
    # filament changes, NOT a color. Counting it made genuine single-color
    # prints look multi-color (seen live: trayNowSeen=[3,255] for a pure
    # black print), which skipped the gcode-verification push entirely.
    # Discarded on load too, so state polluted before this fix self-heals.
    # 254 (external spool) is kept - that IS real filament being used.
    tray_seen = set(state.get("trayNowSeen", [])) - {255}

    # New print started (or a different one resumed) - reset tracking.
    if now_running and state.get("currentStart") != current_start:
        tray_seen = set()

    if now_running and tray_now is not None and tray_now != 255:
        tray_seen.add(tray_now)

    if was_running and not now_running and state.get("subtaskName") and state.get("currentStart"):
        log(f"print finished: {state['subtaskName']!r}, AMS trays seen: {sorted(tray_seen)}")

        if len(tray_seen) == 1:
            slot = next(iter(tray_seen))
            tray = next((t for t in trays if t.get("id") == slot), None)

            if tray and tray.get("color") and tray.get("type"):
                try:
                    task_data = api_get(TASK_URL, sync_secret)
                    match = find_matching_task(task_data.get("tasks", []), state["subtaskName"], state["currentStart"])

                    if match and match.get("weight"):
                        result = api_post(SYNC_URL, sync_secret, {
                            "printName": state["subtaskName"],
                            "startTime": state["currentStart"],
                            "material": tray["type"],
                            "colorHex": tray["color"][:6].upper(),
                            "weight": match["weight"],
                        })
                        log(f"pushed correction: {result}")
                    else:
                        log("no matching Task API weight found - skipping")
                except Exception as e:
                    log(f"correction push failed: {e}")
            else:
                log("no live tray data for the active slot - skipping")
        else:
            try:
                task_data = api_get(TASK_URL, sync_secret)
                match = find_matching_task(task_data.get("tasks", []), state["subtaskName"], state["currentStart"])
                ams_detail = (match or {}).get("amsDetail", [])
                task_slots = {d.get("slotId") for d in ams_detail if d.get("slotId") is not None}

                if match and ams_detail and task_slots == tray_seen:
                    details = [
                        {
                            "material": d["type"],
                            "colorHex": d["color"][:6].upper(),
                            "weight": d["weight"],
                        }
                        for d in ams_detail
                        if d.get("type") and d.get("color") and d.get("weight")
                    ]

                    if details:
                        result = api_post(SYNC_URL, sync_secret, {
                            "printName": state["subtaskName"],
                            "startTime": state["currentStart"],
                            "details": details,
                        })
                        log(f"pushed multi-color correction ({len(details)} colors): {result}")
                    else:
                        log("Task API slots matched live trays, but no usable detail weights - skipping")
                elif match:
                    log(f"Task API's AMS slots {sorted(task_slots)} don't match what was actually "
                        f"seen live {sorted(tray_seen)} - assignment looks scrambled, skipping "
                        "(same conservative behavior as before)")
                else:
                    log("no matching Task API task found - skipping")
            except Exception as e:
                log(f"multi-color correction push failed: {e}")

        tray_seen = set()  # reset tracking for the next print

    new_state = {
        "gcodeState": gcode_state,
        "subtaskName": subtask_name or state.get("subtaskName", ""),
        "currentStart": current_start or state.get("currentStart", ""),
        "trayNowSeen": sorted(tray_seen),
    }

    # Only write when something actually changed. This runs every ~2
    # minutes (720x/day) - an unconditional write burned through most of
    # Cloudflare KV's free-tier 1000 writes/day on idle no-op updates
    # alone (user hit the daily cap during normal use). An idle printer
    # produces an identical state every run, so skipping identical writes
    # keeps the quota for writes that matter.
    old_state = {
        "gcodeState": state.get("gcodeState", ""),
        "subtaskName": state.get("subtaskName", ""),
        "currentStart": state.get("currentStart", ""),
        "trayNowSeen": sorted(state.get("trayNowSeen", [])),
    }

    if new_state != old_state:
        api_post(STATE_URL, sync_secret, new_state)
        log(f"state updated: gcodeState={gcode_state!r}, trayNowSeen={sorted(tray_seen)}")
    else:
        log(f"state unchanged (gcodeState={gcode_state!r}) - skipping KV write")


if __name__ == "__main__":
    main()
