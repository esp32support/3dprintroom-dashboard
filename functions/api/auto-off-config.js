// GET  /api/auto-off-config   - dashboard UI reads the saved setting;
//                                cron-worker also reads it every tick
// POST /api/auto-off-config   - dashboard UI (session cookie only) saves it
//
// Config for the "auto power-off when idle" feature: if enabled, the
// plug is turned off once the printer has sat in the literal IDLE
// gcode_state (see printer-watch-state.js's own idleSince tracking -
// deliberately NOT "anything that isn't RUNNING", so PAUSE/FINISH/
// PREPARE/etc. never count) for at least idleMinutes. The actual check
// and power-off happens in cron-worker (runs every 2 minutes); this
// endpoint only stores the setting.
//
// This path is allowlisted as public in _middleware.js - GET accepts
// EITHER a session cookie (the dashboard UI) or X-Sync-Secret
// (cron-worker), same dual-auth pattern as power-history.js. POST is
// session-cookie only - nothing script-side ever changes this setting,
// only a logged-in user.
import { verifySessionCookie } from "../_lib/session.js";

const KV_KEY = "power-auto-off-config";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyConfig() {
    return { enabled: false, idleMinutes: 60 };
}

async function checkSessionOrSyncAuth(request, env) {
    const provided = request.headers.get("X-Sync-Secret");

    if (provided) {
        return provided === env.LOCAL_SYNC_SECRET;
    }

    const cookie = request.headers.get("Cookie");
    return verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!(await checkSessionOrSyncAuth(request, env))) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    return jsonResponse(raw ? { ...emptyConfig(), ...JSON.parse(raw) } : emptyConfig());
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const cookie = request.headers.get("Cookie");
    const authed = await verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);

    if (!authed) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    const idleMinutes = Number(body.idleMinutes);

    if (!Number.isFinite(idleMinutes) || idleMinutes < 1) {
        return jsonResponse({ error: "idleMinutes must be a positive number" }, 400);
    }

    const config = {
        enabled: Boolean(body.enabled),
        // Capped at 30 days - anything longer isn't really "auto-off when
        // idle" any more and a typo (e.g. an extra zero) shouldn't be able
        // to silently disable this for a month.
        idleMinutes: Math.min(idleMinutes, 30 * 24 * 60),
    };

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(config));
    return jsonResponse({ ok: true, config });
}
