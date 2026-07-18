// GET /api/printer-task
// Bambu Cloud's Tasks API (not the MQTT feed) is the only place the actual
// slicer-computed filament weight per tray/color/material lives - the MQTT
// report's remain%/print_weight fields never populate for this printer
// (confirmed live). This also doubles as a much more reliable "what's
// currently loaded" source than MQTT's sparse tray_now field, since it's
// the AMS slot the print job was actually assigned to.
//
// Needs a Bambu Cloud access token as a Pages secret (BAMBU_ACCESS_TOKEN) -
// obtained via the same account-login + emailed 2FA flow used to set up
// the printer's cloud MQTT connection. Tokens run out after ~90 days and
// need to be regenerated the same way.
function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function onRequestGet(context) {
    const { env } = context;

    if (!env.BAMBU_ACCESS_TOKEN) {
        return jsonResponse({ error: "BAMBU_ACCESS_TOKEN not configured" }, 501);
    }

    const deviceId = env.BAMBU_DEVICE_ID || "";
    const url = `https://api.bambulab.com/v1/user-service/my/tasks?limit=1&deviceId=${encodeURIComponent(deviceId)}`;

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
    const task = (data.hits || [])[0];

    if (!task) {
        return jsonResponse({ task: null });
    }

    return jsonResponse({
        task: {
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
        },
    });
}
