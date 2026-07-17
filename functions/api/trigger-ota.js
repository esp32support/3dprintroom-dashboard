// POST /api/trigger-ota
// Publishes an MQTT-triggered firmware update command, without ever putting
// the device's MQTT/OTA credentials in the public dashboard's JS. Those
// credentials live only as Cloudflare Pages environment secrets, read here
// server-side. Gated by the session cookie (_middleware.js already blocks
// unauthenticated requests to this route).
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    const { firmwareUrl, authHeader, acceptHeader } = body;

    if (!firmwareUrl) {
        return jsonResponse({ error: "firmwareUrl is required" }, 400);
    }

    // Same shape ota_manager.cpp expects from the ESP32-side MQTT command -
    // username/password are checked again on the device itself before it
    // downloads or flashes anything (defense in depth, not just this gate).
    const command = JSON.stringify({
        username: env.OTA_USERNAME,
        password: env.OTA_PASSWORD,
        url: firmwareUrl,
        authHeader: authHeader || "",
        acceptHeader: acceptHeader || "",
    });

    try {
        await mqttPublishOnce({
            url: `wss://${env.MQTT_HOST}:8884/mqtt`,
            username: env.MQTT_MASTER_USERNAME,
            password: env.MQTT_MASTER_PASSWORD,
            topic: `${env.MQTT_TOPIC}/ota/cmd`,
            payload: command,
        });
    } catch (err) {
        return jsonResponse({ error: `MQTT publish failed: ${err.message}` }, 502);
    }

    return jsonResponse({
        ok: true,
        message: "OTA command published - watch System Health / boot history for progress.",
    });
}
