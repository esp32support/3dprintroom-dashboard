// POST /api/temp-refund-fix - ONE-OFF, deleted after use.
// Reverses today's double-deduction: Body1_v2.stl and bovenkant_v3.stl
// were each charged twice against PETG Basic White (t52as2oy) - once by
// recoverOrphanedTasks (task-api-recovered) and once by cron-worker/'s
// gcode-sync correction (gcode) - two independent paths, two slightly
// different timestamps, same real print. Keeps the "gcode" entry (live
// tray-verified, the more authoritative source per this project's own
// established precedence) for each print, removes the redundant
// "task-api-recovered" duplicate, and refunds the double-charged grams.
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const DUPLICATE_KEYS = [
    "Body1_v2.stl__2026-09-20 12:41:59",
    "bovenkant_v3.stl__2026-09-20 18:03:49",
];

export async function onRequestPost(context) {
    const { request, env } = context;

    if ((request.headers.get("X-Sync-Secret") || "") !== env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    const lib = JSON.parse(raw);

    const removed = [];

    for (const key of DUPLICATE_KEYS) {
        if (lib.historyOverrides[key]) {
            delete lib.historyOverrides[key];
            removed.push({ key, from: "historyOverrides" });
        }

        if (lib.deductionLog[key]) {
            delete lib.deductionLog[key];
            removed.push({ key, from: "deductionLog" });
        }

        const idx = lib.processedPrints.indexOf(key);
        if (idx !== -1) {
            lib.processedPrints.splice(idx, 1);
            removed.push({ key, from: "processedPrints" });
        }
    }

    const filament = lib.filaments.find((f) => f.id === "t52as2oy");
    const spool = filament.spools.find((s) => !s.removedAt);

    const before = spool.remaining;
    spool.remaining = Math.round((spool.remaining + 77.79 + 68.67) * 100) / 100;

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));

    return jsonResponse({ ok: true, removed, spoolBefore: before, spoolAfter: spool.remaining });
}
