"""Temporary: read master's OTA status from its room topic."""
import json, os, time
import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
ROOM_TOPIC = "ifix/printerroom/jole2026"

seen = []

def on_message(c, u, msg):
    try:
        seen.append(json.loads(msg.payload.decode()))
    except Exception:
        pass

def on_connect(c, u, f, rc, properties=None):
    if rc == 0:
        c.subscribe(ROOM_TOPIC)

client = mqtt.Client(client_id="check-master-ota", protocol=mqtt.MQTTv311)
client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
client.tls_set()
client.on_message = on_message
client.on_connect = on_connect
client.connect(HIVEMQ_HOST, 8883, keepalive=30)
client.loop_start()
for _ in range(40):
    if len(seen) >= 2:
        break
    time.sleep(0.5)
client.loop_stop()

for i, p in enumerate(seen, 1):
    print(f"sample {i}: otaBusy={p.get('otaBusy')} otaProgress={p.get('otaProgress')} "
          f"otaStatus={p.get('otaStatus')!r} freeHeap={p.get('freeHeap')} "
          f"uptime={p.get('uptime')}", flush=True)
