// POST /api/gcode-sync
// Accepts an authoritative print correction sourced from the printer's own
// local gcode/.bbl cache (read over LAN FTPS, port 990 - see the printer's
// Access Code setup) rather than Bambu Cloud's Task API, which is
// confirmed unreliable for AMS slot/color mapping (wrong even for jobs
// sliced normally from Studio, not just Bambu Handy). The .bbl file's own
// "ams mapping" field and the gcode header's "total filament weight [g]"
// are ground truth from the slicer itself.
//
// Authenticated by a shared secret header (X-Sync-Secret), not the
// session cookie - this is meant to be called by a script running on the
// LAN (which has no browser login session), not from the dashboard UI
// itself. Writes directly into the same historyOverrides used by the
// manual "Fix filament" button, tagged with source:"gcode" so the
// dashboard can show where the correction came from.
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyLibrary() {
    return { filaments: [], processedPrints: [], historyOverrides: {}, deductionLog: {} };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "LOCAL_SYNC_SECRET not configured" }, 501);
    }

    const provided = request.headers.get("X-Sync-Secret") || "";

    if (provided !== env.LOCAL_SYNC_SECRET) {
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

    const { printName, startTime, material, colorHex, weight } = body;

    if (!printName || !startTime || !material || !colorHex) {
        return jsonResponse({ error: "printName, startTime, material, colorHex are required" }, 400);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);
    const lib = raw ? { ...emptyLibrary(), ...JSON.parse(raw) } : emptyLibrary();

    const key = `${printName}__${startTime}`;

    lib.historyOverrides[key] = {
        material: String(material).trim(),
        colorHex: String(colorHex).replace("#", "").toUpperCase(),
        weight: typeof weight === "number" && Number.isFinite(weight) ? weight : undefined,
        source: "gcode",
    };

    // Same reasoning as the manual "Fix filament" path: if deduction
    // already ran against the (wrong) Task API color and found no
    // matching library entry, the print is stuck marked "processed"
    // forever - a correction landing after that would just sit there
    // without ever actually charging the spool. Un-mark it so the
    // dashboard's next poll picks it back up and deducts for real.
    const processedIdx = lib.processedPrints.indexOf(key);

    if (processedIdx !== -1)
        lib.processedPrints.splice(processedIdx, 1);

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));
    return jsonResponse({ ok: true, key });
}
