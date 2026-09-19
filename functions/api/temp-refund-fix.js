// POST /api/temp-refund-fix - ONE-OFF, deleted after use.
// Refunds a specific wrong gram amount to a specific spool, and corrects
// the matching deductionLog entry's filamentId, for the exact incident
// this session found: topper_nika_final.stl's blue (0086D6) portion got
// double-deducted under two duplicate-key entries (the same cross-source
// timestamp-drift issue documented elsewhere) - once correctly to
// Sapphire Blue, once wrongly to PETG Basic Black (via the stale A3 slot
// assignment, since fixed). Refunds 1.41g to PETG Basic Black's one
// active spool and fixes the ledger entry's filamentId for audit-trail
// accuracy.
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if ((request.headers.get("X-Sync-Secret") || "") !== env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    const lib = JSON.parse(raw);

    const filament = lib.filaments.find((f) => f.id === "3b8gl3xg");
    const spool = filament.spools.find((s) => s.id === "an2bfvih" && !s.removedAt);

    const before = spool.remaining;
    spool.remaining = Math.round((spool.remaining + 1.41) * 100) / 100;

    const entry = lib.deductionLog["topper_nika_final.stl__2026-09-19 16:19:26"];
    entry["0086D6"].filamentId = "03hczbh0";

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));

    return jsonResponse({ ok: true, spoolBefore: before, spoolAfter: spool.remaining, entry });
}
