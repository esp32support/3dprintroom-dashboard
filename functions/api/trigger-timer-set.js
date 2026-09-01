// POST /api/trigger-timer-set
//   { "enabled": true|false }                     - global "Enable Timers" switch
//   { "slot": 1-16, "timer": { ...Tasmota TimerN shape... } } - one timer slot
// Publishes a remote Tasmota Timer command over MQTT. Gated by the session
// cookie (_middleware.js already blocks unauthenticated requests to this
// route) - reuses REBOOT_PASSWORD device-side (see mqtt_manager.cpp's
// handleTimerCommand), same trust boundary as /api/trigger-power since both
// live under the dashboard's login-gated Plug Control panel.
//
// "timer" is passed straight through to master, which passes it straight
// through to Tasmota's own TimerN command - this Function doesn't need to
// know Tasmota's field meanings, only that the shape is right, so
// validation here is intentionally shallow (object with the expected keys
// present) rather than a full schema check.
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const TIMER_FIELDS = ["Enable", "Mode", "Time", "Window", "Days", "Repeat", "Output", "Action"];

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;

    try {
        body = await request.json();
    } catch (err) {
        return jsonResponse({ error: "Malformed request body" }, 400);
    }

    let command;
    let message;

    if (typeof body.enabled === "boolean") {
        command = { password: env.REBOOT_PASSWORD, enabled: body.enabled };
        message = `Timers ${body.enabled ? "ON" : "OFF"} command published.`;
    } else if (Number.isInteger(body.slot) && body.slot >= 1 && body.slot <= 16 && body.timer && typeof body.timer === "object") {
        const timer = body.timer;
        const hasExpectedShape = TIMER_FIELDS.every((k) => k in timer);

        if (!hasExpectedShape) {
            return jsonResponse({ error: `timer object missing one of: ${TIMER_FIELDS.join(", ")}` }, 400);
        }

        command = { password: env.REBOOT_PASSWORD, slot: body.slot, timer };
        message = `Timer${body.slot} command published.`;
    } else {
        return jsonResponse({ error: "Body must be { enabled: bool } or { slot: 1-16, timer: {...} }" }, 400);
    }

    try {
        await mqttPublishOnce({
            url: `wss://${env.MQTT_HOST}:8884/mqtt`,
            username: env.MQTT_MASTER_USERNAME,
            password: env.MQTT_MASTER_PASSWORD,
            topic: `${env.MQTT_TOPIC}/timer/cmd`,
            payload: JSON.stringify(command),
        });
    } catch (err) {
        return jsonResponse({ error: `MQTT publish failed: ${err.message}` }, 502);
    }

    return jsonResponse({ ok: true, message });
}
