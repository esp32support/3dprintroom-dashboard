"""
Publishes master's MQTT OTA command, the same payload /api/trigger-ota
builds (see that Function) - just from CI instead of the dashboard form,
so a firmware roll-out follows the same automated path as everything else
here. Master re-checks username/password itself before downloading or
flashing anything (see ota_manager.cpp otaMqttHandleCommand), so this is
defense in depth, not the only gate.

All credentials come from GitHub Actions secrets - nothing sensitive is
committed. Temporary, remove after use.
"""
import json
import os
import sys
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
OTA_CMD_TOPIC = "ifix/printerroom/jole2026/ota/cmd"

# Stable Contents API URL, same form CYD's own OTA uses - not a short-lived
# derived download_url, since nothing here refreshes one at flash time.
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
        # GitHub's Contents API returns base64 JSON by default; .raw asks
        # for the actual binary, which is what Update.h expects to stream.
        "acceptHeader": "application/vnd.github.raw",
        "target": "firmware",
    })

    published = {"ok": False}

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc != 0:
            log(f"connect failed rc={rc}")
            c.disconnect()
            return
        # retain=False: this is a one-shot command, not state. A retained
        # command would be re-delivered - and re-executed - every time the
        # device resubscribes, i.e. on every single reconnect.
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
