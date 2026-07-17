// POST /api/trigger-reboot
// Publishes a remote-reboot command over MQTT. Gated by the session cookie
// (_middleware.js already blocks unauthenticated requests to this route) -
// the device-side REBOOT_PASSWORD (a separate, lower-stakes credential from
// OTA_USERNAME/OTA_PASSWORD) is only ever read from the Pages environment
// secrets, never shipped to the browser.
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function onRequestPost(context) {
    const { env } = context;

    const command = JSON.stringify({ password: env.REBOOT_PASSWORD });

    try {
        await mqttPublishOnce({
            url: `wss://${env.MQTT_HOST}:8884/mqtt`,
            username: env.MQTT_MASTER_USERNAME,
            password: env.MQTT_MASTER_PASSWORD,
            topic: `${env.MQTT_TOPIC}/reboot/cmd`,
            payload: command,
        });
    } catch (err) {
        return jsonResponse({ error: `MQTT publish failed: ${err.message}` }, 502);
    }

    return jsonResponse({ ok: true, message: "Reboot command published - device should drop offline briefly." });
}
