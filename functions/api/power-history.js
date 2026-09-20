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
        // UTC hour (0-23) this day last actually merged a sample for, -1
        // meaning none yet today. See onRequestPost's own comment for why
        // this replaced the caller-side "only run near :00" gate.
        lastHour: -1,
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

    // Tasmota's own todayKwh counter is already cumulative for the day -
    // just take the latest reading rather than summing samples.
    const newKwh = Number.isFinite(Number(body.kwh)) ? Number(body.kwh) : day.kwh;

    // Dedup by VALUE CHANGE now, not by hour-of-day. The old "once per
    // hour, first sample wins" rule (see git history) was needed when the
    // caller's own cadence was a GitHub Actions cron that fired every
    // 25-60+ minutes at unpredictable offsets - a single sample per hour,
    // landing at a random minute, was a reasonable-enough proxy for that
    // hour's usage on average. cron-worker/ replaced that cron with a
    // reliable 2-minute Cloudflare Worker cadence, which broke this rule
    // in a new way: the FIRST sample of every hour now lands within that
    // hour's first ~2 minutes almost every time, locking in a near-
    // start-of-hour reading and silently discarding every later, more
    // complete sample for the rest of that hour. Confirmed live
    // 2026-09-20: a print running through most of UTC hour 13 (ending
    // 13:50) had that hour's contribution to Total Energy frozen at
    // whatever todayKwh read at ~13:01, undercounting the day's real
    // total by most of that hour's actual usage. Tasmota's own todayKwh
    // is monotonically authoritative for the whole day regardless of hour
    // boundaries, so there's no reason to bucket by hour at all - keep
    // the latest reading always, and only skip the KV write when nothing
    // has actually changed (idle periods protect the free-tier write
    // quota on their own, the same way this dedup always intended).
    if (Math.abs(newKwh - (day.kwh || 0)) < 0.0005) {
        return jsonResponse({ ok: true, skipped: "kwh unchanged" });
    }

    mergeSample(day, Number(body.w) || 0, Number(body.v) || 0, Number(body.a) || 0);
    day.lastHour = new Date().getUTCHours();   // informational only, nothing gates on it anymore
    day.kwh = newKwh;

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
