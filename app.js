const levels = ["good", "warning", "high", "critical"];

function byId(id)
{
    return document.getElementById(id);
}

function formatTime(seconds)
{
    const value = Number(seconds) || 0;
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;

    if (h > 0)
        return `${h} h ${m} min`;

    if (m > 0)
        return `${m} min ${s} s`;

    return `${s} s`;
}

function clamp(value, min, max)
{
    return Math.min(max, Math.max(min, value));
}

function setText(id, value)
{
    const el = byId(id);

    if (el)
        el.textContent = value;
}

function setBar(id, value, max, color)
{
    const el = byId(id);

    if (!el)
        return;

    el.style.width = `${clamp((value / max) * 100, 0, 100)}%`;
    el.style.backgroundColor = color;
}

function alarmClass(level)
{
    return levels[clamp(Number(level) || 0, 0, 3)];
}

function colorForLevel(level)
{
    switch (alarmClass(level))
    {
        case "critical":
            return "var(--red)";
        case "high":
            return "var(--orange)";
        case "warning":
            return "var(--yellow)";
        default:
            return "var(--green)";
    }
}

function colorForAirState(state)
{
    switch (Number(state) || 0)
    {
        case 5:
            return "var(--red)";
        case 4:
        case 3:
            return "var(--orange)";
        case 2:
        case 1:
            return "var(--yellow)";
        default:
            return "var(--green)";
    }
}

function trendClass(direction)
{
    const value = String(direction || "STABLE").toLowerCase();

    if (value === "rising")
        return "trend rising";

    if (value === "falling")
        return "trend falling";

    return "trend stable";
}

function setTrend(id, direction, strength)
{
    const el = byId(id);

    if (!el)
        return;

    const directionLabel = direction || "STABLE";
    const strengthLabel = strength && strength !== "None" ? strength : "Stable";
    const prefix = directionLabel === "RISING" ? "↑ " : directionLabel === "FALLING" ? "↓ " : "- ";

    el.textContent = prefix + strengthLabel;
    el.className = trendClass(directionLabel);
}

function healthLabel(ok)
{
    return ok ? "OK" : "FAULT";
}

function setSensorState(id, name, ok)
{
    const el = byId(id);

    if (!el)
        return;

    el.textContent = `${name} ${healthLabel(ok)}`;
    el.style.borderLeftColor = ok ? "var(--green)" : "var(--red)";
}

function updateAlarm(data)
{
    const banner = byId("alarmBanner");
    const cls = alarmClass(data.alarmLevel);

    banner.className = `alarmBanner ${cls}`;

    if (data.alarmLevel >= 2)
        banner.classList.add("alarmPulse");

    banner.style.borderLeftColor = colorForLevel(data.alarmLevel);

    setText("alarmText", data.alarmText || "GOOD");
    setText("alarmMessage", data.alarmMessage || "Air quality normal");
}

function updateStatus(data)
{
    const tempAvg = Number.isFinite(data.tempAvg)
        ? data.tempAvg
        : (data.tempAHT + data.tempBME) / 2;

    const humAvg = Number.isFinite(data.humAvg)
        ? data.humAvg
        : (data.humAHT + data.humBME) / 2;

    setText("tempAvg", tempAvg.toFixed(1));
    setText("tempAHT", `${data.tempAHT.toFixed(2)} °C`);
    setText("tempBME", `${data.tempBME.toFixed(2)} °C`);
    setBar("tempBar", tempAvg, 45, tempAvg >= 35 ? "var(--orange)" : "var(--cyan)");

    setText("humAvg", humAvg.toFixed(1));
    setText("humAHT", `${data.humAHT.toFixed(1)} %`);
    setText("humBME", `${data.humBME.toFixed(1)} %`);
    setBar("humBar", humAvg, 100, humAvg >= 70 ? "var(--orange)" : "var(--cyan)");

    setText("aqi", data.aqi);
    setText("tvoc", `${data.tvoc} ppb`);
    setText("eco2", `${data.eco2} ppm`);

    setBar("tvocBar", data.tvoc, 500, data.tvoc >= 300 ? "var(--orange)" : "var(--cyan)");
    setBar("eco2Bar", data.eco2, 2000, data.eco2 >= 1200 ? "var(--orange)" : "var(--cyan)");

    const airColor = colorForAirState(data.airQualityState);
    const airScore = Number(data.airQualityScore) || 0;

    const aqiDial = byId("aqiDial");
    if (aqiDial)
        aqiDial.style.borderColor = airColor;

    setTrend("temperatureTrend", data.temperatureTrendText, data.temperatureTrendStrengthText);
    setTrend("humidityTrend", data.humidityTrendText, data.humidityTrendStrengthText);
    setTrend("tvocTrend", data.tvocTrendText, data.tvocTrendStrengthText);
    setTrend("eco2Trend", data.eco2TrendText, data.eco2TrendStrengthText);

    setText("airStateText", data.airQualityText || "Air quality stable");
    setText("airStateMessage", data.airQualityMessage || "Room conditions are steady");
    setText("airScore", `${airScore} / 100`);

    setBar("airStateBar", airScore, 100, airColor);

    const airState = byId("airStateText");
    if (airState)
        airState.style.color = airColor;

    setText("predictionText", data.predictionText || "Likely stable");
    setText("predictionMessage", data.predictionMessage || "No strong movement detected");

    setText("ssid", data.ssid || "--");
    setText("ip", data.ip || "--");

    setText("wifi", `${data.wifi} dBm`);
    setText("mqtt", data.mqttConnected ? "CONNECTED" : "DISCONNECTED");
    setText("watchdog", data.watchdogSafeMode ? "SAFE MODE" : data.watchdogHealthy ? "OK" : "WARNING");
    setText("heap", `${Math.round(data.freeHeap / 1024)} kB`);
    setText("espTemp", `${Number(data.espTemp).toFixed(1)} °C`);
    setText("uptime", formatTime(data.uptime));
    setText("firmware", data.firmware || "--");
    setText("watchdogReason", data.watchdogReason || "OK");
    setText("connectionState", "ONLINE");

    setBar("heapBar", data.freeHeap / 1024, 320,
        data.freeHeap < 50000 ? "var(--orange)" : "var(--green)");

    setText("pressure", `${data.pressure.toFixed(1)} hPa`);
    setText("pressureDetail", `${data.pressure.toFixed(1)} hPa`);
    setText("lastUpdate", new Date().toLocaleTimeString([], { hour12: false }));

    setSensorState("ahtState", "AHT21", data.ahtOK !== false);
    setSensorState("bmeState", "BME280", data.bmeOK !== false);
    setSensorState("ensState", "ENS160", data.ensOK !== false);

    updateAlarm(data);
    renderHistory(data.history);
}

