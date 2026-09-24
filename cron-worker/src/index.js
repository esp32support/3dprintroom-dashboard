// Cloudflare Worker Cron Trigger replacing .github/workflows/printer-sync.yml's
// three GitHub Actions steps (filament_relay.py, print_watch.py, power_watch.py).
//
// WHY THIS EXISTS: GitHub's own free-tier schedule cron does not run reliably
// at the declared interval - measured gaps of 25-60 minutes were already
// documented (see this repo's own history), and 2026-09-19 saw gaps over an
// hour, once 4+ hours, overnight. A print shorter than the current gap starts
// AND finishes entirely between two checks and is never observed at all - no
// amount of smarter state-machine logic in the checker itself can fix that,
// because the problem is upstream: the check just never runs during the
// print's whole lifetime. Cloudflare Cron Triggers run on Cloudflare's own
// scheduler (not a third-party CI runner subject to GitHub's queue/priority
// throttling) and are far more reliable at short intervals.
//
// This Worker does NOT need its own KV binding - exactly like the Python
// scripts it replaces, it only ever talks to the dashboard's own
// /api/* endpoints (already deployed, already do their own X-Sync-Secret
// auth) over plain HTTPS, plus the HiveMQ broker over WSS. That means it can
// be deployed under ANY Cloudflare account - it never touches the Pages
// project's KV namespace directly.
import { mqttPublishOnce, mqttSubscribeOnce } from "./mqtt-mini.js";

const HIVEMQ_HOST = "489b8202ba4948fd959020e8eed0cedf.s1.eu.hivemq.cloud";
const HIVEMQ_WSS_URL = `wss://${HIVEMQ_HOST}:8884/mqtt`;

const PRINTER_TOPIC = "ifix/printerroom/jole2026/printer";
const POWER_TOPIC = "ifix/printerroom/jole2026/power";
const FILAMENT_TOPIC = "ifix/printerroom/jole2026/filament";

const BASE_URL = "https://3dprintroom-dashboard.pages.dev";
const STATE_URL = `${BASE_URL}/api/printer-watch-state`;
const TASK_URL = `${BASE_URL}/api/printer-task`;
const SYNC_URL = `${BASE_URL}/api/gcode-sync`;
const FILAMENT_URL = `${BASE_URL}/api/device-filament`;
const POWER_PER_PRINT_URL = `${BASE_URL}/api/power-per-print`;
const HISTORY_URL = `${BASE_URL}/api/power-history`;
const AUTO_OFF_CONFIG_URL = `${BASE_URL}/api/auto-off-config`;
const AUTO_OFF_STATE_URL = `${BASE_URL}/api/auto-off-state`;
const TRIGGER_POWER_URL = `${BASE_URL}/api/trigger-power`;

// Cloudflare's bot protection blocks generic/default client User-Agents
// outright (403) - same fix the Python scripts already needed.
const USER_AGENT = "Mozilla/5.0 (compatible; printer-sync-cron-worker)";

async function apiGet(url, secret) {
    const res = await fetch(url, {
        headers: { "X-Sync-Secret": secret, "User-Agent": USER_AGENT },
    });

    if (!res.ok)
        throw new Error(`GET ${url} -> ${res.status}`);

    return res.json();
}

async function apiPost(url, secret, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "X-Sync-Secret": secret,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok)
        throw new Error(`POST ${url} -> ${res.status}`);

    return res.json();
}

// ===== filament_relay.py port =====

function trimLibraryForDevice(lib) {
    return {
        filaments: (lib.filaments || []).map((f) => ({
            id: f.id || "",
            material: f.material || "",
            colorHex: f.colorHex || "",
            color: f.color || "",
            spools: (f.spools || [])
                .filter((s) => !s.removedAt)
                .map((s) => ({ total: s.total || 0, remaining: s.remaining || 0 })),
        })),
        slotAssignments: lib.slotAssignments || {},
    };
}

