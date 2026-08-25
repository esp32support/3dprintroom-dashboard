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
import { mqttPublishOnce } from "../_lib/mqtt-mini.js";

const KV_KEY = "filament-library";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

// Same shape scripts/filament_relay.py publishes - the CYD parses exactly
// these fields (see that project's printer/cloud_publish.cpp
// handleFilamentMessage), so the two producers must stay in step. Kept
// deliberately small: the display only needs weights, colors, ids and slot
// assignments, never the print history or deduction ledger.
function trimForDevice(lib) {
    return {
        filaments: (lib.filaments || []).map((f) => ({
            id: f.id || "",
            material: f.material || "",
            colorHex: f.colorHex || "",
            color: f.color || "",
            // Removed spools are soft-deleted (removedAt set, kept so their
            // createdAt history survives) - relaying them inflates the
            // display's summed remaining with dead weight.
            spools: (f.spools || [])
                .filter((s) => !s.removedAt)
                .map((s) => ({ total: s.total || 0, remaining: s.remaining || 0 })),
        })),
        slotAssignments: lib.slotAssignments || {},
    };
}

// The CYD can't fetch this over HTTPS itself (a third concurrent TLS
// session reliably fails on that board - see its config.h), so it reads a
// retained MQTT snapshot instead. That snapshot used to be produced ONLY by
// a GitHub Actions cron, which despite a */5 schedule actually fires every
// 25-60 minutes under GitHub's own scheduling - so the display could sit
// that far behind the dashboard after a deduction or a slot change.
// Publishing here as well means the display updates within seconds of any
// real change, with the cron left in place purely as a safety net.
async function publishToDevice(env, lib) {
    if (!env.MQTT_HOST || !env.MQTT_MASTER_USERNAME || !env.MQTT_TOPIC) {
        return;   // device relay not configured in this environment
    }

    await mqttPublishOnce({
        url: `wss://${env.MQTT_HOST}:8884/mqtt`,
        username: env.MQTT_MASTER_USERNAME,
        password: env.MQTT_MASTER_PASSWORD,
        topic: `${env.MQTT_TOPIC}/filament`,
        payload: JSON.stringify(trimForDevice(lib)),
        retain: true,
    });
}

function emptyLibrary() {
    return { filaments: [], processedPrints: [], historyOverrides: {}, deductionLog: {} };
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

    // Best-effort: the inventory is already safely stored, and a broker
    // hiccup must not make the save look like it failed to the dashboard.
    // The scheduled relay will re-publish the same snapshot regardless.
    let relayed = true;

    try {
        await publishToDevice(env, body);
    } catch {
        relayed = false;
    }

    return jsonResponse({ ok: true, relayed });
}
