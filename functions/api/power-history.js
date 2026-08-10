// GET  /api/power-history?days=7   - dashboard UI reads daily rollups
// POST /api/power-history          - scripts/power_watch.py pushes one reading per run
//
// This path is allowlisted as public in _middleware.js (the middleware
// skips its own session-cookie check for allowlisted paths), so both
// handlers below check auth themselves: GET accepts EITHER a session
// cookie (the dashboard UI) or X-Sync-Secret, POST requires X-Sync-Secret
// only (script-only, nothing in the browser ever writes this) - same
// dual-auth pattern as printer-task.js.
//
// Daily granularity only, in the same FILAMENT_KV namespace everything
// else in this project already uses (a dedicated namespace would need
// its own Cloudflare Pages binding - see printer-watch-state.js for the
// same reasoning). Week/month views are computed by summing the last
// N day records on read rather than maintaining separate week/month
// keys - simpler, and 31 KV reads per page load is nothing against the
// free tier's 100k/day read limit.
import { verifySessionCookie } from "../_lib/session.js";

const KV_PREFIX = "power-day:";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function dayKey(dateStr) {
    return `${KV_PREFIX}${dateStr}`;
}

function emptyDay() {
    return {
        minW: null, maxW: null, sumW: 0, countW: 0,
        minV: null, maxV: null, sumV: 0, countV: 0,
        minA: null, maxA: null, sumA: 0, countA: 0,
        kwh: 0,
    };
}

function mergeSample(day, w, v, a) {
    for (const [key, value] of [["W", w], ["V", v], ["A", a]]) {
        const minKey = `min${key}`;
        const maxKey = `max${key}`;
        const sumKey = `sum${key}`;
        const countKey = `count${key}`;

        // 0 excluded from min - the plug idle/off isn't a real minimum,
        // same rule as the dashboard's session tracking and CYD's.
        if (value > 0 && (day[minKey] === null || value < day[minKey]))
            day[minKey] = value;

        if (day[maxKey] === null || value > day[maxKey])
            day[maxKey] = value;

        day[sumKey] += value;
        day[countKey] += 1;
    }
}

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

    const date = String(body.date || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return jsonResponse({ error: "date must be YYYY-MM-DD" }, 400);
    }

    const key = dayKey(date);
    const existingRaw = await env.FILAMENT_KV.get(key);
    const day = existingRaw ? { ...emptyDay(), ...JSON.parse(existingRaw) } : emptyDay();

    mergeSample(day, Number(body.w) || 0, Number(body.v) || 0, Number(body.a) || 0);

    // Tasmota's own todayKwh counter is already cumulative for the day -
    // just take the latest reading rather than summing samples.
    if (Number.isFinite(Number(body.kwh)))
        day.kwh = Number(body.kwh);

    await env.FILAMENT_KV.put(key, JSON.stringify(day));
    return jsonResponse({ ok: true });
}

export async function onRequestGet(context) {
    const { env, request } = context;

    if (!(await checkSessionOrSyncAuth(request, env))) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    const url = new URL(request.url);
    const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days")) || 7));

    const results = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        const dateStr = d.toISOString().slice(0, 10);

        const raw = await env.FILAMENT_KV.get(dayKey(dateStr));

        if (raw) {
            results.push({ date: dateStr, ...emptyDay(), ...JSON.parse(raw) });
        }
    }

    return jsonResponse({ days: results });
}
