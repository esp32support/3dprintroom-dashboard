// GET/POST /api/deduction-audit
// An append-only forensic trail of every spool weight change the dashboard
// makes automatically - what was deducted (or refunded), from which spool,
// driven by which colorHex and which AMS slot assignment, and the spool's
// remaining weight immediately before and after.
//
// Deliberately NOT surfaced on the dashboard or the CYD: this exists to
// answer "why is this spool's number wrong" after the fact, which is a
// question that has now come up repeatedly and been expensive to answer
// each time. The deductionLog inside the filament library records only the
// end state ({printKey: {colorHex: grams}}) - it can't show WHICH filament
// entry a hex resolved to, whether a slot assignment or a fuzzy color match
// picked it, or what the spool read before the change. Confirmed live: a
// print correctly overridden to Fossil Gray (BBBBBB) still left its earlier
// Basic Silver (C0C0C0) row in place, charging two spools for one print,
// and nothing in the stored data was enough to reconstruct how it happened.
//
// Stored under its own KV key rather than inside the filament library blob
// so it can't bloat (or risk corrupting) the inventory every save rewrites.
//
// Dual auth, same pattern and reasoning as /api/printer-task: the browser
// posts entries with its session cookie, while a script (no browser
// session) can read them back with an X-Sync-Secret header.
import { verifySessionCookie } from "../_lib/session.js";

const KV_KEY = "deduction-audit";

// Roughly a year of normal printing at this printer's observed rate, while
// staying far inside KV's 25MB per-value ceiling (~350 bytes/entry).
const MAX_ENTRIES = 2000;

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

async function readLog(env) {
    const raw = await env.FILAMENT_KV.get(KV_KEY);

    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!(await checkAuth(request, env))) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    const url = new URL(request.url);
    const entries = await readLog(env);

    // ?limit=N returns the N most recent (the tail - entries are appended
    // in chronological order, so the interesting end is the back).
    const limit = parseInt(url.searchParams.get("limit") || "", 10);
    const slice = Number.isFinite(limit) && limit > 0 ? entries.slice(-limit) : entries;

    return jsonResponse({ count: entries.length, entries: slice });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!(await checkAuth(request, env))) {
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

    if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return jsonResponse({ error: "body must have a non-empty entries[]" }, 400);
    }

    // Append rather than replace - this is a ledger, and the caller only
    // ever knows about the change it just made, never the whole history.
    const existing = await readLog(env);
    const merged = existing.concat(body.entries).slice(-MAX_ENTRIES);

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(merged));
    return jsonResponse({ ok: true, count: merged.length });
}
