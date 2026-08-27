"""
One-shot: reads the current retained printer MQTT snapshot to confirm the
CYD OTA to 1.2.29 landed cleanly - running version, reset reason (should
now reflect the OTA-triggered reboot, not still "Power-on"), free heap,
connection state. Temporary, remove after use.
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
        else:
            log(f"connect failed rc={rc}")

    client = mqtt.Client(client_id="check-cyd-ota-state-2", protocol=mqtt.MQTTv311)
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

    log(json.dumps({
        "displayVersion": p.get("displayVersion"),
        "displayOtaBusy": p.get("displayOtaBusy"),
        "displayOtaStatus": p.get("displayOtaStatus"),
        "wifiConnected": p.get("wifiConnected"),
        "bambuConnected": p.get("bambuConnected"),
        "freeHeap": p.get("freeHeap"),
        "resetReason": p.get("resetReason"),
        "bootCountTotal": p.get("bootCountTotal"),
        "now": p.get("now"),
    }, indent=2))


if __name__ == "__main__":
    main()
