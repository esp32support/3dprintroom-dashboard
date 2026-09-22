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

// Last-line server-side guard against the SAME print being deducted twice
// under two different nearby-but-different keys - see app.js's own
// findNearbyProcessedKey for the client-side attempt at this exact
// problem, and its comment for the incident that made a client-only
// guard insufficient: magio_mg640_compound_gear.stl (2026-09-22) was
// double-deducted THREE times across a session, including once still
// AFTER the client-side fix had been live and deployed for over 25
// minutes - the client-side mechanism that let a stale/duplicate save
// slip through was never conclusively identified. This runs here
// instead because a Pages Function always executes the currently
// deployed code on every request, unlike a browser tab that may be
// running whatever copy of app.js it happened to load; it can't prevent
// a bad deduction from happening client-side, but it CAN stop it from
// ever reaching storage a second time, regardless of which cached
// client produced the save.
function parseKeyTime(key) {
    const sep = key.lastIndexOf("__");
    if (sep === -1) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(key.slice(sep + 2));
    if (!m) return null;
    const [, y, mo, d, h, mi, se] = m.map(Number);
    return Date.UTC(y, mo - 1, d, h, mi, se);
}

function printNameOf(key) {
    const sep = key.lastIndexOf("__");
    return sep === -1 ? key : key.slice(0, sep);
}

const NEARBY_TOLERANCE_MS = 10 * 60 * 1000;

// Finds pairs of deductionLog keys for the same print name, within
// NEARBY_TOLERANCE_MS of each other, that charged the same filamentId the
// same grams for the same colorHex - the exact shape a duplicate
// deduction leaves (see the comment above). Two genuinely separate prints
// of the same object in quick succession would only be wrongly merged if
// they ALSO used the identical gram amount down to 0.01g - the same
// tolerance/false-positive trade-off findNearbyProcessedKey already makes
// on print name + time alone, just narrowed further here by also
// requiring matching grams and filament.
function findDuplicateDeductions(deductionLog) {
    const keys = Object.keys(deductionLog);
    const duplicates = [];

    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const a = keys[i], b = keys[j];
            if (printNameOf(a) !== printNameOf(b)) continue;

            const ta = parseKeyTime(a), tb = parseKeyTime(b);
            if (ta === null || tb === null) continue;
            if (Math.abs(ta - tb) > NEARBY_TOLERANCE_MS) continue;

            const logA = deductionLog[a] || {};
            const logB = deductionLog[b] || {};

            for (const hex of Object.keys(logB)) {
                const entryA = logA[hex];
                const entryB = logB[hex];
                if (!entryA || !entryB) continue;

                const gramsA = typeof entryA === "number" ? entryA : entryA.grams;
                const gramsB = typeof entryB === "number" ? entryB : entryB.grams;
                const filamentIdA = typeof entryA === "object" ? entryA.filamentId : null;
                const filamentIdB = typeof entryB === "object" ? entryB.filamentId : null;

                if (typeof gramsA === "number" && typeof gramsB === "number"
                    && Math.abs(gramsA - gramsB) < 0.01 && filamentIdA && filamentIdA === filamentIdB) {
                    duplicates.push({
                        dropKey: ta <= tb ? b : a,
                        hex,
                        grams: gramsB,
                        filamentId: filamentIdB,
                    });
                }
            }
        }
    }

    return duplicates;
}

// Mutates `lib` in place: drops each duplicate's own deductionLog row
// (keeping the earlier key as authoritative) and refunds its grams back
// to the spool it was taken from, so an incoming save that already
// contains a duplicate deduction never actually reaches storage that way.
function stripDuplicateDeductions(lib) {
    const duplicates = findDuplicateDeductions(lib.deductionLog || {});

    for (const dup of duplicates) {
        const row = lib.deductionLog[dup.dropKey];
        if (!row) continue;

        delete row[dup.hex];
        if (Object.keys(row).length === 0) delete lib.deductionLog[dup.dropKey];

        const filament = (lib.filaments || []).find((f) => f.id === dup.filamentId);
        const spool = filament && filament.spools.find((s) => !s.removedAt);
        if (spool) spool.remaining = Math.round((spool.remaining + dup.grams) * 100) / 100;
    }

    return duplicates;
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

    const strippedDuplicates = stripDuplicateDeductions(body);

    await env.FILAMENT_KV.put(KV_KEY, JSON.stringify(body));

    // Record what the guard above did, if anything - same "deduction-audit"
    // ledger app.js's own auditSpoolChange writes to (see deduction-audit.js),
    // so a caught duplicate shows up in the normal forensic trail instead of
    // silently vanishing. Best-effort: a logging hiccup must not fail the
    // save that already succeeded.
    if (strippedDuplicates.length > 0) {
        try {
            const entries = strippedDuplicates.map((dup) => ({
                ts: new Date().toISOString(),
                printKey: dup.dropKey,
                printName: printNameOf(dup.dropKey),
                event: "refund",
                source: "server-duplicate-guard",
                sourceHex: dup.hex,
                delta: dup.grams,
                filamentId: dup.filamentId,
                reason: "same print deducted twice under nearby-but-different keys - caught and refunded server-side on save",
            }));

            const existingRaw = await env.FILAMENT_KV.get("deduction-audit");
            const existing = existingRaw ? JSON.parse(existingRaw) : [];
            const merged = (Array.isArray(existing) ? existing : []).concat(entries).slice(-2000);

            await env.FILAMENT_KV.put("deduction-audit", JSON.stringify(merged));
        } catch {
            // logging only - the save above already succeeded either way
        }
    }

    // Best-effort: the inventory is already safely stored, and a broker
    // hiccup must not make the save look like it failed to the dashboard.
    // The scheduled relay will re-publish the same snapshot regardless.
    let relayed = true;

    try {
        await publishToDevice(env, body);
    } catch {
        relayed = false;
    }

    return jsonResponse({ ok: true, relayed, strippedDuplicates: strippedDuplicates.length });
}
