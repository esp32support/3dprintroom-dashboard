// POST /api/trigger-power  { "state": "On" | "Off" | "Toggle" }
// Publishes a remote plug power command over MQTT. Gated by the session
// cookie (_middleware.js already blocks unauthenticated requests to this
// route) - reuses REBOOT_PASSWORD device-side (see mqtt_manager.cpp's
// handlePowerCommand) rather than a dedicated secret, since both commands
// are triggered from the same login-gated dashboard button and share the
// same trust boundary.
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const VALID_STATES = new Set(["On", "Off", "Toggle"]);

export async function onRequestPost(context) {
    const { request, env } = context;

    let state;

    try {
        ({ state } = await request.json());
    } catch (err) {
        return jsonResponse({ error: "Malformed request body" }, 400);
    }

    if (!VALID_STATES.has(state)) {
        return jsonResponse({ error: "state must be On, Off or Toggle" }, 400);
    }

    const command = JSON.stringify({ password: env.REBOOT_PASSWORD, state });

    try {
        await mqttPublishOnce({
            url: `wss://${env.MQTT_HOST}:8884/mqtt`,
            username: env.MQTT_MASTER_USERNAME,
            password: env.MQTT_MASTER_PASSWORD,
            topic: `${env.MQTT_TOPIC}/power/cmd`,
            payload: command,
        });
    } catch (err) {
        return jsonResponse({ error: `MQTT publish failed: ${err.message}` }, 502);
    }

    return jsonResponse({ ok: true, message: `Power ${state} command published.` });
}
