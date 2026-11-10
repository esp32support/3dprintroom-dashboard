// GET  /api/printer-hours - the printer's lifetime print time in MINUTES (the
//                           figure on its own Settings > Device screen)
// POST /api/printer-hours - set the cached value by hand (X-Sync-Secret only)
//
// The figure comes from Bambu Cloud's bound-devices list
// (api.bambulab.com/v1/iot-service/api/user/bind, total_print_time; confirmed
// live 28925 = 482.1 h = the 482 hrs on the printer's screen). Bambu's
// Cloudflare layer started answering that API with 403 "Attention Required"
// in early November 2026 (the Home Assistant Bambu integration reports the
// same), so a live value is not always available. This endpoint therefore
// keeps the LAST GOOD value in KV and falls back to it, flagged `stale`.
//
// KV cost: one read per call; a write only when the value changed AND the
// stored one is at least WRITE_EVERY_MS old (a handful of writes per day at
// most, nothing like the per-tick writes the KV budget notes warn about).
//
// Dual auth like printer-task.js: the dashboard UI calls it with the session
// cookie, the cron worker with X-Sync-Secret. POST accepts the secret only.
import { verifySessionCookie } from "../_lib/session.js";

const KV_KEY = "printer-total-print-minutes";
const WRITE_EVERY_MS = 3 * 60 * 60 * 1000;

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

async function checkAuth(request, env) {
    const provided = request.headers.get("X-Sync-Secret");

    if (provided) {
        return provided === env.LOCAL_SYNC_SECRET;
    }

    const cookie = request.headers.get("Cookie");
    return verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);
}

async function readCache(env) {
    if (!env.FILAMENT_KV) return null;

    const raw = await env.FILAMENT_KV.get(KV_KEY);

    if (!raw) return null;

    try {
        const c = JSON.parse(raw);
        return Number.isFinite(c.minutes) ? c : null;
    } catch {
        return null;
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!(await checkAuth(request, env))) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const cache = await readCache(env);
    let live = null;

    if (env.BAMBU_ACCESS_TOKEN) {
        const deviceId = env.BAMBU_DEVICE_ID || "";

        try {
            const res = await fetch("https://api.bambulab.com/v1/iot-service/api/user/bind", {
                headers: {
                    Accept: "application/json",
                    // Our own honest identifier. Impersonating Bambu's network agent
                // (bambu_network_agent/01.09.*) got every request answered with a
                // Cloudflare 403 from 2026-11-10; a plain own UA passes.
                "User-Agent": "3dprintroom-dashboard/1.0",
                    Authorization: `Bearer ${env.BAMBU_ACCESS_TOKEN}`,
                },
            });

            if (res.ok) {
                const bind = await res.json();
                const devices = bind.devices || [];
                const dev = (deviceId && devices.find((d) => d.dev_id === deviceId)) || devices[0];

                if (dev && Number.isFinite(Number(dev.total_print_time))) {
                    live = Number(dev.total_print_time);
                }
            }
        } catch {
            // leave live null - fall back to the cache below
        }
    }

    const now = Date.now();

    if (live !== null) {
        if (env.FILAMENT_KV && (!cache || (cache.minutes !== live && now - cache.at >= WRITE_EVERY_MS))) {
            await env.FILAMENT_KV.put(KV_KEY, JSON.stringify({ minutes: live, at: now }));
        }

        return jsonResponse({ minutes: live, stale: false, at: now });
    }

    if (cache) {
        return jsonResponse({ minutes: cache.minutes, stale: true, at: cache.at });
    }

    return jsonResponse({ minutes: null, stale: true, at: null });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "LOCAL_SYNC_SECRET not configured" }, 501);
    }

    if ((request.headers.get("X-Sync-Secret") || "") !== env.LOCAL_SYNC_SECRET) {
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

    const minutes = Number(body.minutes);

    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10000000) {
        return jsonResponse({ error: "minutes must be a positive number" }, 400);
    }

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify({ minutes, at: Date.now() }));
    return jsonResponse({ ok: true, minutes });
}
