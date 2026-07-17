// Minimal, dependency-free MQTT 3.1.1 client: CONNECT + one PUBLISH (QoS 0) + DISCONNECT.
// Built for Cloudflare Pages Functions, which support the standard WebSocket API for
// outbound connections but have no npm bundling set up in this project - a full MQTT
// client library (mqtt.js) would need a build step this project doesn't have. This does
// only what the OTA trigger needs: connect, publish one message, disconnect.
//
// Verified against the real HiveMQ Cloud broker with an independent Python subscriber
// before this ever became a deployed endpoint (round-tripped topic + payload correctly).

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
        0x10,                              // packet type: CONNECT
        ...encodeRemainingLength(remaining),
        ...variableHeader,
        ...payload,
    ]);
}

function buildPublishPacket({ topic, payload }) {
    const topicBytes = encodeUtf8String(topic);
    const payloadBytes = new TextEncoder().encode(payload);
    const remaining = topicBytes.length + payloadBytes.length;

    return new Uint8Array([
        0x30,                              // packet type: PUBLISH, QoS 0, no retain, no dup
        ...encodeRemainingLength(remaining),
        ...topicBytes,
        ...payloadBytes,
    ]);
}

const DISCONNECT_PACKET = new Uint8Array([0xE0, 0x00]);

// Publishes a single message and resolves once the socket has cleanly closed.
// Rejects on connect failure, bad CONNACK, or timeout.
export function mqttPublishOnce({ url, username, password, topic, payload, timeoutMs = 10000 }) {
    return new Promise((resolve, reject) => {
        const clientId = "trigger-" + Math.random().toString(16).slice(2, 10);
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* already closed/never opened */ }
            reject(new Error("MQTT operation timed out"));
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

                const returnCode = data[3];
                if (returnCode !== 0x00) {
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error(`MQTT CONNECT refused, return code ${returnCode}`));
                    ws.close();
                    return;
                }

                connacked = true;
                ws.send(buildPublishPacket({ topic, payload }));
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
