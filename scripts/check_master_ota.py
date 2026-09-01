"""
Reads master's own room topic for the OTA status fields it publishes
(otaBusy / otaProgress / otaStatus) - /api/status doesn't expose them, but
mqttPublish() does. Tells us whether the OTA is still downloading, or
which setStatus() state it died in (Bad URL / Download failed / Low heap /
Error). Temporary, remove after use.
"""
import json
import os
import time

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
ROOM_TOPIC = "ifix/printerroom/jole2026"


def log(msg):
    print(msg, flush=True)


def main():
    seen = []

    def on_message(c, userdata, msg):
        try:
            seen.append(json.loads(msg.payload.decode()))
        except Exception:
            pass

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(ROOM_TOPIC)

    client = mqtt.Client(client_id="check-master-ota", protocol=mqtt.MQTTv311)
    client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
    client.tls_set()
    client.on_message = on_message
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()

    # Sample a few publishes so a progressing download is visible as a
    # changing percentage rather than one ambiguous snapshot.
    for _ in range(50):
        if len(seen) >= 3:
            break
        time.sleep(0.5)

    client.loop_stop()

    if not seen:
        log("no room-topic message received")
        return

    for i, p in enumerate(seen, 1):
        log(f"sample {i}: otaBusy={p.get('otaBusy')} "
            f"otaProgress={p.get('otaProgress')} "
            f"otaStatus={p.get('otaStatus')!r} "
            f"uptime={p.get('uptime')} firmware={p.get('firmware')}")


if __name__ == "__main__":
    main()
