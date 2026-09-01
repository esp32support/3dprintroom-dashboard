"""Temporary: confirm the printer is genuinely idle before doing OTA work
on master. Remove after use."""
import json
import os
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"

got = {}


def on_message(c, u, msg):
    try:
        got["p"] = json.loads(msg.payload.decode())
    except Exception:
        pass


def on_connect(c, u, f, rc, properties=None):
    if rc == 0:
        c.subscribe(PRINTER_TOPIC)


client = mqtt.Client(client_id="check-idle", protocol=mqtt.MQTTv311)
client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
client.tls_set()
client.on_message = on_message
client.on_connect = on_connect
client.connect(HIVEMQ_HOST, 8883, keepalive=30)
client.loop_start()
for _ in range(50):
    if "p" in got:
        break
    time.sleep(0.2)
client.loop_stop()

p = got.get("p")
print(json.dumps({
    "gcodeState": p.get("gcodeState") if p else None,
    "now": p.get("now") if p else None,
}, indent=2), flush=True)
