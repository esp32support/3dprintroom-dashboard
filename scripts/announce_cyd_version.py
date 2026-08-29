"""
One-shot: publishes a retained {"version": "..."} message on
MQTT_OTA_VERSION_TOPIC so CYD's own on-device popup and the dashboard's
"Update available" card both notice the new build. Does NOT trigger a
flash by itself. Temporary, remove after use.
"""
import json
import os
import sys
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
OTA_VERSION_TOPIC = "ifix/printerroom/jole2026/display_ota_version"
VERSION = "1.2.31"


def log(msg):
    print(msg, flush=True)


def main():
    payload = json.dumps({"version": VERSION})
    published = {"ok": False}

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc != 0:
            log(f"connect failed rc={rc}")
            c.disconnect()
            return
        c.publish(OTA_VERSION_TOPIC, payload, retain=True, qos=0)
        published["ok"] = True
        time.sleep(1)
        c.disconnect()

    client = mqtt.Client(client_id="announce-cyd-version", protocol=mqtt.MQTTv311)
    client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
    client.tls_set()
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_forever()

    if not published["ok"]:
        log("publish did not complete")
        sys.exit(1)

    log(f"announced version {VERSION}")


if __name__ == "__main__":
    main()
