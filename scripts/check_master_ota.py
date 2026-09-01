"""Temporary: verify master now publishes plugInfo. Remove after use."""
import json, os, time
import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
POWER_TOPIC = "ifix/printerroom/jole2026/power"
got = {}

def on_message(c, u, msg):
    try:
        got["p"] = json.loads(msg.payload.decode())
    except Exception:
        pass

def on_connect(c, u, f, rc, properties=None):
    if rc == 0:
        c.subscribe(POWER_TOPIC)

client = mqtt.Client(client_id="check-pluginfo", protocol=mqtt.MQTTv311)
client.username_pw_set(os.environ["HIVEMQ_USER"], os.environ["HIVEMQ_PASS"])
client.tls_set()
client.on_message = on_message
client.on_connect = on_connect
client.connect(HIVEMQ_HOST, 8883, keepalive=30)
client.loop_start()
for _ in range(80):
    if "p" in got and "plugInfo" in got["p"]:
        break
    time.sleep(0.5)
client.loop_stop()

p = got.get("p")
print(json.dumps(p, indent=2), flush=True)
print("", flush=True)
print("=> plugInfo: " + (repr(p.get("plugInfo")) if p and "plugInfo" in p else "STILL MISSING"), flush=True)
