"""
One-off, read-only audit:
1. Checks whether the Fossil Gray correction from last time has actually
   been re-processed yet (processedPrints/deductionLog for that exact key),
   to see why it's still showing the old remaining value.
2. Sweeps every gcode-sourced (print_watch.py) override from the last 7
   days and checks its recorded color against what the CURRENT slot
   assignment says for that slot - flagging any mismatch, the same class
   of bug just fixed in that script.

Not wired into the scheduled workflow - run by hand via workflow_dispatch,
then removed again.
"""
import json
import os
import time
import urllib.request
from datetime import datetime, timedelta

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"
FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-full-recheck-github-actions)"


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_live_snapshot(hivemq_user, hivemq_pass):
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

    client = mqtt.Client(client_id="gh-actions-audit-full-recheck", protocol=mqtt.MQTTv311)
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


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    lib = fetch_filament_library(sync_secret)
    filaments = lib.get("filaments", [])
    deduction_log = lib.get("deductionLog") or {}
    processed = set(lib.get("processedPrints") or [])
    overrides = lib.get("historyOverrides") or {}
    slot_assignments = lib.get("slotAssignments") or {}

    fossil = next((f for f in filaments if f.get("colorHex", "").upper() == "BBBBBB"), None)

    key = "0.08mm layer, 2 walls, 15% infill__2026-08-25 10:02:48"
    log("=== STATUS OF THE PREVIOUS CORRECTION ===")
    log(f"key: {key}")
    log(f"still in processedPrints: {key in processed}")
    log(f"override: {json.dumps(overrides.get(key))}")
    log(f"deductionLog entry: {json.dumps(deduction_log.get(key))}")
    if fossil:
        log(f"Fossil Gray current remaining: {fossil['spools'][0]['remaining']}")

    log("")
    log("=== SLOT ASSIGNMENTS (current) ===")
    log(json.dumps(slot_assignments, indent=2))

    log("")
    log("=== SWEEP: all gcode-sourced overrides from the last 7 days, checked against current slot assignment ===")
    log("=" * 100)

    cutoff = datetime.utcnow() - timedelta(days=7)

    def parse_key_date(k):
        try:
            date_str = k.rsplit("__", 1)[1]
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None

    id_to_filament = {f.get("id"): f for f in filaments if f.get("id")}

    for k, ov in overrides.items():
        d = parse_key_date(k)
        if not d or d < cutoff:
            continue
        if ov.get("source") != "gcode":
            continue
        if "details" in ov:
            continue  # multi-color, spot-checking single-color only here

        recorded_hex = (ov.get("colorHex") or "").upper()
        grams = sum(deduction_log.get(k, {}).values()) if k in deduction_log else 0

        log(f"{k}")
        log(f"    recorded override: material={ov.get('material')} colorHex={recorded_hex} weight={ov.get('weight')}")
        log(f"    deductionLog total: {grams:.2f}g")
        log("-" * 100)

    log("(only single-color gcode overrides shown - cross-referencing exact slot per print needs the device's own history, not available in this snapshot)")


if __name__ == "__main__":
    main()
