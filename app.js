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

function setDot(id, ok)
{
    const el = byId(id);

    if (el)
        el.classList.toggle("ok", !!ok);
}

function setSensorState(id, name, ok)
{
    const el = byId(id);

    if (!el)
        return;

    el.textContent = `${name} ${healthLabel(ok)}`;
    el.style.borderLeftColor = ok ? "var(--green)" : "var(--red)";
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

    setDot("wifiDot", true);
    setDot("mqttDot", data.mqttConnected);
    setDot("watchdogDot", !data.watchdogSafeMode && data.watchdogHealthy);
    setText("heap", `${Math.round(data.freeHeap / 1024)} kB`);
    setText("espTemp", `${Number(data.espTemp).toFixed(1)} °C`);
    setText("uptime", formatTime(data.uptime));
    setText("firmware", data.firmware || "--");
    setText("connectionState", "ONLINE");

    setText("bootCountTotal", data.bootCountTotal ?? "--");
    renderBootHistory(data.bootHistory);

    setBar("heapBar", data.freeHeap / 1024, 320,
        data.freeHeap < 50000 ? "var(--orange)" : "var(--green)");

    setText("pressureDetail", `${data.pressure.toFixed(1)} hPa`);
    setText("lastUpdate", new Date().toLocaleTimeString([], { hour12: false }));

    setSensorState("ahtState", "AHT21", data.ahtOK !== false);
    setSensorState("bmeState", "BME280", data.bmeOK !== false);
    setSensorState("ensState", "ENS160", data.ensOK !== false);

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
        detail.textContent = item.activity
            ? `${detailForResetReason(item.reason)} (was ${item.activity})`
            : detailForResetReason(item.reason);
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

function setOffline()
{
    setDot("wifiDot", false);
    setDot("mqttDot", false);
    setDot("watchdogDot", false);
    setText("connectionState", "OFFLINE");
}

// This browser tab's own MQTT connection lifecycle - separate from the
// device's own System Events log. Kept in memory only (resets on reload);
// exists specifically to give real evidence next time the status dots go
// red and don't self-recover, instead of guessing after the fact.
const connectionLogEntries = [];

function connectionLog(msg)
{
    connectionLogEntries.unshift({
        time: new Date().toLocaleTimeString([], { hour12: false }),
        msg,
    });

    if (connectionLogEntries.length > 30)
        connectionLogEntries.length = 30;

    renderConnectionLog();
}

function renderConnectionLog()
{
    const list = byId("connectionLogList");

    if (!list)
        return;

    list.innerHTML = "";

    if (connectionLogEntries.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No events yet this session.";
        list.appendChild(empty);
        return;
    }

    connectionLogEntries.forEach(entry =>
    {
        const row = document.createElement("div");
        row.className = "historyItem";
        row.style.borderLeftColor = "var(--cyan)";

        const title = document.createElement("strong");
        title.textContent = entry.msg;

        const time = document.createElement("span");
        time.textContent = entry.time;

        row.appendChild(title);
        row.appendChild(time);

        list.appendChild(row);
    });
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

// Bambu's stg_cur sub-stage codes, while gcode_state is RUNNING/PREPARE.
// Ported directly from BambuStudio's own get_stage_string() in
// src/slic3r/GUI/DeviceManager.cpp - the actual source of the on-screen
// text, not a reverse-engineered guess. -1 and 255 both mean "idle/no
// stage" depending on printer generation; not shown here since the caller
// only displays this while actively running/preparing.
const STAGE_TEXT = {
    0: "Printing",
    1: "Auto bed leveling",
    2: "Heatbed preheating",
    3: "Vibration compensation",
    4: "Changing filament",
    5: "M400 pause",
    6: "Paused (filament ran out)",
    7: "Heating nozzle",
    8: "Calibrating dynamic flow",
    9: "Scanning bed surface",
    10: "Inspecting first layer",
    11: "Identifying build plate type",
    12: "Calibrating Micro Lidar",
    13: "Homing toolhead",
    14: "Cleaning nozzle tip",
    15: "Checking extruder temperature",
    16: "Paused by the user",
    17: "Pause (front cover fall off)",
    18: "Calibrating the micro lidar",
    19: "Calibrating flow ratio",
    20: "Pause (nozzle temperature malfunction)",
    21: "Pause (heatbed temperature malfunction)",
    22: "Filament unloading",
    23: "Pause (step loss)",
    24: "Filament loading",
    25: "Motor noise cancellation",
    26: "Pause (AMS offline)",
    27: "Pause (low speed of the heatbreak fan)",
    28: "Pause (chamber temperature control problem)",
    29: "Cooling chamber",
    30: "Pause (Gcode inserted by user)",
    31: "Motor noise showoff",
    32: "Pause (nozzle clumping)",
    33: "Pause (cutter error)",
    34: "Pause (first layer error)",
    35: "Pause (nozzle clog)",
    36: "Measuring motion precision",
    37: "Enhancing motion precision",
    38: "Measure motion accuracy",
    39: "Nozzle offset calibration",
    40: "High temperature auto bed levelling",
    41: "Auto Check: Quick Release Lever",
    42: "Auto Check: Door and Upper Cover",
    43: "Laser Calibration",
    44: "Auto Check: Platform",
    45: "Confirming BirdsEye Camera location",
    46: "Calibrating BirdsEye Camera",
    47: "Auto bed leveling - phase 1",
    48: "Auto bed leveling - phase 2",
    49: "Heating chamber",
    50: "Adjusting heatbed temperature",
    51: "Printing calibration lines",
    52: "Auto Check: Material",
    53: "Live View Camera Calibration",
    54: "Waiting for heatbed to reach target temperature",
    55: "Auto Check: Material Position",
    56: "Cutting Module Offset Calibration",
    57: "Measuring Surface",
    58: "Thermal preconditioning for first layer optimization",
    59: "Homing Blade Holder",
    60: "Calibrating Camera Offset",
    61: "Calibrating Blade Holder Position",
    62: "Hotend Pick and Place Test",
    63: "Waiting for the Chamber temperature to equalize",
    64: "Preparing Hotend",
    65: "Calibrating the detection position of nozzle clumping",
    66: "Purifying the chamber air",
    67: "Measuring Rotary Attachment",
    68: "The toolhead moves above the purge chute",
    69: "Cooling down the nozzle",
    70: "The toolhead moves to the center of the heatbed",
    71: "Active Arc Fitting",
    72: "Hotend Type Detection",
    73: "Build plate alignment detection",
    74: "Heatbed surface foreign object detection",
    75: "Heatbed underside foreign object detection",
    76: "Pre-extrusion before printing",
    77: "Preparing AMS",
};

function stageText(stgCur)
{
    return STAGE_TEXT[Number(stgCur)] || "Working...";
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

// Mirrors Bambu Studio's own AMS panel look (A1-A4 spool graphics), unlike
// the plain list in the Filament card - that one's earmarked to become a
// curated filament library later (see PLAN.md), this is just "what's
// loaded right now."
function renderAmsGrid(trays, trayNow)
{
    const grid = byId("amsGrid");

    if (!grid)
        return;

    grid.innerHTML = "";

    if (!trays || trays.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "Waiting for data...";
        grid.appendChild(empty);
        return;
    }

    trays.forEach(tray =>
    {
        const isActive = tray.id === trayNow;

        const slot = document.createElement("div");
        slot.className = "amsSlot" + (isActive ? " active" : "");

        // Border matches the actual filament color instead of a generic
        // highlight color, so it reads as "this exact spool" at a glance.
        if (isActive && tray.type)
            slot.style.borderColor = trayColorCss(tray.color);

        const label = document.createElement("span");
        label.className = "amsSlotLabel";
        label.textContent = `A${tray.id + 1}`;

        const spool = document.createElement("span");
        spool.className = "amsSpool";
        spool.style.background = tray.type ? trayColorCss(tray.color) : "#2a3136";

        const hole = document.createElement("span");
        hole.className = "amsSpoolHole";
        spool.appendChild(hole);

        const material = document.createElement("span");
        material.className = "amsSlotMaterial" + (tray.type ? "" : " empty");
        material.textContent = tray.type || "Empty";

        slot.appendChild(label);
        slot.appendChild(spool);
        slot.appendChild(material);

        grid.appendChild(slot);
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
        row.className = "historyItem historyItemClickable";
        row.style.borderLeftColor = "var(--cyan)";
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-expanded", "false");

        const left = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = item.name || "Untitled";
        left.appendChild(title);

        const sub = document.createElement("small");
        sub.textContent = `${item.layers || 0} layers - ${item.start || "?"}`;
        left.appendChild(sub);

        const time = document.createElement("span");
        time.textContent = printDuration(item.start, item.end);

        row.appendChild(left);
        row.appendChild(time);

        const detail = document.createElement("div");
        detail.className = "historyDetail";
        detail.hidden = true;

        const usage = parseTrayUsage(item.trays);

        if (usage.length > 0)
        {
            const chips = document.createElement("div");
            chips.className = "usageChips";
            usage.forEach(e => chips.appendChild(usageChip(e)));
            detail.appendChild(chips);
        }
        else
        {
            const none = document.createElement("p");
            none.textContent = "No filament usage recorded for this print - the A1's AMS-lite doesn't report enough data to measure it.";
            detail.appendChild(none);
        }

        const times = document.createElement("p");
        times.textContent = `Started ${item.start || "?"} - Ended ${item.end || "?"}`;
        detail.appendChild(times);

        row.appendChild(detail);

        const toggle = () =>
        {
            const hidden = detail.hidden;
            detail.hidden = !hidden;
            row.setAttribute("aria-expanded", hidden ? "true" : "false");
        };

        row.addEventListener("click", toggle);
        row.addEventListener("keydown", (event) =>
        {
            if (event.key === "Enter" || event.key === " ")
            {
                event.preventDefault();
                toggle();
            }
        });

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

    setDot("printerWifiDot", data.wifiConnected === true);
    setDot("printerMqttDot", bambuOk);

    setText("printerNameLabel", data.printerName || "Printer");
    // The printer settles to FINISH once a job completes and stays there
    // until the next print starts - showing that literally reads as stuck,
    // when the printer is really just idle again.
    const displayState = state === "FINISH" ? "IDLE" : state;
    setText("printerState", bambuOk ? displayState : "PRINTER UNREACHABLE");
    // The firmware doesn't clear subtask_name on its own (Bambu doesn't
    // send an explicit "cleared" message for it) - once idle there's no
    // "current project" to show, regardless of what the last one was.
    setText("printerProject", displayState === "IDLE" ? "No project" : (data.subtaskName || "No project"));

    const hero = byId("printerHero");

    if (hero)
    {
        const mood = !bambuOk ? "offline" : (state === "RUNNING" ? "running" : "idle");
        hero.className = `printerHero panel ${mood}`;
    }

    const stageEl = byId("printerStage");

    if (stageEl)
    {
        const showStage = bambuOk && (state === "RUNNING" || state === "PREPARE");
        stageEl.hidden = !showStage;

        if (showStage)
            stageEl.textContent = stageText(data.stageCur);
    }

    const layer = Number(data.layerNum) || 0;
    const total = Number(data.totalLayerNum) || 0;

    setText("printerLayer", total > 0 ? String(layer) : "--");
    setText("printerLayerTotal", total > 0 ? ` / ${total}` : " / --");

    const pct = total > 0 ? Math.round((layer / total) * 100) : 0;
    setText("printerProgressPct", total > 0 ? `${pct}%` : "--%");
    setBar("printerProgressBar", pct, 100, "var(--cyan)");

    setText("printerNozzle", `${Number(data.nozzleTemp || 0).toFixed(1)} °C`);
    setText("printerBed", `${Number(data.bedTemp || 0).toFixed(1)} °C`);
    setText("printerFan", bambuOk ? `${Number(data.fanSpeedPct) || 0}%` : "--%");

    const trays = data.trays || [];
    const running = bambuOk && state === "RUNNING";
    const preparing = bambuOk && (state === "RUNNING" || state === "PREPARE");

    // The Task API's amsDetailMapping tells us which slot the job was
    // actually assigned to, plus its weight - MQTT alone can't give us the
    // weight at all. But if the Task API isn't available (secret not set
    // up yet, fetch failed, still loading), fall back to MQTT's tray_now +
    // the trays array so the hero still shows *something* rather than
    // going blank just because the bonus data source is down.
    const primaryDetail = latestPrinterTask && latestPrinterTask.amsDetail && latestPrinterTask.amsDetail.length > 0
        ? latestPrinterTask.amsDetail[0]
        : null;

    const trayNow = preparing && primaryDetail
        ? (primaryDetail.amsId * 4) + primaryDetail.slotId
        : data.trayNow;

    const mqttActiveTray = trays.find(t => t.id === trayNow);

    const swatch = byId("activeSwatch");

    if (preparing && primaryDetail)
    {
        if (swatch)
            swatch.style.background = trayColorCss(primaryDetail.color);

        setText("activeFilamentText", primaryDetail.type || "--");
        setText("activeFilamentWeight", `${primaryDetail.weight.toFixed(1)} g`);
    }
    else if (preparing && mqttActiveTray && mqttActiveTray.type)
    {
        if (swatch)
            swatch.style.background = trayColorCss(mqttActiveTray.color);

        setText("activeFilamentText", mqttActiveTray.type);
        setText("activeFilamentWeight", "");
    }
    else
    {
        if (swatch)
            swatch.style.background = "#2a3136";

        setText("activeFilamentText", "--");
        setText("activeFilamentWeight", "");
    }

    // Started/Ended/Elapsed describe whichever print is most recent -
    // still running, or just finished - not just "while running", so you
    // can see what happened after it's done. currentStart only resets when
    // a NEW print starts, so this naturally covers both cases.
    const hasCurrentPrint = Boolean(data.currentStart);

    setText("printerStarted", hasCurrentPrint ? data.currentStart : "--");
    setText("printerEnded", data.currentEnd || "--");
    setText("printerElapsed", hasCurrentPrint
        ? printDuration(data.currentStart, data.currentEnd || data.now)
        : "--");

    const remainingMin = Number(data.remainingTime) || 0;
    setText("printerEta", running && remainingMin > 0 ? formatTime(remainingMin * 60) : "--");

    renderTrays(trays, trayNow);
    renderAmsGrid(trays, trayNow);
    renderPrintHistory(data.history || []);
    renderTodayTotals(data.history || []);
}

function setPrinterOffline(message)
{
    setDot("printerWifiDot", false);
    setDot("printerMqttDot", false);

    setText("printerState", "NO DATA");
    setText("printerProject", message || "Monitor not reporting");

    const hero = byId("printerHero");

    if (hero)
        hero.className = "printerHero panel offline";
}

// ===== Bambu Cloud Task API (weight/AMS detail - MQTT can't provide this) =====

let latestPrinterTask = null;

async function updatePrinterTask()
{
    try
    {
        const res = await fetch("/api/printer-task");

        if (!res.ok)
            return;

        const data = await res.json();
        latestPrinterTask = data.task || null;
    }
    catch (err)
    {
        console.log("printer-task fetch failed", err);
    }
}

updatePrinterTask();
setInterval(updatePrinterTask, 60000);

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
    setDot("brokerDot", true);
    connectionLog("Connected to broker");

    client.subscribe(BROKER_CONFIG.topic, (err) =>
    {
        if (err)
        {
            setDot("brokerDot", false);
            connectionLog(`Room topic subscribe failed: ${err.message}`);
        }
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
    setDot("brokerDot", false);
    connectionLog("Reconnecting to broker...");
});

client.on("close", () =>
{
    setDot("brokerDot", false);
    connectionLog("Broker connection closed");
    setOffline();
});

client.on("error", (err) =>
{
    setDot("brokerDot", false);
    connectionLog(`Broker error: ${(err && err.message) || String(err)}`);
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
        updateStatus(data);
    }
    catch (err)
    {
        connectionLog(`Bad payload on room topic: ${err.message}`);
        setOffline();
    }
});

setOffline();
setPrinterOffline("Waiting for the printer monitor...");

setInterval(() =>
{
    if (lastMessageAt && Date.now() - lastMessageAt > STALE_AFTER_MS)
    {
        const silentFor = Math.round((Date.now() - lastMessageAt) / 1000);
        connectionLog(`Room data stale - ${silentFor}s since last message (client.connected=${client.connected})`);
        setOffline();
    }

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
    if (!window.confirm(`Reset the running total for tray ${trayId + 1}?`))
        return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "...";

    try
    {
        const res = await fetch("/api/printer-command", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ command: "newSpool", trayId }),
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

    const silentFor = lastMessageAt ? Math.round((Date.now() - lastMessageAt) / 1000) : null;
    connectionLog(`Tab visible again (client.connected=${client.connected}, ${silentFor === null ? "no messages yet" : silentFor + "s since last message"})`);

    // mqtt.js's own `connected` flag can still read true even when a
    // backgrounded tab's connection has effectively died (the browser
    // throttled it enough that neither side noticed the drop) - trusting
    // that flag here is what let this go stale until a full page reload.
    // client.reconnect() alone turned out not to be enough to recover that
    // case reliably (still seen going stale after it) - forcing a hard
    // end() first guarantees a clean break regardless of what the
    // `connected` flag currently claims, rather than relying on
    // reconnect()'s own judgment of whether one is needed.
    setDot("brokerDot", false);
    client.end(true, {}, () => client.reconnect());
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

const systemEventsToggle = byId("systemEventsToggle");
const systemEventsPanel = byId("systemEventsPanel");

if (systemEventsToggle && systemEventsPanel)
{
    systemEventsToggle.addEventListener("click", () =>
    {
        const hidden = systemEventsPanel.hasAttribute("hidden");

        if (hidden)
            systemEventsPanel.removeAttribute("hidden");
        else
            systemEventsPanel.setAttribute("hidden", "");

        systemEventsToggle.textContent = hidden ? "Hide" : "Events";
    });
}

const connectionLogToggle = byId("connectionLogToggle");
const connectionLogPanel = byId("connectionLogPanel");

if (connectionLogToggle && connectionLogPanel)
{
    connectionLogToggle.addEventListener("click", () =>
    {
        const hidden = connectionLogPanel.hasAttribute("hidden");

        if (hidden)
            connectionLogPanel.removeAttribute("hidden");
        else
            connectionLogPanel.setAttribute("hidden", "");

        connectionLogToggle.textContent = hidden ? "Hide" : "Connection Log";
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
                    firmwareUrl: byId("otaUrl").value,
                    authHeader: byId("otaAuthHeader").value,
                    acceptHeader: byId("otaAcceptHeader").value,
                }),
            });

            const data = await res.json();

            resultEl.textContent = res.ok
                ? data.message
                : `Error: ${data.error || res.statusText}`;
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

const rebootBtn = byId("rebootBtn");

if (rebootBtn)
{
    rebootBtn.addEventListener("click", async () =>
    {
        if (!window.confirm("Reboot the master now? It'll drop offline for a few seconds."))
            return;

        const resultEl = byId("rebootResult");

        rebootBtn.disabled = true;
        resultEl.textContent = "Publishing command...";

        try
        {
            const res = await fetch("/api/trigger-reboot", { method: "POST" });
            const data = await res.json();

            resultEl.textContent = res.ok
                ? data.message
                : `Error: ${data.error || res.statusText}`;
        }
        catch (err)
        {
            resultEl.textContent = `Request failed: ${err.message}`;
        }
        finally
        {
            rebootBtn.disabled = false;
        }
    });
}