async function runFilamentRelay(env) {
    const lib = await apiGet(FILAMENT_URL, env.FILAMENT_SYNC_SECRET);
    const trimmed = trimLibraryForDevice(lib);
    const payload = JSON.stringify(trimmed);

    await mqttPublishOnce({
        url: HIVEMQ_WSS_URL,
        username: env.HIVEMQ_USER,
        password: env.HIVEMQ_PASS,
        topic: FILAMENT_TOPIC,
        payload,
        retain: true,
    });

    console.log(`filament-relay: published ${trimmed.filaments.length} filaments (${payload.length} bytes)`);
}

// ===== print_watch.py port =====

// See that script's own comment - authoritative slot override, checked
// before falling back to the printer's own reported color.
function assignedFilamentForSlot(library, slot) {
    const assignments = library.slotAssignments || {};
    const filamentId = assignments[String(slot)];

    if (!filamentId)
        return null;

    return (library.filaments || []).find((f) => f.id === filamentId) || null;
}

function findMatchingTask(tasks, subtaskName, currentStart) {
    const candidates = tasks.filter((t) => t.title === subtaskName);

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    candidates.sort((a, b) =>
        Math.abs((a.startTime || "").length - currentStart.length) -
        Math.abs((b.startTime || "").length - currentStart.length));

    return candidates[0];
}

function sameState(a, b) {
    return a.gcodeState === b.gcodeState
        && a.subtaskName === b.subtaskName
        && a.currentStart === b.currentStart
        && JSON.stringify(a.trayNowSeen) === JSON.stringify(b.trayNowSeen)
        && (a.startTotalKwh ?? null) === (b.startTotalKwh ?? null);
}

async function pushTrayColorCorrection(env, state, traySeen, trays) {
    console.log(`print finished: ${JSON.stringify(state.subtaskName)}, AMS trays seen: ${JSON.stringify([...traySeen].sort())}`);

    if (traySeen.size === 1) {
        const slot = [...traySeen][0];
        const tray = trays.find((t) => t.id === slot);

        if (!tray || !tray.color || !tray.type) {
            console.log("no live tray data for the active slot - skipping");
            return;
        }

        try {
            const taskData = await apiGet(TASK_URL, env.FILAMENT_SYNC_SECRET);
            const match = findMatchingTask(taskData.tasks || [], state.subtaskName, state.currentStart);
            const matchAmsDetail = (match || {}).amsDetail || [];
            const matchColors = new Set(matchAmsDetail.map((d) => d.color).filter(Boolean));

            if (matchColors.size > 1) {
                console.log(`live sample saw only tray ${slot}, but Task API shows ${matchColors.size} colors for this job - not actually single-color, skipping`);
            } else if (match && match.weight) {
                const library = await apiGet(FILAMENT_URL, env.FILAMENT_SYNC_SECRET);
                const assigned = assignedFilamentForSlot(library, slot);

                const material = assigned ? assigned.material : tray.type;
                const colorHex = (assigned ? assigned.colorHex : tray.color.slice(0, 6)).toUpperCase();

                const result = await apiPost(SYNC_URL, env.FILAMENT_SYNC_SECRET, {
                    printName: state.subtaskName,
                    startTime: state.currentStart,
                    material,
                    colorHex,
                    weight: match.weight,
                });
                console.log(`pushed correction (${assigned ? "assigned" : "live tray"} color): ${JSON.stringify(result)}`);
            } else {
                console.log("no matching Task API weight found - skipping");
            }
        } catch (e) {
            console.log(`correction push failed: ${e.message}`);
        }

        return;
    }

    try {
        const taskData = await apiGet(TASK_URL, env.FILAMENT_SYNC_SECRET);
        const match = findMatchingTask(taskData.tasks || [], state.subtaskName, state.currentStart);
        const amsDetail = (match || {}).amsDetail || [];
        const taskSlots = new Set(amsDetail.map((d) => d.slotId).filter((s) => s !== undefined && s !== null));
        const traySlotsMatch = taskSlots.size === traySeen.size && [...taskSlots].every((s) => traySeen.has(s));

        if (match && amsDetail.length > 0 && traySlotsMatch) {
            const library = await apiGet(FILAMENT_URL, env.FILAMENT_SYNC_SECRET);
            const details = [];

            for (const d of amsDetail) {
                if (!(d.type && d.color && d.weight)) continue;

                const assigned = assignedFilamentForSlot(library, d.slotId);

                details.push({
                    material: assigned ? assigned.material : d.type,
                    colorHex: (assigned ? assigned.colorHex : d.color.slice(0, 6)).toUpperCase(),
                    weight: d.weight,
                });
            }

            if (details.length > 0) {
                const result = await apiPost(SYNC_URL, env.FILAMENT_SYNC_SECRET, {
                    printName: state.subtaskName,
                    startTime: state.currentStart,
                    details,
                });
                console.log(`pushed multi-color correction (${details.length} colors): ${JSON.stringify(result)}`);
            } else {
                console.log("Task API slots matched live trays, but no usable detail weights - skipping");
            }
        } else if (match) {
            console.log(`Task API's AMS slots ${JSON.stringify([...taskSlots].sort())} don't match what was actually seen live ${JSON.stringify([...traySeen].sort())} - assignment looks scrambled, skipping`);
        } else {
            console.log("no matching Task API task found - skipping");
        }
    } catch (e) {
        console.log(`multi-color correction push failed: ${e.message}`);
    }
}

