// GET /api/printer-task
// Bambu Cloud's Tasks API (not the MQTT feed) is the only place the actual
// slicer-computed filament weight per tray/color/material lives - the MQTT
// report's remain%/print_weight fields never populate for this printer
// (confirmed live). This also doubles as a much more reliable "what's
// currently loaded" source than MQTT's sparse tray_now field, since it's
// the AMS slot the print job was actually assigned to.
//
// Fetches the last 10 tasks (not just the latest) so the dashboard can
// match weight/AMS data onto older print-history entries too, not only the
// current job - the device's own history has no weight data at all (its
// remain% never moves on this AMS-lite printer), so this is the only
// source for it once a print has finished.
//
// Needs a Bambu Cloud access token as a Pages secret (BAMBU_ACCESS_TOKEN) -
// obtained via the same account-login + emailed 2FA flow used to set up
// the printer's cloud MQTT connection. Tokens run out after ~90 days and
// need to be regenerated the same way.
//
// Dual auth: the dashboard's own UI calls this with a session cookie
// (already verified by _middleware.js in the normal case), but this path
// is ALSO allowlisted as public so the LAN-free print-watch job
// (scripts/print_watch.py, no browser session) can reach it with an
// X-Sync-Secret header instead - checked here explicitly since the
// middleware skips its own cookie check for allowlisted paths.
import { verifySessionCookie } from "../_lib/session.js";

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

async function checkAuth(request, env) {
    const provided = request.headers.get("X-Sync-Secret");

    if (provided) {
        return provided === env.LOCAL_SYNC_SECRET;
    }

    const cookie = request.headers.get("Cookie");
    return verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!(await checkAuth(request, env))) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    if (!env.BAMBU_ACCESS_TOKEN) {
        return jsonResponse({ error: "BAMBU_ACCESS_TOKEN not configured" }, 501);
    }

    const deviceId = env.BAMBU_DEVICE_ID || "";
    const url = `https://api.bambulab.com/v1/user-service/my/tasks?limit=10&deviceId=${encodeURIComponent(deviceId)}`;

    let res;
    try {
        res = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": "bambu_network_agent/01.09.05.01",
                Authorization: `Bearer ${env.BAMBU_ACCESS_TOKEN}`,
            },
        });
    } catch (err) {
        return jsonResponse({ error: `Bambu Cloud request failed: ${err.message}` }, 502);
    }

    if (!res.ok) {
        return jsonResponse({ error: `Bambu Cloud returned ${res.status}` }, 502);
    }

    const data = await res.json();
    const hits = data.hits || [];

    const simplify = (task) => ({
        title: task.title || "",
        weight: task.weight || 0,
        length: task.length || 0,
        startTime: task.startTime || "",
        endTime: task.endTime || "",
        amsDetail: (task.amsDetailMapping || []).map((d) => ({
            amsId: d.amsId,
            slotId: d.slotId,
            color: d.sourceColor || d.targetColor || "",
            type: d.filamentType || "",
            weight: d.weight || 0,
        })),
    });

    const tasks = hits.map(simplify);

    return jsonResponse({
        task: tasks[0] || null,
        tasks,
    });
}
