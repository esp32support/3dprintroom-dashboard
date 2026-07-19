// GET/POST /api/filament-library
// The filament inventory (material/color entries, each with one or more
// physical spools and a running remaining-weight total) - manually curated
// by the user, automatically deducted from as prints complete. Stored as a
// single JSON blob in a Cloudflare KV namespace (not device NVS) so it's
// shared across every browser/device viewing the dashboard, rather than
// living on one ESP32 or in one browser's localStorage.
//
// Needs a KV namespace bound to this Pages project as FILAMENT_KV (Pages
// dashboard - Settings - Functions - KV namespace bindings), same kind of
// one-time setup as the BAMBU_ACCESS_TOKEN secret.
const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function emptyLibrary() {
    return { filaments: [], processedPrints: [], historyOverrides: {} };
}

export async function onRequestGet(context) {
    const { env } = context;

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    const raw = await env.FILAMENT_KV.get(KV_KEY);

    if (!raw) {
        return jsonResponse(emptyLibrary());
    }

    // historyOverrides was added after this had already been in use -
    // default it in for anything saved before that so old data still loads.
    const stored = JSON.parse(raw);
    return jsonResponse({ ...emptyLibrary(), ...stored });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.FILAMENT_KV) {
        return jsonResponse({ error: "FILAMENT_KV not bound" }, 501);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    if (!Array.isArray(body.filaments) || !Array.isArray(body.processedPrints) ||
        typeof body.historyOverrides !== "object" || body.historyOverrides === null) {
        return jsonResponse({ error: "body must have filaments[], processedPrints[], historyOverrides{}" }, 400);
    }

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(body));
    return jsonResponse({ ok: true });
}
