// GET/POST /api/auto-off-state - internal runtime state for the
// auto-off-when-idle feature, script/Worker only (no UI involvement at
// all - see auto-off-config.js for the user-editable settings, a
// deliberately separate KV entry so a config save can never clobber
// this).
//
// Tracks relayOnSince: when the plug's relay most recently transitioned
// to ON, mirroring printer-watch-state.js's own idleSince pattern
// exactly (null while off, set once on the OFF->ON transition, held
// steady while it stays on). Needed because idleSince alone isn't
// enough to decide "is it safe to auto-off again": idleSince only
// resets when a NEW PRINT starts (gcode_state leaves the idle-eligible
// set), but manually flipping the plug back on after an auto-off does
// NOT touch gcode_state at all - confirmed live 2026-09-24, the old
// idle timer just kept running in the background, already past
// threshold, and the very next tick after a manual re-enable saw
// "still idle, relay is ON again" and cut it right back off within
// minutes. Requiring the relay to ALSO have been continuously on for at
// least idleMinutes (see cron-worker's runAutoOff) gives a fresh full
// window after every manual re-enable, while idleSince still correctly
// blocks acting at all during an actual print.
const KV_KEY = "power-auto-off-state";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyState() {
    return { relayOnSince: null };
}

function checkAuth(request, env) {
    if (!env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "LOCAL_SYNC_SECRET not configured" }, 501);
    }

    if ((request.headers.get("X-Sync-Secret") || "") !== env.LOCAL_SYNC_SECRET) {
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
        relayOnSince: typeof body.relayOnSince === "string" ? body.relayOnSince : null,
    };

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(state));
    return jsonResponse({ ok: true });
}
