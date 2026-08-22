"""
One-off, read-only audit: checks a specific multi-attempt (pause/resume)
print's history entries against deductionLog/processedPrints, to confirm
whether it was deducted once, zero times, or (wrongly) more than once.

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
FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; audit-pause-resume-github-actions)"


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

    client = mqtt.Client(client_id="gh-actions-audit-pause-resume", protocol=mqtt.MQTTv311)
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

    lib = fetch_filament_library(sync_secret)
    deduction_log = lib.get("deductionLog") or {}
    processed = set(lib.get("processedPrints") or [])
    overrides = lib.get("historyOverrides") or {}

    targets = [h for h in history if h.get("start", "").startswith("2026-08-22 10:")]

    log(f"found {len(targets)} matching history entries on 2026-08-22 ~10:xx")
    log("=" * 100)

    total_deducted = 0.0

    for item in targets:
        name = item.get("name", "?")
        start = item.get("start", "")
        outcome = item.get("outcome", "")
        key = f"{name}__{start}"

        has_deduction = key in deduction_log
        grams = sum(deduction_log.get(key, {}).values()) if has_deduction else 0
        total_deducted += grams

        log(f"start={start} outcome={outcome or '(finish)'} processed={key in processed} deductionLog={has_deduction} grams={grams:.2f} override={key in overrides}")

    log("=" * 100)
    log(f"TOTAL deducted across all 3 entries: {total_deducted:.2f}g")


if __name__ == "__main__":
    main()
