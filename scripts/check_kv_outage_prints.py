"""Temp check - the KV quota block ran 2026-09-05 15:15-23:11 UTC. This
fetches the device's own print history (MQTT retained snapshot) and Bambu's
Task API list, printing everything relevant so prints that started/ended in
that window can be checked against the deduction audit for anything fully
missed (not just delayed) during the outage."""
import json
import os
import ssl
import time
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"
TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
USER_AGENT = "Mozilla/5.0 (compatible; kv-outage-check-github-actions)"


def get_device_history():
    result = {}

    def on_connect(client, userdata, flags, rc, properties=None):
        client.subscribe(PRINTER_TOPIC)

    def on_message(client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode())
            result["history"] = data.get("history", [])
        except Exception as e:
            result["error"] = str(e)
        client.disconnect()

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
    client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()
    for _ in range(15):
        if "history" in result or "error" in result:
            break
        time.sleep(1)
    client.loop_stop()
    return result.get("history", [])


def get_task_api(secret):
    req = urllib.request.Request(TASK_URL, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read()).get("tasks", [])


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    history = get_device_history()
    print("=== DEVICE HISTORY (all entries) ===")
    for item in history:
        print(json.dumps(item))

    print()
    print("=== TASK API (last 10) ===")
    for t in get_task_api(secret):
        print(json.dumps({k: t.get(k) for k in ("id", "title", "weight", "startTime", "endTime")}))


if __name__ == "__main__":
    main()
