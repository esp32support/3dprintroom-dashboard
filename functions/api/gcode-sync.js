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

// Parses a "YYYY-MM-DD HH:MM:SS" device-local-time string (the format
// every historyOverrides key's start segment uses) into a value that's
// only ever DIFFED against another string in the exact same format - not
// a real timestamp. `new Date("...", no zone)` would be misinterpreted as
// UTC here (Cloudflare Workers has no local timezone, unlike a real
// browser, where the identical string correctly parses as that browser's
// local time - see app.js's parseDeviceTime), so this reads the digits
// directly instead of trusting environment-dependent Date parsing.
function localTimeToComparable(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s || "");

    if (!m) return null;

    const [, y, mo, d, h, mi, se] = m.map(Number);
    return Date.UTC(y, mo - 1, d, h, mi, se);
}

// Finds an EXISTING historyOverrides key for the same print, within a
// tolerance window, other than the exact key this request would write -
// used to avoid double-deducting a print that another path already
// corrected under a very slightly different timestamp. Confirmed live
// 2026-09-20: recoverOrphanedTasks() (app.js, client-side) and this
// endpoint (server-side, called by cron-worker/) each independently
// derive their own timestamp for the SAME print - Task API's own
// startTime vs the live snapshot's currentStart, seconds apart - and
// neither path knew about the other's already-written correction, so
// both created their own historyOverrides entry and their own deduction.
// Two real PETG prints in one day (Body1_v2.stl, bovenkant_v3.stl) each
// got double-deducted this way - the SAME print's weight taken twice from
// the same spool. print_watch.py's own find_matching_task() already
// tolerates this identical cross-source drift for a different purpose;
// this is the same idea applied to prevent a duplicate WRITE rather than
// just picking the right READ.
function findExistingOverrideKey(historyOverrides, printName, startTime, toleranceMs) {
    const targetMs = localTimeToComparable(startTime);
    const ownKey = `${printName}__${startTime}`;

    if (targetMs === null) return null;

    for (const key of Object.keys(historyOverrides)) {
        if (key === ownKey) continue;

        const sep = key.lastIndexOf("__");
        if (sep === -1) continue;

        if (key.slice(0, sep) !== printName) continue;

        const ms = localTimeToComparable(key.slice(sep + 2));
        if (ms === null) continue;

        if (Math.abs(ms - targetMs) <= toleranceMs) return key;
    }

    return null;
}

const DUPLICATE_TOLERANCE_MS = 10 * 60 * 1000;

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

    const { printName, startTime, material, colorHex, weight, details, durationSeconds, layers, skip, reason } = body;

    // Permanent write-off: for a print that will NEVER be able to deduct
    // (a spool that's out for good, or a material the room simply doesn't
    // stock) rather than let it sit as a "candidate" forever - retried,
    // silently, on every single 5s poll. Confirmed live 2026-09-06: two
    // such prints (an empty PLA spool, an unmatched ABS color that turned
    // out to be a mislabeled tray - this room never prints ABS) were each
    // producing a fresh SKIP audit-log write every 5 seconds indefinitely,
    // since neither could ever join processedPrints on its own - one of
    // the two confirmed contributors to that day's KV quota exhaustion.
    // No material/colorHex/weight needed - see app.js's
    // processFilamentDeductions for the corresponding `override.skip`
    // short-circuit that both marks it processed AND stops the outer
    // hasUnprocessed check from ever re-flagging it.
    if (skip === true) {
        if (!printName || !startTime) {
            return jsonResponse({ error: "printName and startTime are required" }, 400);
        }

        const raw = await env.FILAMENT_KV.get(KV_KEY);
        const lib = raw ? { ...emptyLibrary(), ...JSON.parse(raw) } : emptyLibrary();
        const key = `${printName}__${startTime}`;

        lib.historyOverrides[key] = {
            skip: true,
            reason: typeof reason === "string" && reason.trim() ? reason.trim() : "manually written off - no deduction possible",
            source: "gcode",
        };

        await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(lib));
        return jsonResponse({ ok: true, key, skipped: true });
    }

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

        const existingKey = findExistingOverrideKey(lib.historyOverrides, printName, startTime, DUPLICATE_TOLERANCE_MS);

        if (existingKey) {
            return jsonResponse({ ok: true, alreadyCovered: existingKey });
        }

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

    const existingKey = findExistingOverrideKey(lib.historyOverrides, printName, startTime, DUPLICATE_TOLERANCE_MS);

    if (existingKey) {
        return jsonResponse({ ok: true, alreadyCovered: existingKey });
    }

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
