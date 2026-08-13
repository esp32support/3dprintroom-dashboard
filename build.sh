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

# Cache busting. index.html referenced these by bare filename, so a browser
# tab that had already fetched app.js kept serving its cached copy after a
# deploy - confirmed live: a shipped fix appeared to "not work" for an hour
# purely because the open tab was still running the previous build's JS.
# Stamping the commit SHA onto each reference makes every deploy a new URL,
# so a plain reload can't miss it (no hard-refresh, no manual version bump).
# Falls back to a timestamp when built outside Pages, and the checked-in
# index.html keeps bare filenames so serving the directory locally still works.
ASSET_VERSION="${CF_PAGES_COMMIT_SHA:-$(date +%s)}"

sed -i \
    -e "s|href=\"style\.css\"|href=\"style.css?v=${ASSET_VERSION}\"|g" \
    -e "s|src=\"broker\.config\.js\"|src=\"broker.config.js?v=${ASSET_VERSION}\"|g" \
    -e "s|src=\"app\.js\"|src=\"app.js?v=${ASSET_VERSION}\"|g" \
    index.html

echo "Stamped asset version ${ASSET_VERSION} onto index.html"
