// POST /api/printer-command
// Relays a command to the printer monitor (3dprinterinfo device) over MQTT.
// Same server-side-only credential handling as the other Functions here: the
// dashboard password gates the endpoint, and the real MQTT publish
// credential never reaches the browser.
//
// Commands:
//   { command: "newSpool", trayId: 0..3 }  - reset that tray's running total
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

    const { password, command, trayId } = body;

    if (!password || password !== env.DASHBOARD_PASSWORD) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (command !== "newSpool") {
        return jsonResponse({ error: `unknown command: ${command}` }, 400);
    }

    // Validate before publishing rather than letting the device sort it out -
    // the firmware indexes a fixed-size array with this.
    const id = Number(trayId);

    if (!Number.isInteger(id) || id < 0 || id > 3) {
        return jsonResponse({ error: "trayId must be an integer 0-3" }, 400);
    }

    const payload = JSON.stringify({ command: "newSpool", trayId: id });

    try {
        await mqttPublishOnce({
            url: `wss://${env.MQTT_HOST}:8884/mqtt`,
            username: env.MQTT_MASTER_USERNAME,
            password: env.MQTT_MASTER_PASSWORD,
            topic: `${env.MQTT_TOPIC}/printer/cmd`,
            payload,
        });
    } catch (err) {
        return jsonResponse({ error: `MQTT publish failed: ${err.message}` }, 502);
    }

    return jsonResponse({ ok: true, message: `Tray ${id + 1} total reset.` });
}
