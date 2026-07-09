// Template for local testing only. Copy this file to broker.config.js and
// fill in real values to test on your own machine.
//
// The deployed site does NOT use this file - Cloudflare Pages generates the
// real broker.config.js at build time from encrypted environment variables
// via build.sh, so the credential never touches git. See README.md.
const BROKER_CONFIG = {
    host: "YOUR_CLUSTER.s1.eu.hivemq.cloud",
    port: 8884,
    username: "esp32-viewer",
    password: "CHANGE_ME",
    topic: "ifix/printerroom/jole2026",
};
