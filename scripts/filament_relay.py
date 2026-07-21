"""
One-shot filament-library relay: fetches the dashboard's inventory over
HTTPS and republishes a trimmed copy to HiveMQ, retained, so the CYD's
display can read it over its own already-open HiveMQ connection instead
of needing a third concurrent TLS session it can't reliably hold open
(see cyd-display's ui/format.h / printer/cloud_publish.cpp for the
on-device side of this).

Runs to completion and exits - meant to be invoked on a schedule (GitHub
Actions cron) rather than staying resident like the original PC daemon
version of this same job.
"""
import json
import os
import sys
import urllib.request

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
FILAMENT_TOPIC = "ifix/printerroom/jole2026/filament"
FILAMENT_API_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"


def log(msg):
    print(msg, flush=True)


def fetch_filament_library(sync_secret):
    req = urllib.request.Request(FILAMENT_API_URL, headers={
        "X-Sync-Secret": sync_secret,
        # Cloudflare's bot protection blocks the default Python urllib
        # User-Agent outright (403) - a browser-looking UA gets through.
        "User-Agent": "Mozilla/5.0 (compatible; filament-relay-github-actions)",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def trim_library(lib):
    return {
        "filaments": [
            {
                "material": f.get("material", ""),
                "colorHex": f.get("colorHex", ""),
                "spools": [
                    {"total": s.get("total", 0), "remaining": s.get("remaining", 0)}
                    for s in f.get("spools", [])
                ],
            }
            for f in lib.get("filaments", [])
        ]
    }


def main():
    sync_secret = os.environ["FILAMENT_SYNC_SECRET"]
    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    lib = fetch_filament_library(sync_secret)
    trimmed = trim_library(lib)
    payload = json.dumps(trimmed)
    log(f"fetched {len(trimmed['filaments'])} filaments ({len(payload)} bytes)")

    published = {"ok": False}

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc != 0:
            log(f"connect failed rc={rc}")
            c.disconnect()
            return
        result = c.publish(FILAMENT_TOPIC, payload, retain=True, qos=1)
        result.wait_for_publish(timeout=10)
        published["ok"] = result.is_published()
        c.disconnect()

    client = mqtt.Client(client_id="gh-actions-filament-relay", protocol=mqtt.MQTTv311)
    client.username_pw_set(hivemq_user, hivemq_pass)
    client.tls_set()
    client.on_connect = on_connect
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_forever()

    if not published["ok"]:
        log("publish did not complete")
        sys.exit(1)

    log("published ok")


if __name__ == "__main__":
    main()
