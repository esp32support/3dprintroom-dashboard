#!/bin/sh
# Runs as the Cloudflare Pages build command. Generates broker.config.js from
# environment variables set in the Pages project's encrypted secrets store,
# so the real MQTT credential is never committed to git.
set -eu

cat > broker.config.js <<EOF
const BROKER_CONFIG = {
    host: "${MQTT_HOST}",
    port: 8884,
    username: "${MQTT_VIEWER_USERNAME}",
    password: "${MQTT_VIEWER_PASSWORD}",
    topic: "${MQTT_TOPIC}",
};
EOF

echo "Generated broker.config.js for host ${MQTT_HOST}"
