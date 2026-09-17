"""
Publishes a RETAINED MQTT message announcing a new CYD display firmware
version, on Config::MQTT_OTA_VERSION_TOPIC (see the 3DPrintRoomMonitorDisplay
project's cloud_publish.cpp). The device compares this against its own
running Config::VERSION and, if different, shows the on-device "Update
available" popup (Update now / Later) - this does NOT push or flash
anything by itself, it only surfaces the notification. The actual binary
must already be uploaded to the esp32support/3dprintroom-firmware repo
(the OTA_DOWNLOAD_URL target) before announcing it, or "Update now" will
fetch stale content.

Retained (not a one-shot command like the trigger-* topics) so a device
that reboots after this runs still sees the announcement on reconnect,
same reasoning as the other retained state topics in this project.
"""
import json
import os
import sys

import paho.mqtt.client as mqtt

HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud"
OTA_VERSION_TOPIC = "ifix/printerroom/jole2026/display_ota_version"


def log(msg):
    print(msg, flush=True)


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("OTA_VERSION", "")

    if not version:
        log("no version given (pass as argv[1] or OTA_VERSION env var) - aborting")
        sys.exit(1)

    hivemq_user = os.environ["HIVEMQ_USER"]
    hivemq_pass = os.environ["HIVEMQ_PASS"]

    payload = json.dumps({"version": version})

    client = mqtt.Client(client_id="gh-actions-announce-ota", protocol=mqtt.MQTTv311)
    client.username_pw_set(hivemq_user, hivemq_pass)
    client.tls_set()
    client.connect(HIVEMQ_HOST, 8883, keepalive=30)
    client.loop_start()

    info = client.publish(OTA_VERSION_TOPIC, payload, qos=1, retain=True)
    info.wait_for_publish(timeout=10)

    client.loop_stop()
    client.disconnect()

    log(f"announced version {version!r} on {OTA_VERSION_TOPIC} (retained, qos1, mid={info.mid}, published={info.is_published()})")


if __name__ == "__main__":
    main()