async function runPrintWatch(env, snapshots) {
    const snapshot = snapshots[PRINTER_TOPIC];

    if (!snapshot) {
        console.log("no live snapshot received this run - skipping");
        return;
    }

    const powerSnapshot = snapshots[POWER_TOPIC];
    let totalKwh = null;

    if (powerSnapshot && powerSnapshot.online !== false) {
        const raw = powerSnapshot.totalKwh;
        if (typeof raw === "number" && Number.isFinite(raw))
            totalKwh = raw;
    }

    const gcodeState = snapshot.gcodeState || "";

    // "UNKNOWN": the CYD's own boot-time sentinel, published the moment its
    // HiveMQ connection comes up but before Bambu Cloud has delivered a
    // first real report. Skip entirely, same as no snapshot at all - see
    // print_watch.py's own comment for the exact incident this avoids.
    if (gcodeState === "UNKNOWN") {
        console.log("live snapshot reports the device's own boot-time placeholder state - skipping");
        return;
    }

    const subtaskName = snapshot.subtaskName || "";
    const currentStart = snapshot.currentStart || "";
    const trayNow = snapshot.trayNow;
    const trays = snapshot.trays || [];

    const state = await apiGet(STATE_URL, env.FILAMENT_SYNC_SECRET);

    const wasRunning = state.gcodeState === "RUNNING";
    const nowRunning = gcodeState === "RUNNING";

    // 255 = "no tray selected" (transient, not a color) - see print_watch.py.
    const traySeen = new Set((state.trayNowSeen || []).filter((t) => t !== 255));

    // IDLE included alongside FINISH/FAILED for the exact reason the energy
    // watchdog below needs it - see print_watch.py's own long comment.
    // PAUSE is deliberately excluded either way.
    const isNewPrint = nowRunning && (state.subtaskName !== subtaskName || ["FINISH", "FAILED", "IDLE"].includes(state.gcodeState));

    if (isNewPrint) traySeen.clear();

    if (nowRunning && trayNow !== undefined && trayNow !== null && trayNow !== 255)
        traySeen.add(trayNow);

    let startTotalKwh = state.startTotalKwh ?? null;

    if (isNewPrint) startTotalKwh = totalKwh;

    const hasSubtaskInfo = Boolean(state.subtaskName) && Boolean(state.currentStart);

    // Tray/color correction: FINISH-only on purpose - a PAUSE must never be
    // mistaken for a finish (see print_watch.py's long incident comment).
    if (wasRunning && gcodeState === "FINISH" && hasSubtaskInfo) {
        await pushTrayColorCorrection(env, state, traySeen, trays);
        traySeen.clear();
    }

    // Per-print energy: deliberately broader (FINISH, FAILED, OR IDLE) than
    // the tray/color gate above - see print_watch.py's own comment for why.
    if (wasRunning && ["FINISH", "FAILED", "IDLE"].includes(gcodeState) && hasSubtaskInfo) {
        if (typeof startTotalKwh === "number" && Number.isFinite(startTotalKwh) && totalKwh !== null) {
            try {
                await apiPost(POWER_PER_PRINT_URL, env.FILAMENT_SYNC_SECRET, {
                    printName: state.subtaskName,
                    startTime: state.currentStart,
                    kwh: Math.max(0, totalKwh - startTotalKwh),
                });
                console.log(`pushed per-print energy: ${(totalKwh - startTotalKwh).toFixed(3)} kWh`);
            } catch (e) {
                console.log(`per-print energy push failed: ${e.message}`);
            }
        } else {
            console.log("no start-of-print kWh anchor and/or no current plug reading - energy left untracked for this print");
        }

        startTotalKwh = null;   // consumed
    }

    const newState = {
        gcodeState,
        subtaskName: subtaskName || state.subtaskName || "",
        currentStart: currentStart || state.currentStart || "",
        trayNowSeen: [...traySeen].sort((a, b) => a - b),
        startTotalKwh,
    };

    const oldState = {
        gcodeState: state.gcodeState || "",
        subtaskName: state.subtaskName || "",
        currentStart: state.currentStart || "",
        trayNowSeen: [...(state.trayNowSeen || [])].sort((a, b) => a - b),
        startTotalKwh: state.startTotalKwh ?? null,
    };

    if (!sameState(newState, oldState)) {
        await apiPost(STATE_URL, env.FILAMENT_SYNC_SECRET, newState);
        console.log(`state updated: gcodeState=${JSON.stringify(gcodeState)}, trayNowSeen=${JSON.stringify(newState.trayNowSeen)}`);
    } else {
        console.log(`state unchanged (gcodeState=${JSON.stringify(gcodeState)}) - skipping KV write`);
    }
}

