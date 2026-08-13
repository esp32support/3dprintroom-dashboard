"""
One-off, read-only audit: cross-references the live print history (from
CYD's own retained MQTT status) against the filament library's deductionLog
to answer "did every finished print actually get deducted, and were
cancelled/failed prints left alone as designed (see app.js's
processFilamentDeductions - outcome != FINISH is skipped on purpose, since
the Task API's weight is a full-print estimate that doesn't shrink to match
a cancelled run)."

Not wired into the scheduled workflow - run by hand via workflow_dispatch
when asked to sanity-check deductions, then can be removed again.
"""
import json
import os
import time
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"
FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-deductions-github-actions)"


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

    client = mqtt.Client(client_id="gh-actions-audit-deductions", protocol=mqtt.MQTTv311)
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

    snapshot = fetch_live_snapshot(hivemq_user, hivemq_pass)
    if not snapshot:
        log("no live snapshot received - aborting")
        return

    history = snapshot.get("history") or []
    log(f"device history entries: {len(history)}")

    lib = fetch_filament_library(sync_secret)
    deduction_log = lib.get("deductionLog") or {}
    processed = set(lib.get("processedPrints") or [])
    overrides = lib.get("historyOverrides") or {}

    log(f"processedPrints: {len(processed)}  deductionLog keys: {len(deduction_log)}  historyOverrides: {len(overrides)}")
    log("")
    log("=" * 100)

    for item in history:
        name = item.get("name", "?")
        start = item.get("start", "")
        end = item.get("end", "")
        outcome = item.get("outcome", "")
        layers = item.get("layers")
        key = f"{name}__{start}"

        has_deduction = key in deduction_log
        deducted_grams = sum(deduction_log.get(key, {}).values()) if has_deduction else 0
        has_override = key in overrides
        is_processed = key in processed

        finished = outcome == "FINISH"
        status = "COMPLETED" if finished else f"NOT-FINISH ({outcome or 'no outcome field'})"

        flag = ""
        if finished and not has_deduction and not has_override:
            flag = "  <-- FLAG: completed print with ZERO deduction logged"
        elif not finished and has_deduction:
            flag = f"  (deducted anyway - has_override={has_override}, {deducted_grams:.1f}g logged)"
        elif not finished and not has_deduction:
            flag = "  (0g deducted - by design unless manually corrected)"

        log(f"[{status}] {name}")
        log(f"    start={start} end={end} layers={layers}")
        log(f"    key={key}")
        log(f"    processed={is_processed} deductionLog={has_deduction} ({deducted_grams:.1f}g) override={has_override}{flag}")
        log("-" * 100)

    log("")
    log("Legend: FLAG lines are the ones worth a human look. Everything else is")
    log("either a normal completed+deducted print, or a cancelled/failed print")
    log("correctly left at 0g per the documented design in app.js's")
    log("processFilamentDeductions().")


if __name__ == "__main__":
    main()
