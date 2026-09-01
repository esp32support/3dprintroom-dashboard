"""Temp verification script - confirms the printer is idle before a master
OTA for the Timer feature. Deleted after use, per this project's established
temp-script-via-GitHub-Actions pattern (never embed credentials directly,
only reference GitHub Actions secrets from the calling workflow)."""
import json
import os
import time

import paho.mqtt.client as mqtt

# Not a secret - same public cluster hostname hardcoded in every other
# script in this directory (filament_relay.py, print_watch.py, power_watch.py).
HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
USER = os.environ["HIVEMQ_USER"]
PASS = os.environ["HIVEMQ_PASS"]
TOPIC = "ifix/printerroom/jole2026/printer"

result = {}


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        result["gcodeState"] = data.get("gcodeState")
        result["subtaskName"] = data.get("subtaskName")
    except Exception as e:
        result["error"] = str(e)
    client.disconnect()


client = mqtt.Client()
client.username_pw_set(USER, PASS)
client.tls_set()
client.on_message = on_message
client.connect(HOST, 8883, 60)
client.subscribe(TOPIC)
client.loop_start()

for _ in range(15):
    if result:
        break
    time.sleep(1)

client.loop_stop()

print(json.dumps(result))
