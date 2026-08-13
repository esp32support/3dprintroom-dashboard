// POST /api/trigger-cyd-ota
// Remotely starts the CYD display's own self-update (otaDownloadAndFlash())
// without needing physical access to tap "Update now" on its screen.
// Reuses OTA_PASSWORD (the same value as master's own OTA_PASSWORD -
// CYD's Config::ARDUINO_OTA_PASSWORD is deliberately the same shared
// value, see that project's config.h) rather than a new secret. Gated by
// the session cookie (_middleware.js already blocks unauthenticated
// requests to this route).
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function onRequestPost(context) {
    const { env } = context;

    const command = JSON.stringify({ password: env.OTA_PASSWORD });

    try {
        await mqttPublishOnce({
            url: `wss://${env.MQTT_HOST}:8884/mqtt`,
            username: env.MQTT_MASTER_USERNAME,
            password: env.MQTT_MASTER_PASSWORD,
            topic: `${env.MQTT_TOPIC}/printer/ota/cmd`,
            payload: command,
        });
    } catch (err) {
        return jsonResponse({ error: `MQTT publish failed: ${err.message}` }, 502);
    }

    return jsonResponse({ ok: true, message: "Update command sent - the display will restart once it finishes." });
}
