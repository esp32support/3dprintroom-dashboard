"""
Watches the printer's live MQTT status for a single-color print finishing,
then pushes an accurate color/material/weight correction to the dashboard -
without needing LAN access to the printer's SD card.

Replaces gcode_sync_daemon.py's FTPS-based .bbl/gcode reading with two
already-reliable cloud-only sources:
  - color/material: the live AMS tray data in the printer's own MQTT
    report (this is what the CYD's screens already trust - Bambu's Task
    API color/slotId fields are the unreliable ones, not this).
  - weight: Bambu Cloud's Task API (functions/api/printer-task.js), whose
    weight field has been confirmed reliable in prior testing this
    project - the color/slotId fields from that same API are what's
    unreliable, which this script never reads.

State (was a print running last check, which AMS trays were seen active
during it) persists in Cloudflare KV via /api/printer-watch-state - this
runs as a stateless step in a scheduled GitHub Actions job, not a
persistent process, so there's no in-memory state between runs the way
the old PC-resident daemon had.

Scope: single-color prints only, same limitation as before - there's
still no reliable way to split weight across colors for a genuine
multi-color print from any data source available.
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
    subtask_name = snapshot.get("subtaskName") or ""
    current_start = snapshot.get("currentStart") or ""
    tray_now = snapshot.get("trayNow")
    trays = snapshot.get("trays", [])

    state = api_get(STATE_URL, sync_secret)

    was_running = state.get("gcodeState") == "RUNNING"
    now_running = gcode_state == "RUNNING"

    tray_seen = set(state.get("trayNowSeen", []))

    # New print started (or a different one resumed) - reset tracking.
    if now_running and state.get("currentStart") != current_start:
        tray_seen = set()

    if now_running and tray_now is not None:
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
            log("multi-color print - no reliable per-color weight split, skipping (same as before)")

        tray_seen = set()  # reset tracking for the next print

    api_post(STATE_URL, sync_secret, {
        "gcodeState": gcode_state,
        "subtaskName": subtask_name or state.get("subtaskName", ""),
        "currentStart": current_start or state.get("currentStart", ""),
        "trayNowSeen": sorted(tray_seen),
    })

    log(f"state updated: gcodeState={gcode_state!r}, trayNowSeen={sorted(tray_seen)}")


if __name__ == "__main__":
    main()