// ===== power_watch.py port =====

async function runPowerWatch(env, snapshots) {
    const snapshot = snapshots[POWER_TOPIC];

    if (!snapshot) {
        console.log("no live power snapshot received this run - skipping");
        return;
    }

    if (snapshot.online === false) {
        console.log(`plug reported offline (${snapshot.error || "no reason given"}) - skipping, not recording a fake zero`);
        return;
    }

    const w = snapshot.powerW ?? 0;
    const v = snapshot.voltage ?? 0;
    const a = snapshot.current ?? 0;
    const kwh = snapshot.todayKwh ?? 0;

    const dateStr = new Date().toISOString().slice(0, 10);

    const result = await apiPost(HISTORY_URL, env.FILAMENT_SYNC_SECRET, { date: dateStr, w, v, a, kwh });
    console.log(`recorded sample for ${dateStr}: ${w}W ${v}V ${a}A today=${kwh}kWh -> ${JSON.stringify(result)}`);
}

// ===== auto power-off when idle =====

// Cuts the plug once the printer has sat idle-eligible (FINISH, FAILED,
// or IDLE - see printer-watch-state.js's idleSince tracking and its own
// comment for why FINISH/FAILED are included, not just literal IDLE) for
// at least the configured idleMinutes AND the relay has been continuously
// on for at least that long too (see auto-off-state.js's own comment for
// why: idleSince only resets when a NEW PRINT starts, so a manual
// re-enable after an auto-off left the old idle timer running in the
// background, already past threshold, and got cut right back off within
// minutes - confirmed live 2026-09-24). PAUSE and PREPARE/SLICING still
// never count as idle-eligible - a paused or actively-starting print must
// never trigger this.
async function runAutoOff(env, snapshots) {
    let config;

    try {
        config = await apiGet(AUTO_OFF_CONFIG_URL, env.FILAMENT_SYNC_SECRET);
    } catch (e) {
        console.log(`auto-off: config fetch failed: ${e.message}`);
        return;
    }

    const powerSnapshot = snapshots[POWER_TOPIC];
    const relayState = powerSnapshot && powerSnapshot.relayState;

    // relayOnSince tracking runs regardless of whether the feature is
    // currently enabled or idle-eligible, so it's always accurate from
    // the moment anyone flips the relay - not just from whenever
    // auto-off itself happens to be turned on.
    let autoOffState;

    try {
        autoOffState = await apiGet(AUTO_OFF_STATE_URL, env.FILAMENT_SYNC_SECRET);
    } catch (e) {
        console.log(`auto-off: state fetch failed: ${e.message}`);
        autoOffState = { relayOnSince: null };
    }

    let relayOnSince = autoOffState.relayOnSince;
    let stateChanged = false;

    if (relayState === "ON") {
        if (!relayOnSince) {
            relayOnSince = new Date().toISOString();
            stateChanged = true;
        }
    } else if (relayOnSince) {
        relayOnSince = null;
        stateChanged = true;
    }

    if (stateChanged) {
        try {
            await apiPost(AUTO_OFF_STATE_URL, env.FILAMENT_SYNC_SECRET, { relayOnSince });
        } catch (e) {
            console.log(`auto-off: state write failed: ${e.message}`);
        }
    }

    if (!config.enabled) {
        console.log("auto-off: disabled - skipping");
        return;
    }

    const state = await apiGet(STATE_URL, env.FILAMENT_SYNC_SECRET);

    if (!state.idleSince) {
        console.log(`auto-off: not idle (gcodeState=${JSON.stringify(state.gcodeState)}) - skipping`);
        return;
    }

    const idleMs = Date.now() - new Date(state.idleSince).getTime();
    const thresholdMs = config.idleMinutes * 60 * 1000;

    if (idleMs < thresholdMs) {
        console.log(`auto-off: idle ${Math.round(idleMs / 60000)}m of ${config.idleMinutes}m threshold - not yet`);
        return;
    }

    if (relayState !== "ON") {
        console.log(`auto-off: threshold reached but relay isn't reporting ON (relayState=${JSON.stringify(relayState)}) - nothing to do`);
        return;
    }

    const relayOnMs = Date.now() - new Date(relayOnSince).getTime();

    if (relayOnMs < thresholdMs) {
        console.log(`auto-off: idle ${Math.round(idleMs / 60000)}m OK, but relay has only been on ${Math.round(relayOnMs / 60000)}m of ${config.idleMinutes}m - not yet (fresh window since it was last turned on)`);
        return;
    }

    try {
        const result = await apiPost(TRIGGER_POWER_URL, env.FILAMENT_SYNC_SECRET, { state: "Off" });
        console.log(`auto-off: idle for ${Math.round(idleMs / 60000)}m and relay on for ${Math.round(relayOnMs / 60000)}m, both >= ${config.idleMinutes}m threshold - powered off: ${JSON.stringify(result)}`);
    } catch (e) {
        console.log(`auto-off: power-off request failed: ${e.message}`);
    }
}

