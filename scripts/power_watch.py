"""
One-shot power-history sampler: reads the smart plug's latest relayed
reading off HiveMQ (retained message, same pattern as print_watch.py's
fetch_live_snapshot) and pushes it to /api/power-history, which merges it
into that UTC day's running min/max/average in Cloudflare KV.

The workflow itself runs every 5 minutes (same cron as the other sync
jobs), but this only actually writes to KV once per hour (see the
top-of-hour check in main()) - filament_relay.py and print_watch.py
already had to be throttled once before to stay under Cloudflare's free
KV tier write limit (1000/day per namespace), and writing every 5
minutes here (288/day) would eat a big chunk of that budget for a
feature that doesn't need 5-minute resolution - a day's min/max/average
is still meaningful from ~24 samples spread across the day.
"""
import datetime
import json
import os
import time
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
POWER_TOPIC = "ifix/printerroom/jole2026/power"

HISTORY_URL = "https://3dprintroom-dashboard.pages.dev/api/power-history"

USER_AGENT = "Mozilla/5.0 (compatible; power-watch-github-actions)"


def log(msg):
    print(msg, flush=True)


def fetch_live_snapshot(hivemq_user, hivemq_pass):
    got = {}

    def on_message(c, userdata, msg):
        got["payload"] = json.loads(msg.payload.decode())
        c.disconnect()

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            c.subscribe(POWER_TOPIC)
        else:
            log(f"MQTT connect failed rc={rc}")
            c.disconnect()

    client = mqtt.Client(client_id="gh-actions-power-watch", protocol=mqtt.MQTTv311)
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
    return got.get("payload")


def push_sample(sync_secret, date_str, w, v, a, kwh):
    data = json.dumps({"date": date_str, "w": w, "v": v, "a": a, "kwh": kwh}).encode()
    req = urllib.request.Request(HISTORY_URL, data=data, method="POST", headers={
        "X-Sync-Secret": sync_secret,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    # Workflow cron fires every 5 minutes; only act on the run closest to
    # the top of the hour (minute 0-4) so this writes to KV ~24 times/day
    # instead of ~288 - see the module docstring for why.
    now = datetime.datetime.now(datetime.timezone.utc)

    if now.minute >= 5:
        log(f"not top of the hour ({now.isoformat()}) - skipping to limit KV writes")
        return

    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    snapshot = fetch_live_snapshot(hivemq_user, hivemq_pass)

    if not snapshot:
        log("no live power snapshot received this run - skipping")
        return

    # master publishes {"online": false, "error": "..."} (no powerW/
    # voltage/current fields) when it can't reach the plug - see
    # power_client.cpp's logFailure(). Without this check, .get("powerW", 0)
    # silently defaulted to 0 and got recorded as a genuine zero-power
    # reading. Confirmed live: three days of history (2026-08-25..27) came
    # out as 58-71 samples each, ALL zero, minW/maxW/avgW entirely
    # meaningless - the plug was offline that whole stretch (worsened by
    # the workflow_dispatch spam incident hammering this exact job during
    # the same window), and every single sample was this fake zero rather
    # than a real reading.
    if snapshot.get("online") is False:
        log(f"plug reported offline ({snapshot.get('error', 'no reason given')}) - skipping, not recording a fake zero")
        return

    w = snapshot.get("powerW", 0)
    v = snapshot.get("voltage", 0)
    a = snapshot.get("current", 0)
    kwh = snapshot.get("todayKwh", 0)

    date_str = now.strftime("%Y-%m-%d")

    result = push_sample(sync_secret, date_str, w, v, a, kwh)
    log(f"recorded sample for {date_str}: {w}W {v}V {a}A today={kwh}kWh -> {result}")


if __name__ == "__main__":
    main()
