// POST /api/fix-slot-assignment
// Script-authenticated way to correct filament-library's slotAssignments
// (which library filament is physically loaded in a given AMS slot)
// without needing a browser session cookie - the dashboard UI's own way
// to do this (the slot-assign pills in the Filament tab) is deliberately
// locked while a print is running, to avoid misattributing a pending
// deduction (see app.js's onToggleSlotAssignment), which means a spool
// swapped mid-print has no in-UI way to get corrected until the print
// ends. Same auth/read-modify-write pattern as gcode-sync.js, scoped to
// this one field only.
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyLibrary() {
    return { filaments: [], processedPrints: [], historyOverrides: {}, deductionLog: {}, slotAssignments: {} };
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

    const slot = String(body.slot ?? "");

    if (!slot) {
        return jsonResponse({ error: "slot is required" }, 400);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    const lib = raw ? { ...emptyLibrary(), ...JSON.parse(raw) } : emptyLibrary();

    if (!lib.slotAssignments) {
        lib.slotAssignments = {};
    }

    const previous = lib.slotAssignments[slot] ?? null;

    if (body.filamentId === null || body.filamentId === undefined) {
        delete lib.slotAssignments[slot];
    } else {
        const exists = (lib.filaments || []).some((f) => f.id === body.filamentId);

        if (!exists) {
            return jsonResponse({ error: `no filament with id ${body.filamentId}` }, 400);
        }

        lib.slotAssignments[slot] = body.filamentId;
    }

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));

    return jsonResponse({ ok: true, slot, previous, now: lib.slotAssignments[slot] ?? null });
}
