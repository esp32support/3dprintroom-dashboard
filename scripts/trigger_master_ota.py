"""Temporary: publish master's MQTT OTA command. Remove after use."""
import json, os, sys, time
import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
OTA_CMD_TOPIC = "ifix/printerroom/jole2026/ota/cmd"
FIRMWARE_URL = ("https://api.github.com/repos/esp32support/3dprintroom-firmware"
                "/contents/firmware.bin?ref=main")

command = json.dumps({
    "username": os.environ["MASTER_OTA_USERNAME"],
    "password": os.environ["MASTER_OTA_PASSWORD"],
    "url": FIRMWARE_URL,
    "authHeader": "Bearer " + os.environ["FIRMWARE_READ_TOKEN"],
    "acceptHeader": "application/vnd.github.raw",
    "target": "firmware",
})
published = {"ok": False}

def on_connect(c, u, f, rc, properties=None):
    if rc != 0:
        print(f"connect failed rc={rc}", flush=True); c.disconnect(); return
    c.publish(OTA_CMD_TOPIC, command, retain=False, qos=0)
    published["ok"] = True
    time.sleep(1)
    c.disconnect()

client = mqtt.Client(client_id="gh-actions-master-ota", protocol=mqtt.MQTTv311)
client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
client.tls_set()
client.on_connect = on_connect
client.connect(HIVEMQ_HOST, 8883, keepalive=30)
client.loop_forever()

if not published["ok"]:
    sys.exit(1)
print("OTA command published", flush=True)
