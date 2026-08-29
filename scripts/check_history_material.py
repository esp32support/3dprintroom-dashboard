"""
One-shot: reads CYD's own retained "history" array (device-recorded, the
compact "trayId:color:type:remainDelta%" strings) for the two recent PETG
prints, to check whether the material got baked in wrong at print-start
capture time. Temporary, remove after use.
"""
import json
import os
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"


def log(msg):
    print(msg, flush=True)


def main():
    got = {}

    def on_message(c, userdata, msg):
        got["payload"] = json.loads(msg.payload.decode())
        c.disconnect()

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(PRINTER_TOPIC)

    client = mqtt.Client(client_id="check-history-material", protocol=mqtt.MQTTv311)
    client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
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

    p = got.get("payload")
    if not p:
        log("no retained payload received")
        return

    log(f"displayVersion: {p.get('displayVersion')}")
    log(f"now: {p.get('now')}")
    log("")
    log("=== full history array (device-recorded) ===")
    for h in p.get("history", []):
        log(json.dumps(h))


if __name__ == "__main__":
    main()
