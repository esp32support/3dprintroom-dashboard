// GET /api/_temp-printer-snapshot - TEMP, read-only, deleted after use.
// Subscribes once to the retained PRINTER_TOPIC message and returns it as
// JSON - same diagnostic used earlier this session for the CYD
// Bambu-Cloud-stuck incident.
function encodeRemainingLength(length) {
    const bytes = [];
    do {
        let digit = length % 128;
        length = Math.floor(length / 128);
        if (length > 0) digit |= 0x80;
        bytes.push(digit);
    } while (length > 0);
    return bytes;
}

function decodeRemainingLength(bytes, offset) {
    let multiplier = 1;
    let value = 0;
    let i = offset;
    let encodedByte;

    do {
        encodedByte = bytes[i++];
        value += (encodedByte & 0x7F) * multiplier;
        multiplier *= 128;
    } while ((encodedByte & 0x80) !== 0);

    return { value, nextOffset: i };
}

function encodeUtf8String(str) {
    const bytes = new TextEncoder().encode(str);
    return [(bytes.length >> 8) & 0xFF, bytes.length & 0xFF, ...bytes];
}

function buildConnectPacket({ clientId, username, password, keepAliveSeconds }) {
    const variableHeader = [
        ...encodeUtf8String("MQTT"),
        0x04,
        0xC2,
        (keepAliveSeconds >> 8) & 0xFF, keepAliveSeconds & 0xFF,
    ];

    const payload = [
        ...encodeUtf8String(clientId),
        ...encodeUtf8String(username),
        ...encodeUtf8String(password),
    ];

    const remaining = variableHeader.length + payload.length;

    return new Uint8Array([0x10, ...encodeRemainingLength(remaining), ...variableHeader, ...payload]);
}

function buildSubscribePacket({ packetId, topics }) {
    const variableHeader = [(packetId >> 8) & 0xFF, packetId & 0xFF];
    const payload = [];

    for (const topic of topics)
        payload.push(...encodeUtf8String(topic), 0x00);

    const remaining = variableHeader.length + payload.length;
    return new Uint8Array([0x82, ...encodeRemainingLength(remaining), ...variableHeader, ...payload]);
}

const DISCONNECT_PACKET = new Uint8Array([0xE0, 0x00]);

function mqttSubscribeOnce({ url, username, password, topics, timeoutMs = 10000 }) {
    return new Promise((resolve) => {
        const clientId = "pages-diag-" + Math.random().toString(16).slice(2, 10);
        const got = {};
        let settled = false;
        let connacked = false;

        function finish() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.send(DISCONNECT_PACKET); } catch {}
            try { ws.close(); } catch {}
            resolve(got);
        }

        const timer = setTimeout(finish, timeoutMs);
        const ws = new WebSocket(url, ["mqtt"]);
        ws.binaryType = "arraybuffer";

        ws.addEventListener("open", () => {
            ws.send(buildConnectPacket({ clientId, username, password, keepAliveSeconds: 30 }));
        });

        ws.addEventListener("message", (event) => {
            const data = new Uint8Array(event.data);
            let offset = 0;

            while (offset < data.length) {
                const packetType = data[offset] & 0xF0;
                const { value: remaining, nextOffset } = decodeRemainingLength(data, offset + 1);
                const bodyStart = nextOffset;
                const bodyEnd = bodyStart + remaining;

                if (!connacked) {
                    if (packetType !== 0x20) { finish(); return; }
                    if (data[bodyStart + 1] !== 0x00) { finish(); return; }
                    connacked = true;
                    ws.send(buildSubscribePacket({ packetId: 1, topics }));
                } else if (packetType === 0x30) {
                    const topicLen = (data[bodyStart] << 8) | data[bodyStart + 1];
                    const topicStart = bodyStart + 2;
                    const topicEnd = topicStart + topicLen;
                    const topic = new TextDecoder().decode(data.slice(topicStart, topicEnd));
                    const payloadText = new TextDecoder().decode(data.slice(topicEnd, bodyEnd));

                    try { got[topic] = JSON.parse(payloadText); } catch { got[topic] = payloadText; }

                    if (Object.keys(got).length === topics.length) { finish(); return; }
                }

                offset = bodyEnd;
            }
        });

        ws.addEventListener("close", () => finish());
        ws.addEventListener("error", () => finish());
    });
}

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

export async function onRequestGet(context) {
    const { request, env } = context;

    if ((request.headers.get("X-Sync-Secret") || "") !== env.LOCAL_SYNC_SECRET) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const topic = `${env.MQTT_TOPIC}/printer`;

    const snapshots = await mqttSubscribeOnce({
        url: `wss://${env.MQTT_HOST}:8884/mqtt`,
        username: env.MQTT_MASTER_USERNAME,
        password: env.MQTT_MASTER_PASSWORD,
        topics: [topic],
        timeoutMs: 10000,
    });

    return jsonResponse({ fetchedAt: new Date().toISOString(), snapshot: snapshots[topic] || null });
}
