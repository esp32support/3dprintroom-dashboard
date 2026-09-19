import json
import os
import time
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
POWER_TOPIC = "ifix/printerroom/jole2026/power"


def main():
    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    got = {}

    def on_message(c, userdata, msg):
        got["payload"] = json.loads(msg.payload.decode())
        c.disconnect()

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(POWER_TOPIC)
        else:
            print(f"MQTT connect failed rc={rc}")
            c.disconnect()

    client = mqtt.Client(client_id="gh-actions-power-check", protocol=mqtt.MQTTv311)
    client.username_pw_set(hivemq_user, hivemq_pass)
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

    print("full power payload:", json.dumps(got.get("payload")))

    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(
        "https://3dprintroom-dashboard.pages.dev/api/power-history?days=31",
        headers={"X-Sync-Secret": secret, "User-Agent": "Mozilla/5.0 (compatible; check-github-actions)"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
        total = sum(d.get("kwh", 0) for d in data.get("days", []))
        print(f"sum of all {len(data.get('days', []))} day records: {total}")
        print(json.dumps([(d["date"], d["kwh"]) for d in data.get("days", [])]))


if __name__ == "__main__":
    main()
