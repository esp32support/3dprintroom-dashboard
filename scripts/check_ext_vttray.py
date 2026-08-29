"""
One-shot: reads the current retained printer MQTT snapshot's tray 254
(external spool) entry - is Bambu's own vt_tray report still claiming
yellow despite the user having physically removed the spool? If so, this
is upstream of both CYD and the dashboard (vt_tray comes straight from
Bambu Cloud, not detected by anything local) - a manual/software setting
in Bambu Studio, not a bug in this codebase. Temporary, remove after use.
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

    client = mqtt.Client(client_id="check-ext-vttray", protocol=mqtt.MQTTv311)
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

    trays = p.get("trays", [])
    ext = next((t for t in trays if t.get("id") == 254), None)

    log(f"trayNow: {p.get('trayNow')}")
    log(f"gcodeState: {p.get('gcodeState')}")
    log(f"now: {p.get('now')}")
    log(f"EXT (254) raw entry: {json.dumps(ext)}")
    log(f"all trays: {json.dumps(trays)}")


if __name__ == "__main__":
    main()
