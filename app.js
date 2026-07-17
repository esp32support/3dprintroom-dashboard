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
    // 0=Excellent 1=Good 2=Fair 3=Moderate 4=Poor 5=Very Poor 6=Hazardous
    switch (Number(state) || 0)
    {
        case 6:
            return "var(--black)";
        case 5:
            return "var(--darkred)";
        case 4:
            return "var(--red)";
        case 3:
            return "var(--orange)";
        case 2:
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

    setText("bootCountTotal", data.bootCountTotal ?? "--");
    renderBootHistory(data.bootHistory);

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
    renderSystemEvents(data.systemEvents);
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

function detailForResetReason(reason)
{
    switch (reason)
    {
        case "Power-on":
            return "Cold start - power was applied (includes a USB flash/reset).";
        case "External reset pin":
            return "EN pin pulled low - the physical reset button or an external circuit.";
        case "Software (ESP.restart)":
            return "The firmware called ESP.restart() itself, e.g. after an OTA update.";
        case "Software panic/crash":
            return "The firmware crashed (exception / bad memory access) and auto-rebooted.";
        case "Interrupt watchdog":
            return "An interrupt handler ran too long and tripped the interrupt watchdog.";
        case "Task watchdog (loop stalled)":
            return "loop() didn't return in time - something blocked it too long.";
        case "Other watchdog":
            return "A watchdog fired for a reason outside the categories above.";
        case "Deep sleep wake":
            return "Woke from deep sleep (this firmware doesn't use deep sleep).";
        case "Brownout (power sag)":
            return "Supply voltage dropped too low - check the USB cable/power supply.";
        case "SDIO reset":
            return "Reset via the SDIO slave interface (not used by this device).";
        case "Remote reboot (dashboard)":
        case "Remote reboot (LAN dashboard)":
            return "You (or someone with the reboot password) triggered this restart intentionally.";
        case "Firmware update (remote/MQTT)":
            return "A firmware update was triggered remotely and applied successfully.";
        case "Firmware update (LAN upload)":
            return "A firmware update was uploaded via the LAN dashboard and applied successfully.";
        case "Dashboard files update (remote/MQTT)":
            return "The LAN dashboard's files (HTML/CSS/JS) were updated remotely.";
        default:
            return "Reset reason not recognized by the firmware.";
    }
}

function colorForResetReason(reason)
{
    const text = (reason || "").toLowerCase();

    if (text.includes("brownout") || text.includes("panic") || text.includes("watchdog"))
        return "var(--red)";

    if (text.includes("unknown") || text.includes("sdio") || text.includes("external"))
        return "var(--orange)";

    return "var(--green)";  // Power-on, Software (ESP.restart), Deep sleep wake
}

function renderBootHistory(items)
{
    const list = byId("bootHistoryList");

    if (!list)
        return;

    list.innerHTML = "";

    if (!items || items.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No boot history yet";
        list.appendChild(empty);
        return;
    }

    // Already newest-first from the device, unlike the alarm history array.
    items.forEach(item =>
    {
        const row = document.createElement("div");
        row.className = "historyItem";
        row.style.borderLeftColor = colorForResetReason(item.reason);

        const left = document.createElement("div");
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        title.textContent = item.reason || "Unknown";
        detail.textContent = detailForResetReason(item.reason);
        left.appendChild(title);
        left.appendChild(detail);

        const time = document.createElement("span");
        time.textContent = item.time && item.time !== "pending" ? item.time : "syncing...";

        row.appendChild(left);
        row.appendChild(time);

        list.appendChild(row);
    });
}

function renderSystemEvents(items)
{
    const list = byId("systemEventsList");

    if (!list)
        return;

    list.innerHTML = "";

    if (!items || items.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No events this session yet";
        list.appendChild(empty);
        return;
    }

    // Already newest-first from the device (RAM-only log, cleared on reboot).
    items.forEach(item =>
    {
        const row = document.createElement("div");
        row.className = "historyItem";
        row.style.borderLeftColor = "var(--cyan)";

        const left = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = item.text || "--";
        left.appendChild(title);

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

// ===== Printer tab =====

// The printer reports tray colours as hex RRGGBBAA; CSS wants #RRGGBB.
function trayColorCss(hex)
{
    if (!hex || hex.length < 6)
        return "#2a3136";   // unknown - neutral grey

    return "#" + hex.slice(0, 6);
}

function trayLabel(tray)
{
    if (!tray)
        return "--";

    // type is blank until the printer actually reports the tray's filament.
    return tray.type ? `Tray ${tray.id + 1} - ${tray.type}` : `Tray ${tray.id + 1}`;
}

// Firmware packs per-tray usage as "id:color:type:amount;id:color:type:amount"
function parseTrayUsage(packed)
{
    if (!packed)
        return [];

    return packed.split(";").filter(Boolean).map(chunk =>
    {
        const [id, color, type, amount] = chunk.split(":");
        return { id: Number(id), color, type, amount };
    });
}

function usageChip(entry)
{
    const chip = document.createElement("span");
    chip.className = "usageChip";

    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = trayColorCss(entry.color);

    const label = document.createElement("span");
    label.textContent = `${entry.type || "?"} ${entry.amount || ""}`.trim();

    chip.appendChild(sw);
    chip.appendChild(label);
    return chip;
}

function renderTrays(trays, trayNow)
{
    const list = byId("trayList");

    if (!list)
        return;

    list.innerHTML = "";

    if (!trays || trays.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No tray data yet";
        list.appendChild(empty);
        return;
    }

    trays.forEach(tray =>
    {
        const row = document.createElement("div");
        row.className = "trayItem" + (tray.id === trayNow ? " active" : "");

        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = trayColorCss(tray.color);

        const meta = document.createElement("div");
        meta.className = "trayMeta";

        const title = document.createElement("strong");
        title.textContent = trayLabel(tray);

        const sub = document.createElement("small");

        if (tray.id === trayNow)
            sub.textContent = "Currently printing";
        else if (!tray.type)
            sub.textContent = "No filament data";
        else
            sub.textContent = "Idle";

        meta.appendChild(title);
        meta.appendChild(sub);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "infoBtn";
        btn.textContent = "New spool";
        btn.dataset.trayId = tray.id;
        btn.addEventListener("click", () => onNewSpool(tray.id, btn));

        row.appendChild(sw);
        row.appendChild(meta);
        row.appendChild(btn);

        list.appendChild(row);
    });
}

function renderPrintHistory(items)
{
    const list = byId("printHistoryList");

    if (!list)
        return;

    list.innerHTML = "";

    if (!items || items.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No prints logged yet";
        list.appendChild(empty);
        return;
    }

    // Already newest-first from the device.
    items.forEach(item =>
    {
        const row = document.createElement("div");
        row.className = "historyItem";
        row.style.borderLeftColor = "var(--cyan)";

        const left = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = item.name || "Untitled";
        left.appendChild(title);

        const sub = document.createElement("small");
        sub.textContent = `${item.layers || 0} layers - ${item.start || "?"}`;
        left.appendChild(sub);

        const usage = parseTrayUsage(item.trays);

        if (usage.length > 0)
        {
            const chips = document.createElement("div");
            chips.className = "usageChips";
            usage.forEach(e => chips.appendChild(usageChip(e)));
            left.appendChild(chips);
        }

        const time = document.createElement("span");
        time.textContent = printDuration(item.start, item.end);

        row.appendChild(left);
        row.appendChild(time);

        list.appendChild(row);
    });
}

// Firmware timestamps are local "YYYY-MM-DD HH:MM:SS" strings.
function parseDeviceTime(s)
{
    if (!s || s === "unknown" || s === "pending")
        return null;

    const d = new Date(s.replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d;
}

function printDuration(start, end)
{
    const a = parseDeviceTime(start);
    const b = parseDeviceTime(end);

    if (!a || !b)
        return "--";

    return formatTime(Math.max(0, Math.round((b - a) / 1000)));
}

function isToday(s)
{
    const d = parseDeviceTime(s);

    if (!d)
        return false;

    const now = new Date();
    return d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
}

function renderTodayTotals(items)
{
    const list = byId("todayTotalsList");

    if (!list)
        return;

    list.innerHTML = "";

    const todays = (items || []).filter(i => isToday(i.start));
    setText("todayPrintCount", `${todays.length} print${todays.length === 1 ? "" : "s"}`);

    if (todays.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No prints logged today";
        list.appendChild(empty);
        return;
    }

    // Group by colour+material: two different "reds" (e.g. red PLA vs red
    // PETG) stay separate rather than being merged into one bogus total.
    const groups = new Map();

    todays.forEach(item =>
    {
        parseTrayUsage(item.trays).forEach(e =>
        {
            const key = `${e.color}|${e.type}`;
            const prev = groups.get(key) || { color: e.color, type: e.type, amounts: [] };
            prev.amounts.push(e.amount);
            groups.set(key, prev);
        });
    });

    if (groups.size === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = `${todays.length} print(s) today, no filament usage recorded`;
        list.appendChild(empty);
        return;
    }

    groups.forEach(g =>
    {
        const row = document.createElement("div");
        row.className = "historyItem";
        row.style.borderLeftColor = trayColorCss(g.color);

        const left = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = g.type || "?";
        left.appendChild(title);

        const sub = document.createElement("small");
        sub.textContent = `${g.amounts.length} print(s)`;
        left.appendChild(sub);

        const total = document.createElement("span");
        total.textContent = g.amounts.join(" + ");

        row.appendChild(left);
        row.appendChild(total);

        list.appendChild(row);
    });
}

function updatePrinter(data)
{
    const state = data.gcodeState || "UNKNOWN";
    const bambuOk = data.bambuConnected === true;

    setText("printerMonitorState", data.wifiConnected ? "ONLINE" : "OFFLINE");
    setText("printerLinkState", bambuOk ? "CONNECTED" : "DISCONNECTED");

    setText("printerState", bambuOk ? state : "PRINTER UNREACHABLE");
    setText("printerProject", data.subtaskName || "No project");

    const hero = byId("printerHero");

    if (hero)
    {
        const mood = !bambuOk ? "offline" : (state === "RUNNING" ? "running" : "idle");
        hero.className = `printerHero panel ${mood}`;
    }

    const layer = Number(data.layerNum) || 0;
    const total = Number(data.totalLayerNum) || 0;

    setText("printerLayer", total > 0 ? String(layer) : "--");
    setText("printerLayerTotal", total > 0 ? `/ ${total}` : "/ --");

    const pct = total > 0 ? Math.round((layer / total) * 100) : 0;
    setText("printerProgressPct", total > 0 ? `${pct}%` : "--%");
    setBar("printerProgressBar", pct, 100, "var(--cyan)");

    setText("printerNozzle", `${Number(data.nozzleTemp || 0).toFixed(1)} °C`);
    setText("printerBed", `${Number(data.bedTemp || 0).toFixed(1)} °C`);

    const trays = data.trays || [];
    const trayNow = data.trayNow;
    const active = trays.find(t => t.id === trayNow);

    const swatch = byId("activeSwatch");

    if (swatch)
        swatch.style.background = active ? trayColorCss(active.color) : "#2a3136";

    // 254 = external spool, 255 = nothing loaded (per Bambu's tray_now field)
    let activeText = "--";

    if (trayNow === 254)
        activeText = "External spool";
    else if (active)
        activeText = trayLabel(active);
    else if (bambuOk)
        activeText = "None loaded";

    setText("activeFilamentText", activeText);

    // Started / elapsed only make sense while a print is actually running.
    const running = bambuOk && state === "RUNNING";
    setText("printerStarted", running ? (data.currentStart || "--") : "--");
    setText("printerElapsed", running && data.currentStart
        ? printDuration(data.currentStart, data.now)
        : "--");

    renderTrays(trays, trayNow);
    renderPrintHistory(data.history || []);
    renderTodayTotals(data.history || []);
}

function setPrinterOffline(message)
{
    setText("printerState", "NO DATA");
    setText("printerProject", message || "Monitor not reporting");
    setText("printerMonitorState", "OFFLINE");
    setText("printerLinkState", "--");

    const hero = byId("printerHero");

    if (hero)
        hero.className = "printerHero panel offline";
}

// ===== MQTT (browser, over Secure WebSockets) =====

let lastMessageAt = 0;
let lastPrinterMessageAt = 0;
const STALE_AFTER_MS = 30000; // SEND_INTERVAL is 5s; 30s silence => treat as offline

// The printer monitor (3dprinterinfo, separate device) publishes to a
// subtopic of the room monitor's topic.
const PRINTER_TOPIC = `${BROKER_CONFIG.topic}/printer`;

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

    // Subscribed separately rather than with a "#" wildcard, so the viewer
    // credential's topic permissions stay explicit and a failure here is
    // clearly attributable to the printer topic alone.
    client.subscribe(PRINTER_TOPIC, (err) =>
    {
        if (err)
            setPrinterOffline(`Subscribe failed: ${err.message}`);
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
    if (topic === PRINTER_TOPIC)
    {
        try
        {
            lastPrinterMessageAt = Date.now();
            updatePrinter(JSON.parse(payload.toString()));
        }
        catch (err)
        {
            setPrinterOffline(`Bad payload: ${err.message}`);
        }

        return;
    }

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
setPrinterOffline("Waiting for the printer monitor...");

setInterval(() =>
{
    if (lastMessageAt && Date.now() - lastMessageAt > STALE_AFTER_MS)
        setOffline("Device has not published in over 30s");

    if (lastPrinterMessageAt && Date.now() - lastPrinterMessageAt > STALE_AFTER_MS)
        setPrinterOffline("Printer monitor has not published in over 30s");
}, 5000);

// ===== Tabs =====

const TABS = ["room", "printer"];

function selectTab(name)
{
    TABS.forEach(t =>
    {
        const btn = byId(`tabBtn-${t}`);
        const panel = byId(`tab-${t}`);
        const isActive = (t === name);

        if (btn)
        {
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
        }

        if (panel)
        {
            if (isActive)
                panel.removeAttribute("hidden");
            else
                panel.setAttribute("hidden", "");
        }
    });
}

TABS.forEach(t =>
{
    const btn = byId(`tabBtn-${t}`);

    if (btn)
        btn.addEventListener("click", () => selectTab(t));
});

const logoutBtn = byId("logoutBtn");

if (logoutBtn)
{
    logoutBtn.addEventListener("click", async () =>
    {
        try
        {
            await fetch("/api/logout", { method: "POST" });
        }
        finally
        {
            window.location.href = "/login.html";
        }
    });
}

// ===== New spool =====

async function onNewSpool(trayId, btn)
{
    const password = window.prompt(
        `Reset the running total for tray ${trayId + 1}?\n\nEnter the dashboard password:`);

    if (!password)
        return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "...";

    try
    {
        const res = await fetch("/api/printer-command", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password, command: "newSpool", trayId }),
        });

        const data = await res.json();
        btn.textContent = res.ok ? "Reset!" : "Failed";

        if (!res.ok)
            window.alert(`Error: ${data.error || res.statusText}`);
    }
    catch (err)
    {
        btn.textContent = "Failed";
        window.alert(`Request failed: ${err.message}`);
    }
    finally
    {
        setTimeout(() =>
        {
            btn.disabled = false;
            btn.textContent = original;
        }, 1500);
    }
}

// Mobile browsers (and backgrounded desktop tabs) suspend long-lived
// WebSocket connections without necessarily firing a "close" event - the
// page just goes quiet. mqtt.js's own reconnectPeriod doesn't help if the
// tab itself was frozen. Force a fresh connection whenever the tab becomes
// visible again, rather than trusting whatever state it was left in.
document.addEventListener("visibilitychange", () =>
{
    if (document.visibilityState !== "visible")
        return;

    if (client.connected)
        return;

    setText("brokerState", "RECONNECTING");
    client.reconnect();
});

const bootInfoToggle = byId("bootInfoToggle");
const bootInfoPanel = byId("bootInfoPanel");

if (bootInfoToggle && bootInfoPanel)
{
    bootInfoToggle.addEventListener("click", () =>
    {
        const hidden = bootInfoPanel.hasAttribute("hidden");

        if (hidden)
            bootInfoPanel.removeAttribute("hidden");
        else
            bootInfoPanel.setAttribute("hidden", "");

        bootInfoToggle.textContent = hidden ? "Hide" : "History";
    });
}

const otaTriggerToggle = byId("otaTriggerToggle");
const otaTriggerPanel = byId("otaTriggerPanel");

if (otaTriggerToggle && otaTriggerPanel)
{
    otaTriggerToggle.addEventListener("click", () =>
    {
        const hidden = otaTriggerPanel.hasAttribute("hidden");

        if (hidden)
            otaTriggerPanel.removeAttribute("hidden");
        else
            otaTriggerPanel.setAttribute("hidden", "");

        otaTriggerToggle.textContent = hidden ? "Hide" : "Update";
    });
}

const otaTriggerForm = byId("otaTriggerForm");

if (otaTriggerForm)
{
    otaTriggerForm.addEventListener("submit", async (event) =>
    {
        event.preventDefault();

        const resultEl = byId("otaTriggerResult");
        const submitBtn = otaTriggerForm.querySelector("button[type=submit]");

        submitBtn.disabled = true;
        resultEl.textContent = "Publishing command...";

        try
        {
            const res = await fetch("/api/trigger-ota", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    password: byId("otaPassword").value,
                    firmwareUrl: byId("otaUrl").value,
                    authHeader: byId("otaAuthHeader").value,
                    acceptHeader: byId("otaAcceptHeader").value,
                }),
            });

            const data = await res.json();

            resultEl.textContent = res.ok
                ? data.message
                : `Error: ${data.error || res.statusText}`;

            if (res.ok)
                byId("otaPassword").value = "";
        }
        catch (err)
        {
            resultEl.textContent = `Request failed: ${err.message}`;
        }
        finally
        {
            submitBtn.disabled = false;
        }
    });
}

const rebootForm = byId("rebootForm");

if (rebootForm)
{
    rebootForm.addEventListener("submit", async (event) =>
    {
        event.preventDefault();

        const resultEl = byId("rebootResult");
        const submitBtn = rebootForm.querySelector("button[type=submit]");

        submitBtn.disabled = true;
        resultEl.textContent = "Publishing command...";

        try
        {
            const res = await fetch("/api/trigger-reboot", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ password: byId("rebootPassword").value }),
            });

            const data = await res.json();

            resultEl.textContent = res.ok
                ? data.message
                : `Error: ${data.error || res.statusText}`;

            if (res.ok)
                byId("rebootPassword").value = "";
        }
        catch (err)
        {
            resultEl.textContent = `Request failed: ${err.message}`;
        }
        finally
        {
            submitBtn.disabled = false;
        }
    });
}
