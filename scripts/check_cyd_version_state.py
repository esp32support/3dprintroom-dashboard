"""
Compares what CYD is actually running (displayVersion on the printer
topic) against what's announced on the OTA version topic - CYD only shows
its update popup when those differ (see cloud_publish.cpp
otaUpdateAvailable()). Also confirms the retained announcement is really
on the broker. Temporary, remove after use.
"""
import json
import os
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
PRINTER_TOPIC = "ifix/printerroom/jole2026/printer"
OTA_VERSION_TOPIC = "ifix/printerroom/jole2026/display_ota_version"


def log(msg):
    print(msg, flush=True)


def main():
    got = {}

    def on_message(c, userdata, msg):
        try:
            got[msg.topic] = json.loads(msg.payload.decode())
        except Exception:
            got[msg.topic] = msg.payload.decode(errors="replace")

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(PRINTER_TOPIC)
            c.subscribe(OTA_VERSION_TOPIC)

    client = mqtt.Client(client_id="check-cyd-version", protocol=mqtt.MQTTv311)
    client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
    client.tls_set()
    client.on_message = on_message
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()

    for _ in range(60):
        if PRINTER_TOPIC in got and OTA_VERSION_TOPIC in got:
            break
        time.sleep(0.5)

    client.loop_stop()

    announced = got.get(OTA_VERSION_TOPIC)
    printer = got.get(PRINTER_TOPIC)

    log(f"announced on OTA topic : {json.dumps(announced)}")

    if isinstance(printer, dict):
        running = printer.get("displayVersion")
        log(f"CYD displayVersion     : {running}")
        log(f"CYD last published 'now': {printer.get('now')}")
        log(f"displayOtaBusy         : {printer.get('displayOtaBusy')}")
        log(f"wifiConnected          : {printer.get('wifiConnected')}")

        want = (announced or {}).get("version") if isinstance(announced, dict) else None
        if want and running:
            log("")
            log(f"popup expected? {'YES - versions differ' if want != running else 'NO - already up to date'}")
    else:
        log(f"printer topic          : {printer}")


if __name__ == "__main__":
    main()
