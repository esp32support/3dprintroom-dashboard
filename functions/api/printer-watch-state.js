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
    return { gcodeState: "", subtaskName: "", currentStart: "", trayNowSeen: [], startTotalKwh: null, idleSince: null };
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

    // idleSince: when the printer most recently entered the literal IDLE
    // gcode_state, tracked authoritatively here (not trusted from the
    // caller) so the auto-off-when-idle feature (see auto-off-config.js
    // and cron-worker's runAutoOff) has one honest source for "how long
    // has it actually been idle" regardless of which script/Worker posts
    // a given tick.
    //
    // Deliberately gated on gcodeState === "IDLE" specifically, NOT on
    // "anything that isn't RUNNING" - explicit user requirement: PAUSE,
    // FINISH, FAILED, PREPARE, SLICING etc. must NOT start (or continue)
    // the idle countdown just because they aren't RUNNING. A paused print
    // sitting for 40 minutes, or a FINISH state lingering briefly before
    // the device reports IDLE, must never be mistaken for "safe to power
    // off" - only the printer's own genuine idle state counts.
    const existingRaw = await env.FILAMENT_KV.get(KV_KEY);
    const existing = existingRaw ? { ...emptyState(), ...JSON.parse(existingRaw) } : emptyState();
    const gcodeState = String(body.gcodeState || "");

    let idleSince = existing.idleSince || null;

    if (gcodeState === "IDLE") {
        if (!idleSince) idleSince = new Date().toISOString();
    } else {
        idleSince = null;
    }

    // startTotalKwh: the plug's cumulative kWh counter as of this print's
    // start, captured by print_watch.py so it survives between its own
    // stateless cron runs until the matching FINISH diffs against it (see
    // that script's own comments). null when not yet captured - explicit
    // null rather than 0, since 0 is a real (if unlikely) reading.
    //
    // typeof check, NOT Number(body.startTotalKwh) - print_watch.py sends
    // a genuine JSON null once an anchor is consumed at FINISH, and
    // Number(null) is 0 in JS, so the old Number.isFinite(Number(...))
    // form silently turned "no anchor" into a fake zero-anchor. Confirmed
    // live 2026-09-15: a just-finished print's cleared anchor came back
    // as startTotalKwh:0 instead of null. Harmless that one time only
    // because gcodeState was genuinely "FINISH" (which re-anchors the
    // next print regardless of name) - but had the plug been unreachable
    // exactly when a new print started, this 0 would have been
    // misread as a real anchor at that print's own FINISH, pushing the
    // plug's entire lifetime total as "this print's" energy instead of
    // honestly leaving it untracked.
    const startTotalKwh = typeof body.startTotalKwh === "number" && Number.isFinite(body.startTotalKwh)
        ? body.startTotalKwh
        : null;

    const state = {
        gcodeState,
        subtaskName: String(body.subtaskName || ""),
        currentStart: String(body.currentStart || ""),
        trayNowSeen: Array.isArray(body.trayNowSeen) ? body.trayNowSeen : [],
        startTotalKwh,
        idleSince,
    };

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(state));
    return jsonResponse({ ok: true });
}
