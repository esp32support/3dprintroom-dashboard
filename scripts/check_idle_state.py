"""
One-shot: reads the current retained printer MQTT snapshot to check
whether the BROADCAST itself says the print is idle (a CYD/broker-side
publish problem) or genuinely reports RUNNING (meaning the bug is in the
dashboard's own idle/holdingLastJob computation or its live tab going
stale). Temporary, remove after use.
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

    client = mqtt.Client(client_id="check-idle-state", protocol=mqtt.MQTTv311)
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
        "gcodeState": p.get("gcodeState"),
        "subtaskName": p.get("subtaskName"),
        "currentStart": p.get("currentStart"),
        "currentEnd": p.get("currentEnd"),
        "now": p.get("now"),
        "uptime": p.get("uptime"),
        "layerNum": p.get("layerNum"),
        "totalLayerNum": p.get("totalLayerNum"),
        "displayVersion": p.get("displayVersion"),
    }, indent=2))


if __name__ == "__main__":
    main()