// ===== scheduled entry point =====

async function runAll(env) {
    // Each phase independent - a hiccup in one must not skip the others
    // this same tick (stricter than the GitHub Actions job it replaces,
    // where one failed step aborted the whole run).
    try {
        await runFilamentRelay(env);
    } catch (e) {
        console.log(`filament-relay failed: ${e.message}`);
    }

    let snapshots = {};
    try {
        snapshots = await mqttSubscribeOnce({
            url: HIVEMQ_WSS_URL,
            username: env.HIVEMQ_USER,
            password: env.HIVEMQ_PASS,
            topics: [PRINTER_TOPIC, POWER_TOPIC],
            timeoutMs: 10000,
        });
    } catch (e) {
        console.log(`MQTT subscribe failed: ${e.message}`);
    }

    try {
        await runPrintWatch(env, snapshots);
    } catch (e) {
        console.log(`print-watch failed: ${e.message}`);
    }

    try {
        await runPowerWatch(env, snapshots);
    } catch (e) {
        console.log(`power-watch failed: ${e.message}`);
    }

    try {
        await runAutoOff(env, snapshots);
    } catch (e) {
        console.log(`auto-off failed: ${e.message}`);
    }
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runAll(env));
    },

    // Lets a browser hit the Worker's URL directly to trigger one run on
    // demand (same purpose as printer-sync.yml's workflow_dispatch) - handy
    // for testing without waiting for the next cron tick.
    async fetch(request, env, ctx) {
        await runAll(env);
        return new Response("triggered\n");
    },
};
