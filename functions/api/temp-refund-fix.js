// POST /api/temp-refund-fix - ONE-OFF, deleted after use.
// Reverses today's double-deduction: magio_mg640_compound_gear.stl was
// charged twice against PETG Basic Black (3b8gl3xg) - once by
// recoverOrphanedTasks (task-api-recovered/override-single) at
// 2026-09-22 10:51:51, once by the plain live task-amsdetail path 24
// seconds later at 10:52:15 when the same print reappeared in the
// device's own history (a CYD reconnect re-uploading its buffer) - two
// independent keys, same real print, 32.94g taken for one 16.47g print.
// Keeps the first (10:51:51) entry, removes the redundant second
// (10:52:15) one, and refunds the double-charged grams.
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const DUPLICATE_KEYS = [
    "magio_mg640_compound_gear.stl__2026-09-22 10:52:15",
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

    const filament = lib.filaments.find((f) => f.id === "3b8gl3xg");
    const spool = filament.spools.find((s) => !s.removedAt);

    const before = spool.remaining;
    spool.remaining = Math.round((spool.remaining + 16.47) * 100) / 100;

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));

    return jsonResponse({ ok: true, removed, spoolBefore: before, spoolAfter: spool.remaining });
}
