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

    const { printName, startTime, material, colorHex, weight, details, durationSeconds, layers } = body;

    // Both display-only, for a history entry whose start/end/layers got
    // corrupted at the source (confirmed live: a Bambu-cloud connectivity
    // outage on the display at the exact moment a print ended left its
    // permanent cloud record showing the wrong duration and a 0 layer
    // count, even though the print itself finished completely normally).
    // Neither affects deduction - that's driven by weight/material/colorHex
    // above regardless of what's here.
    const durationOverride = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds >= 0
        ? durationSeconds
        : undefined;
    const layersOverride = typeof layers === "number" && Number.isFinite(layers) && layers >= 0
        ? layers
        : undefined;

    // Multi-color: caller sends `details` (an array of {material, colorHex,
    // weight}) instead of the single flat material/colorHex/weight -
    // real support for prints using more than one AMS tray, which a
    // single {material, colorHex} override could never represent. Kept as
    // a separate shape (not forcing every caller onto array-of-one) so
    // every existing single-color caller keeps working unchanged.
    if (details !== undefined) {
        if (!printName || !startTime || !Array.isArray(details) || details.length === 0) {
            return jsonResponse({ error: "printName, startTime, details[] are required" }, 400);
        }

        for (const d of details) {
            if (!d.material || !d.colorHex) {
                return jsonResponse({ error: "each detail needs material and colorHex" }, 400);
            }
        }

        const raw = await env.FILAMENT_KV.get(KV_KEY);
        const lib = raw ? { ...emptyLibrary(), ...JSON.parse(raw) } : emptyLibrary();

        const key = `${printName}__${startTime}`;

        lib.historyOverrides[key] = {
            details: details.map((d) => ({
                material: String(d.material).trim(),
                colorHex: String(d.colorHex).replace("#", "").toUpperCase(),
                weight: typeof d.weight === "number" && Number.isFinite(d.weight) ? d.weight : undefined,
            })),
            durationSeconds: durationOverride,
            layers: layersOverride,
            source: "gcode",
        };

        const processedIdx = lib.processedPrints.indexOf(key);
        if (processedIdx !== -1) lib.processedPrints.splice(processedIdx, 1);

        await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));
        return jsonResponse({ ok: true, key });
    }

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
        durationSeconds: durationOverride,
        layers: layersOverride,
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
