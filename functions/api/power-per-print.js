// GET  /api/power-per-print   - dashboard UI reads the per-print energy log
// POST /api/power-per-print   - scripts/print_watch.py pushes one entry
//                                per print, right when it detects FINISH
//
// Companion to power-history.js's day-level rollups: that file answers
// "how much energy total", this answers "how much did THIS print cost".
// Tracked entirely server-side by print_watch.py (same GitHub Actions cron
// that already watches for RUNNING->FINISH to push color/weight
// corrections) - it snapshots the plug's cumulative totalKwh at print
// start (persisted across cron runs via printer-watch-state.js's
// startTotalKwh field) and again at FINISH, and pushes the delta here.
// No browser involved, unlike the client-side version this replaced.
//
// Same dual-auth / single-KV-blob pattern as power-history.js - see its
// own header comment for why (public path, both handlers check auth
// themselves; one shared FILAMENT_KV namespace rather than a dedicated
// binding).
import { verifySessionCookie } from "../_lib/session.js";

const KV_KEY = "power-per-print-log";
const MAX_ENTRIES = 200;

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
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
    return jsonResponse({ prints: raw ? JSON.parse(raw) : [] });
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

    const name = String(body.printName || "").trim();
    const start = String(body.startTime || "").trim();
    const kwh = Number(body.kwh);

    if (!name || !start || !Number.isFinite(kwh)) {
        return jsonResponse({ error: "printName, startTime and kwh are required" }, 400);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    const log = raw ? JSON.parse(raw) : [];

    // Upsert by key, same reasoning as gcode-sync's own corrections: a
    // retry or a re-run of this cron step for the same print refines the
    // existing entry instead of duplicating it.
    const key = `${name}__${start}`;
    const entry = { key, name, start, kwh: Math.max(0, kwh) };
    const idx = log.findIndex(p => p.key === key);

    if (idx !== -1) log[idx] = entry;
    else log.push(entry);

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)));
    return jsonResponse({ ok: true });
}
