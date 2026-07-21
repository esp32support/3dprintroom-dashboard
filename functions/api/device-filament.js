// GET /api/device-filament
// Read-only mirror of /api/filament-library for on-device consumers (the CYD
// filament-manager screen) that have no browser session cookie to get past
// _middleware.js's login gate. Authenticated the same way as
// /api/gcode-sync - a shared secret header, not the session cookie - and
// deliberately GET-only/no write path, so a leaked device secret can only
// ever read the inventory, never overwrite it (that stays exclusive to the
// cookie-gated /api/filament-library the dashboard UI uses).
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyLibrary() {
    return { filaments: [], processedPrints: [], historyOverrides: {} };
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "LOCAL_SYNC_SECRET not configured" }, 501);
    }

    const provided = request.headers.get("X-Sync-Secret") || "";

    if (provided !== env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);

    if (!raw) {
        return jsonResponse(emptyLibrary());
    }

    const stored = JSON.parse(raw);
    return jsonResponse({ ...emptyLibrary(), ...stored });
}