function renderHistory(items)
{
    const list = byId("historyList");

    if (!list)
        return;

    list.innerHTML = "";

    if (!items || items.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No alarm history";
        list.appendChild(empty);
        return;
    }

    [...items].reverse().forEach(item =>
    {
        const row = document.createElement("div");
        row.className = "historyItem";
        row.style.borderLeftColor = colorForLevel(item.level);

        const left = document.createElement("div");

        const title = document.createElement("strong");
        const message = document.createElement("small");

        title.textContent = item.text || "GOOD";
        message.textContent = item.message || "";

        left.appendChild(title);
        left.appendChild(message);

        const time = document.createElement("span");
        time.textContent = item.time || "--";

        row.appendChild(left);
        row.appendChild(time);

        list.appendChild(row);
    });
}

function setOffline(message)
{
    const banner = byId("alarmBanner");

    banner.className = "alarmBanner critical alarmPulse";
    banner.style.borderLeftColor = "var(--red)";

    setText("alarmText", "OFFLINE");
    setText("alarmMessage", message || "No data from device");
    setText("connectionState", "OFFLINE");
    setText("watchdogReason", "No message received");
}

// ===== MQTT (browser, over Secure WebSockets) =====

let lastMessageAt = 0;
const STALE_AFTER_MS = 30000; // SEND_INTERVAL is 5s; 30s silence => treat as offline

const client = mqtt.connect(`wss://${BROKER_CONFIG.host}:${BROKER_CONFIG.port}/mqtt`, {
    username: BROKER_CONFIG.username,
    password: BROKER_CONFIG.password,
    clientId: `dashboard-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 3000,
});

client.on("connect", () =>
{
    setText("brokerState", "CONNECTED");
    setText("brokerMessage", "Connected. Waiting for the device's next publish...");

    client.subscribe(BROKER_CONFIG.topic, (err) =>
    {
        if (err)
            setText("brokerMessage", `Subscribe failed: ${err.message}`);
    });
});

client.on("reconnect", () =>
{
    setText("brokerState", "RECONNECTING");
});

client.on("close", () =>
{
    setText("brokerState", "DISCONNECTED");
    setOffline("Broker connection lost");
});

client.on("error", (err) =>
{
    setText("brokerState", "ERROR");
    setText("brokerMessage", err.message || String(err));
});

client.on("message", (topic, payload) =>
{
    try
    {
        const data = JSON.parse(payload.toString());
        lastMessageAt = Date.now();
        setText("brokerMessage", "Live data streaming.");
        updateStatus(data);
    }
    catch (err)
    {
        setText("brokerMessage", `Bad payload: ${err.message}`);
    }
});

setOffline("Connecting to broker...");

setInterval(() =>
{
    if (lastMessageAt && Date.now() - lastMessageAt > STALE_AFTER_MS)
        setOffline("Device has not published in over 30s");
}, 5000);
