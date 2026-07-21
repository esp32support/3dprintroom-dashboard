// GET/POST /api/printer-watch-state
// Small persisted state for the LAN-free print-watch job (see
// scripts/print_watch.py) that replaced gcode_sync_daemon.py's FTPS-based
// print-finish detection. That job runs as a stateless GitHub Actions
// step every ~5 minutes - it has no in-memory state between runs the way
// the old PC-resident daemon did, so "was a print running last time I
// checked, which AMS trays were active during it" has to live somewhere
// durable. This reuses the same FILAMENT_KV namespace everything else in
// this project already uses, under its own key so it can't collide with
// the actual filament-library blob.
//
// Authenticated the same way as gcode-sync/device-filament - a script
// with no browser session, not a dashboard UI consumer.
const KV_KEY = "printer-watch-state";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyState() {
    return { gcodeState: "", subtaskName: "", currentStart: "", trayNowSeen: [] };
}

function checkAuth(request, env) {
    if (!env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "LOCAL_SYNC_SECRET not configured" }, 501);
    }

    const provided = request.headers.get("X-Sync-Secret") || "";

    if (provided !== env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    return null;
}

export async function onRequestGet(context) {
    const { request, env } = context;

    const authError = checkAuth(request, env);
    if (authError) return authError;

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    return jsonResponse(raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState());
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const authError = checkAuth(request, env);
    if (authError) return authError;

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    const state = {
        gcodeState: String(body.gcodeState || ""),
        subtaskName: String(body.subtaskName || ""),
        currentStart: String(body.currentStart || ""),
        trayNowSeen: Array.isArray(body.trayNowSeen) ? body.trayNowSeen : [],
    };

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(state));
    return jsonResponse({ ok: true });
}
