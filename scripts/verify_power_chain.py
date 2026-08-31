"""
Verifies the full power chain after master's OTA: reads the retained
power topic (published by master's power_client.cpp after polling the
Tasmota plug over HTTP) and the room topic (for master's own reset reason
/ uptime, confirming it actually rebooted into the new build).
Temporary, remove after use.
"""
import json
import os
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
POWER_TOPIC = "ifix/printerroom/jole2026/power"
ROOM_TOPIC = "ifix/printerroom/jole2026"


def log(msg):
    print(msg, flush=True)


def main():
    got = {}

    def on_message(c, userdata, msg):
        try:
            got[msg.topic] = json.loads(msg.payload.decode())
        except Exception as e:
            got[msg.topic] = f"<unparseable: {e}>"

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(POWER_TOPIC)
            c.subscribe(ROOM_TOPIC)

    client = mqtt.Client(client_id="verify-power-chain", protocol=mqtt.MQTTv311)
    client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
    client.tls_set()
    client.on_message = on_message
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()

    # Longer than the room topic's own publish interval so a live (not just
    # retained) message has a chance to land.
    for _ in range(90):
        if POWER_TOPIC in got and ROOM_TOPIC in got:
            break
        time.sleep(0.5)

    client.loop_stop()

    log("=== POWER topic (master -> plug at 192.168.1.74) ===")
    log(json.dumps(got.get(POWER_TOPIC), indent=2))

    log("")
    room = got.get(ROOM_TOPIC)
    if isinstance(room, dict):
        log("=== master identity / boot state ===")
        log(json.dumps({
            "firmware": room.get("firmware"),
            "resetReason": room.get("resetReason"),
            "uptime": room.get("uptime"),
            "bootCountTotal": room.get("bootCountTotal"),
        }, indent=2))
    else:
        log(f"=== room topic ===\n{room}")


if __name__ == "__main__":
    main()
