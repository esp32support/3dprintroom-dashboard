// Minimal, dependency-free MQTT 3.1.1 client for the Cloudflare Workers
// runtime's standard WebSocket API - no npm MQTT library, matching this
// project's existing functions/_lib/mqtt-mini.js (publish-only, used by
// the dashboard's trigger-* endpoints). This copy adds SUBSCRIBE + reading
// incoming PUBLISH packets, which THIS worker needs (it has to read the
// printer's and plug's own retained state), and folds the original
// publish-only path in too so this worker needs only one MQTT module.
//
// Verified packet-building logic is identical to the original mqtt-mini.js
// (already confirmed live against the real HiveMQ Cloud broker).

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
    if (bytes.length > 0xFFFF)
        throw new Error("string too long for MQTT length-prefixed field");
    return [(bytes.length >> 8) & 0xFF, bytes.length & 0xFF, ...bytes];
}

function buildConnectPacket({ clientId, username, password, keepAliveSeconds }) {
    const variableHeader = [
        ...encodeUtf8String("MQTT"),
        0x04,                    // Protocol Level: MQTT 3.1.1
        0xC2,                    // Connect Flags: username=1, password=1, clean session=1
        (keepAliveSeconds >> 8) & 0xFF, keepAliveSeconds & 0xFF,
    ];

    const payload = [
        ...encodeUtf8String(clientId),
        ...encodeUtf8String(username),
        ...encodeUtf8String(password),
    ];

    const remaining = variableHeader.length + payload.length;

    return new Uint8Array([
        0x10,
        ...encodeRemainingLength(remaining),
        ...variableHeader,
        ...payload,
    ]);
}

function buildPublishPacket({ topic, payload, retain = false }) {
    const topicBytes = encodeUtf8String(topic);
    const payloadBytes = new TextEncoder().encode(payload);
    const remaining = topicBytes.length + payloadBytes.length;

    return new Uint8Array([
        0x30 | (retain ? 0x01 : 0x00),
        ...encodeRemainingLength(remaining),
        ...topicBytes,
        ...payloadBytes,
    ]);
}

function buildSubscribePacket({ packetId, topics }) {
    const variableHeader = [(packetId >> 8) & 0xFF, packetId & 0xFF];
    const payload = [];

    for (const topic of topics)
        payload.push(...encodeUtf8String(topic), 0x00);   // QoS 0

    const remaining = variableHeader.length + payload.length;

    // 0x82 = SUBSCRIBE (packet type 8, flags 0010 - fixed per spec)
    return new Uint8Array([0x82, ...encodeRemainingLength(remaining), ...variableHeader, ...payload]);
}

const DISCONNECT_PACKET = new Uint8Array([0xE0, 0x00]);

// Publishes a single message and resolves once the socket has cleanly closed.
export function mqttPublishOnce({ url, username, password, topic, payload, retain = false, timeoutMs = 10000 }) {
    return new Promise((resolve, reject) => {
        const clientId = "worker-pub-" + Math.random().toString(16).slice(2, 10);
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* already closed/never opened */ }
            reject(new Error("MQTT publish timed out"));
        }, timeoutMs);

        const ws = new WebSocket(url, ["mqtt"]);
        ws.binaryType = "arraybuffer";

        ws.addEventListener("open", () => {
            ws.send(buildConnectPacket({ clientId, username, password, keepAliveSeconds: 30 }));
        });

        let connacked = false;

        ws.addEventListener("message", (event) => {
            const data = new Uint8Array(event.data);

            if (!connacked) {
                if (data[0] !== 0x20) {
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error(`expected CONNACK, got packet type 0x${data[0]?.toString(16)}`));
                    ws.close();
                    return;
                }

                if (data[3] !== 0x00) {
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error(`MQTT CONNECT refused, return code ${data[3]}`));
                    ws.close();
                    return;
                }

                connacked = true;
                ws.send(buildPublishPacket({ topic, payload, retain }));
                ws.send(DISCONNECT_PACKET);
                ws.close();
            }
        });

        ws.addEventListener("close", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            if (!connacked) {
                reject(new Error("connection closed before CONNACK"));
                return;
            }

            resolve();
        });

        ws.addEventListener("error", (event) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`WebSocket error: ${event.message || "unknown"}`));
        });
    });
}

// Subscribes to one or more topics (QoS 0) and collects each topic's first
// delivered message (retained messages land immediately on subscribe,
// exactly like scripts/print_watch.py's fetch_live_snapshots() over plain
// MQTT). Resolves with whatever was collected once every topic has a
// message, OR on timeout with a PARTIAL result - a topic that has never
// published a retained message legitimately has nothing to wait for, same
// as the Python version's own "give up after ~10s" loop.
export function mqttSubscribeOnce({ url, username, password, topics, timeoutMs = 10000 }) {
    return new Promise((resolve) => {
        const clientId = "worker-sub-" + Math.random().toString(16).slice(2, 10);
        const got = {};
        let settled = false;
        let connacked = false;

        function finish() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.send(DISCONNECT_PACKET); } catch { /* ignore */ }
            try { ws.close(); } catch { /* ignore */ }
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

            // A single WebSocket frame can carry more than one MQTT packet
            // (e.g. CONNACK immediately followed by a retained PUBLISH) -
            // loop until the whole frame is consumed rather than assuming
            // one packet per frame.
            while (offset < data.length) {
                const packetType = data[offset] & 0xF0;
                const { value: remaining, nextOffset } = decodeRemainingLength(data, offset + 1);
                const bodyStart = nextOffset;
                const bodyEnd = bodyStart + remaining;

                if (!connacked) {
                    if (packetType !== 0x20) {
                        finish();
                        return;
                    }

                    if (data[bodyStart + 1] !== 0x00) {
                        finish();
                        return;
                    }

                    connacked = true;
                    ws.send(buildSubscribePacket({ packetId: 1, topics }));
                }
                else if (packetType === 0x30) {
                    const topicLen = (data[bodyStart] << 8) | data[bodyStart + 1];
                    const topicStart = bodyStart + 2;
                    const topicEnd = topicStart + topicLen;
                    const topic = new TextDecoder().decode(data.slice(topicStart, topicEnd));
                    // QoS 0 PUBLISH has no packet-id field between topic and payload.
                    const payloadText = new TextDecoder().decode(data.slice(topicEnd, bodyEnd));

                    try {
                        got[topic] = JSON.parse(payloadText);
                    } catch {
                        got[topic] = payloadText;
                    }

                    if (Object.keys(got).length === topics.length) {
                        finish();
                        return;
                    }
                }
                // SUBACK (0x90) and anything else: nothing to do, keep waiting.

                offset = bodyEnd;
            }
        });

        ws.addEventListener("close", () => finish());
        ws.addEventListener("error", () => finish());
    });
}
