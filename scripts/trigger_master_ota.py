"""
Publishes master's MQTT OTA command - same payload /api/trigger-ota
builds, just from CI. Master re-checks username/password itself before
downloading or flashing (ota_manager.cpp otaMqttHandleCommand), so this
is defense in depth rather than the only gate. All credentials come from
GitHub Actions secrets; nothing sensitive is committed.

Temporary, remove after use.
"""
import json
import os
import sys
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
OTA_CMD_TOPIC = "ifix/printerroom/jole2026/ota/cmd"

FIRMWARE_URL = ("https://api.github.com/repos/esp32support/3dprintroom-firmware"
                "/contents/firmware.bin?ref=main")


def log(msg):
    print(msg, flush=True)


def main():
    command = json.dumps({
        "username": os.environ["MASTER_OTA_USERNAME"],
        "password": os.environ["MASTER_OTA_PASSWORD"],
        "url": FIRMWARE_URL,
        "authHeader": "Bearer " + os.environ["FIRMWARE_READ_TOKEN"],
        "acceptHeader": "application/vnd.github.raw",
        "target": "firmware",
    })

    published = {"ok": False}

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc != 0:
            log(f"connect failed rc={rc}")
            c.disconnect()
            return
        # retain=False: one-shot command, not state. A retained command
        # would re-execute on every device resubscribe.
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
        log("publish did not complete")
        sys.exit(1)

    log("OTA command published - master will download, flash and reboot.")


if __name__ == "__main__":
    main()
