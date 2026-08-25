"""
One-off, read-only audit: checks the last several print history entries
against deductionLog/processedPrints, specifically flagging any non-FINISH
(cancelled/failed/paused) entry that has a NONZERO deduction logged - that
would violate the documented design (see app.js's processFilamentDeductions).
Also dumps the live Fossil Gray filament entry as currently reported both
by the KV library (dashboard's source of truth) and the CYD-relayed MQTT
filament topic, to check for a sync mismatch between the two.

Not wired into the scheduled workflow - run by hand via workflow_dispatch,
then removed again.
"""
import json
import os
import time
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"
FILAMENT_TOPIC = "ifix/printerroom/jole2026/filament"
FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-recent-deductions-github-actions)"


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_retained(topic, hivemq_user, hivemq_pass, timeout_s=10):
    got = {}

    def on_message(c, userdata, msg):
        got["payload"] = json.loads(msg.payload.decode())
        c.disconnect()

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(topic)
        else:
            log(f"MQTT connect failed rc={rc}")
            c.disconnect()

    client = mqtt.Client(client_id=f"gh-actions-audit-{topic.split('/')[-1]}", protocol=mqtt.MQTTv311)
    client.username_pw_set(hivemq_user, hivemq_pass)
    client.tls_set()
    client.on_message = on_message
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()

    for _ in range(timeout_s * 5):
        if "payload" in got:
            break
        time.sleep(0.2)

    client.loop_stop()
    return got.get("payload")


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    snapshot = fetch_retained(PRINTER_TOPIC, hivemq_user, hivemq_pass)
    if not snapshot:
        log("no live printer snapshot received - aborting")
        return

    history = (snapshot.get("history") or [])[:8]

    lib = fetch_filament_library(sync_secret)
    deduction_log = lib.get("deductionLog") or {}
    processed = set(lib.get("processedPrints") or [])
    overrides = lib.get("historyOverrides") or {}

    log(f"=== LAST {len(history)} HISTORY ENTRIES ===")
    log("=" * 100)

    any_bug = False

    for item in history:
        name = item.get("name", "?")
        start = item.get("start", "")
        end = item.get("end", "")
        outcome = item.get("outcome", "")
        layers = item.get("layers")
        key = f"{name}__{start}"

        has_deduction = key in deduction_log
        deducted_grams = sum(deduction_log.get(key, {}).values()) if has_deduction else 0
        finished = outcome == "FINISH"

        flag = ""
        if not finished and deducted_grams > 0:
            flag = "  <-- BUG: non-FINISH print with NONZERO deduction!"
            any_bug = True
        elif finished and not has_deduction and key not in overrides:
            flag = "  <-- FLAG: completed print with ZERO deduction"
            any_bug = True

        log(f"[{outcome or 'FINISH'}] {name}")
        log(f"    start={start} end={end} layers={layers}")
        log(f"    key={key}")
        log(f"    processed={key in processed} deductionLog={has_deduction} grams={deducted_grams:.2f} override={key in overrides}{flag}")
        log("-" * 100)

    log("")
    log("NO bugs found in the deduction pattern above" if not any_bug else "BUGS FOUND - see <-- markers above")

    log("")
    log("=== FOSSIL GRAY: KV library (dashboard's source of truth) ===")
    for f in lib.get("filaments", []):
        if "fossil" in f.get("color", "").lower() or "fossil" in f.get("material", "").lower():
            log(json.dumps(f, indent=2))

    log("")
    log("=== FOSSIL GRAY: live CYD-relayed filament topic (what CYD's screen shows) ===")
    filament_snapshot = fetch_retained(FILAMENT_TOPIC, hivemq_user, hivemq_pass)
    if filament_snapshot:
        for f in filament_snapshot.get("filaments", []):
            if "fossil" in f.get("color", "").lower() or "fossil" in f.get("material", "").lower():
                log(json.dumps(f, indent=2))
    else:
        log("no live filament snapshot received")


if __name__ == "__main__":
    main()
