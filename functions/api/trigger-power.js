// POST /api/trigger-power  { "state": "On" | "Off" | "Toggle" }
// Publishes a remote plug power command over MQTT. Reuses REBOOT_PASSWORD
// device-side (see mqtt_manager.cpp's handlePowerCommand) rather than a
// dedicated secret, since both commands share the same trust boundary.
//
// This path is NOT in _middleware.js's PUBLIC_PATHS allowlist, so a
// session cookie normally gates it (the dashboard's own "Turn ON/OFF"
// button). Also accepts X-Sync-Secret so cron-worker's auto-off-when-idle
// check (see auto-off-config.js) can cut power itself with no browser
// involved - same dual-auth idea as power-history.js, just checked here
// instead of via the middleware since this route stays cookie-gated for
// everyone else.
import { verifySessionCookie } from "../_lib/session.js";
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const VALID_STATES = new Set(["On", "Off", "Toggle"]);

async function checkSessionOrSyncAuth(request, env) {
    const provided = request.headers.get("X-Sync-Secret");

    if (provided) {
        return provided === env.LOCAL_SYNC_SECRET;
    }

    const cookie = request.headers.get("Cookie");
    return verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!(await checkSessionOrSyncAuth(request, env))) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

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
