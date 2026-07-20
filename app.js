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

// Rough hue-bucket approximation for auto-created filament library entries
// (see syncAmsToLibrary) - there's no API for Bambu's own color names, so
// this is just a reasonable starting label the user can rename via Edit.
function guessColorName(hex)
{
    if (!hex || hex.length < 6)
        return "Unknown";

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (max < 40)
        return "Black";

    if (min > 215 && delta < 25)
        return "White";

    if (delta < 20)
        return "Gray";

    let hue = 0;

    if (max === r)
        hue = 60 * (((g - b) / delta) % 6);
    else if (max === g)
        hue = 60 * ((b - r) / delta + 2);
    else
        hue = 60 * ((r - g) / delta + 4);

    if (hue < 0)
        hue += 360;

    if (hue < 15 || hue >= 345)
        return "Red";
    if (hue < 45)
        return "Orange";
    if (hue < 70)
        return "Yellow";
    if (hue < 160)
        return "Green";
    if (hue < 200)
        return "Cyan";
    if (hue < 255)
        return "Blue";
    if (hue < 290)
        return "Purple";

    return "Pink";
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

// Mirrors Bambu Studio's own AMS panel look (A1-A4 spool graphics). The
// separate curated Filament card below is a manually-managed inventory,
// not a live view of these slots - see the filament library section.
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

    // Visual position only - matches Bambu Studio's own AMS panel layout
    // (A1/A4 on top, A2/A3 on bottom), which doesn't read left-to-right in
    // slot-number order. The 2-column grid auto-flows in DOM order, so
    // this reorders which tray gets appended when, not which data belongs
    // to which slot (that's still purely driven by tray.id, untouched).
    const DISPLAY_ORDER = [0, 3, 1, 2];
    const orderedTrays = DISPLAY_ORDER
        .map(id => trays.find(t => t.id === id))
        .filter(Boolean);

    orderedTrays.forEach(tray =>
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

let lastHistoryItems = [];

function renderPrintHistory(items)
{
    lastHistoryItems = items || [];

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
        sub.textContent = `${item.layers || 0} layers - ${formatDeviceDate(item.start)}`;
        left.appendChild(sub);

        const time = document.createElement("span");
        time.textContent = printDuration(item.start, item.end);

        row.appendChild(left);
        row.appendChild(time);

        const detail = document.createElement("div");
        detail.className = "historyDetail";
        detail.hidden = true;

        const historyKey = `${item.name}__${item.start}`;
        const override = filamentLibrary.historyOverrides[historyKey];
        const usage = parseTrayUsage(item.trays);
        const matchedTask = usage.length === 0 ? matchTaskForHistoryItem(item) : null;

        // Manual corrections win over everything else - Bambu's own Task
        // API is confirmed unreliable for jobs whose AMS slot wasn't
        // explicitly set during slicing (Bambu Handy jobs, or auto-assigned
        // on the printer's own screen): it falls back to a placeholder
        // (slot 0, or a hardcoded default color) rather than the tray
        // actually used, and there's no way to recover the true value from
        // that API after the fact.
        if (override)
        {
            const chips = document.createElement("div");
            chips.className = "usageChips";
            // A gcode-sourced override (see /api/gcode-sync) carries its own
            // weight straight from the slicer's header - more authoritative
            // than the Task API's, which this override already exists
            // because Bambu's own data was wrong. Manual "Fix filament"
            // corrections have no weight of their own, so those still fall
            // back to whatever the Task API says the total was.
            const amount = typeof override.weight === "number"
                ? `${override.weight.toFixed(1)}g`
                : (matchedTask ? `${matchedTask.weight.toFixed(1)}g` : "");
            chips.appendChild(usageChip({ color: override.colorHex, type: override.material, amount }));
            detail.appendChild(chips);

            if (override.source === "gcode")
            {
                const verified = document.createElement("p");
                verified.className = "gcodeVerified";
                verified.textContent = "Verified from printer's gcode";
                detail.appendChild(verified);
            }
        }
        else if (usage.length > 0)
        {
            const chips = document.createElement("div");
            chips.className = "usageChips";
            usage.forEach(e => chips.appendChild(usageChip(e)));
            detail.appendChild(chips);
        }
        else if (matchedTask)
        {
            const chips = document.createElement("div");
            chips.className = "usageChips";
            matchedTask.amsDetail.forEach(d => chips.appendChild(usageChip({
                color: d.color,
                type: d.type,
                amount: `${d.weight.toFixed(1)}g`,
            })));
            detail.appendChild(chips);
        }
        else
        {
            const none = document.createElement("p");
            none.textContent = "No filament usage recorded for this print - the A1's AMS-lite doesn't report enough data to measure it.";
            detail.appendChild(none);
        }

        const fixBtn = document.createElement("button");
        fixBtn.type = "button";
        fixBtn.className = "infoBtn";
        fixBtn.style.marginTop = "8px";
        fixBtn.textContent = override ? "Edit correction" : "Fix filament";
        fixBtn.addEventListener("click", (event) =>
        {
            event.stopPropagation();
            onFixHistoryFilament(item, matchedTask);
        });
        detail.appendChild(fixBtn);

        const times = document.createElement("p");
        times.textContent = `Started ${formatDeviceDate(item.start)} - Ended ${formatDeviceDate(item.end)}`;
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

// The device's raw "YYYY-MM-DD HH:MM:SS" is only reformatted for display -
// matching (processedPrints keys, matchTaskForHistoryItem, printDuration)
// keeps using the raw string untouched.
function formatDeviceDate(s)
{
    if (!s || s === "unknown" || s === "pending")
        return s || "?";

    const [datePart, timePart] = s.split(" ");
    const [year, month, day] = (datePart || "").split("-");

    if (!year || !month || !day)
        return s;

    return `${day}.${month}.${year}${timePart ? " " + timePart : ""}`;
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

    const trays = data.trays || [];
    const running = bambuOk && state === "RUNNING";
    const preparing = bambuOk && (state === "RUNNING" || state === "PREPARE");

    // The device doesn't reset layerNum/totalLayerNum on its own once a
    // print finishes (same "doesn't clear on its own" behavior as
    // subtask_name above) - gating this on total > 0 alone meant the
    // Progress card kept showing the last completed print's numbers
    // indefinitely, even a full day later. Only show it while a print is
    // actually active.
    const layer = Number(data.layerNum) || 0;
    const total = Number(data.totalLayerNum) || 0;
    const showProgress = preparing && total > 0;

    setText("printerLayer", showProgress ? String(layer) : "--");
    setText("printerLayerTotal", showProgress ? ` / ${total}` : " / --");

    const pct = showProgress ? Math.round((layer / total) * 100) : 0;
    setText("printerProgressPct", showProgress ? `${pct}%` : "--%");
    setBar("printerProgressBar", pct, 100, "var(--cyan)");

    setText("printerNozzle", `${Number(data.nozzleTemp || 0).toFixed(1)} °C`);
    setText("printerBed", `${Number(data.bedTemp || 0).toFixed(1)} °C`);
    setText("printerFan", bambuOk ? `${Number(data.fanSpeedPct) || 0}%` : "--%");

    // MQTT's tray_now is the printer's own live, direct report of which
    // slot is physically engaged right now - that's the only thing that
    // should ever decide "which slot is active." Previously this was
    // overridden by (Task API amsId*4+slotId) whenever any Task API match
    // existed, which broke in two ways: the arithmetic assumes amsId=0
    // and a specific slotId convention that isn't verified, and - more
    // fundamentally - a Studio-desktop-sliced job's Task record can get
    // matched (by title+time, see matchTaskForHistoryItem) even when the
    // job actually printed was submitted a completely different way (e.g.
    // Bambu Handy), pointing the "active" highlight at whatever slot that
    // unrelated Task record happened to reference. The Task API is now
    // only ever used to annotate weight onto whichever slot MQTT already
    // says is active - it can no longer redirect which slot that is.
    const trayNow = data.trayNow;

    // For display only (which color swatch to show next to "Filament
    // used") - sourced from MQTT's own live tray data, not the Task API's
    // color field, for the same reliability reasons as trayNow itself.
    const mqttActiveTray = trays.find(t => t.id === trayNow);

    // The Task API's slotId is confirmed unreliable even for jobs sliced
    // and sent normally from Studio (live-verified: a task's amsDetail
    // claimed slotId 0 while MQTT's tray_now correctly showed 3 was
    // engaged) - only its weight and color/material are trustworthy. For
    // a single-material print there's no ambiguity about which entry
    // applies regardless of what slot it claims, so withholding the
    // weight over a slot mismatch only hides a number that's actually
    // fine. Multi-tray prints still need the slot match to know which
    // entry corresponds to what's active right now.
    const amsDetail = (latestPrinterTask && latestPrinterTask.amsDetail) || [];
    const matchingDetail = amsDetail.length === 1
        ? amsDetail[0]
        : amsDetail.find(d => (d.amsId * 4) + d.slotId === trayNow) || null;

    // Previously shown whenever currentStart was set, on the theory of
    // "still running, or just finished, so you can see what happened after
    // it's done" - in practice that meant a finished print's Started/
    // Ended/Elapsed lingered here indefinitely (a full day later, in one
    // case), since currentStart only ever changes when a NEW print starts.
    // The finished print's own summary already lives in Print history -
    // this card is specifically about what's happening right now.
    setText("printerStarted", preparing ? formatDeviceDate(data.currentStart) : "--");
    setText("printerEnded", preparing && data.currentEnd ? formatDeviceDate(data.currentEnd) : "--");
    setText("printerElapsed", preparing
        ? printDuration(data.currentStart, data.currentEnd || data.now)
        : "--");

    const remainingMin = Number(data.remainingTime) || 0;
    setText("printerEta", running && remainingMin > 0 ? formatTime(remainingMin * 60) : "--");

    // Confirmed live against a print that was still ~2h from finishing -
    // the Task API's weight/amsDetail is populated from the slicer's own
    // estimate as soon as the job starts, not filled in only on completion.
    // Only trusted here when it matches the slot MQTT says is actually
    // active (see matchingDetail above) - this is the only place that
    // weight surfaces now that the hero's own duplicate "Active filament"
    // readout was removed. Color was missing here entirely before - shown
    // via swatch + name (guessed from hex, same as the filament library's
    // auto-created entries) since on a multi-color print this changes
    // mid-print and needs to be obvious which color the grams belong to.
    const filamentUsedSwatch = byId("filamentUsedSwatch");

    if (preparing && matchingDetail && mqttActiveTray)
    {
        if (filamentUsedSwatch)
            filamentUsedSwatch.style.background = trayColorCss(mqttActiveTray.color);

        const colorName = guessColorName((mqttActiveTray.color || "").slice(0, 6));
        setText("printerFilamentUsed", `${matchingDetail.weight.toFixed(1)} g (${colorName} ${matchingDetail.type || "?"})`);
    }
    else
    {
        if (filamentUsedSwatch)
            filamentUsedSwatch.style.background = "#2a3136";

        setText("printerFilamentUsed", "--");
    }

    renderAmsGrid(trays, trayNow);
    renderPrintHistory(data.history || []);
    renderTodayTotals(data.history || []);
    processFilamentDeductions(data.history || []);
    syncAmsToLibrary(trays);
}

function setPrinterOffline(message)
{
    setDot("printerWifiDot", false);
    setDot("printerMqttDot", false);

    setText("printerState", "DISCONNECTED");
    setText("printerProject", message || "Monitor not reporting");

    const hero = byId("printerHero");

    if (hero)
        hero.className = "printerHero panel offline";
}

// ===== Bambu Cloud Task API (weight/AMS detail - MQTT can't provide this) =====

let latestPrinterTask = null;
let latestPrinterTasks = [];

async function updatePrinterTask()
{
    try
    {
        const res = await fetch("/api/printer-task");

        if (!res.ok)
            return;

        const data = await res.json();
        latestPrinterTask = data.task || null;
        latestPrinterTasks = data.tasks || [];
    }
    catch (err)
    {
        console.log("printer-task fetch failed", err);
    }
}

// The device's own history (histName/histStart/...) and Bambu Cloud's task
// list are two unrelated records of the same prints, with no shared ID -
// match them by title plus how close their start times are. Task startTime
// is the slice/upload time, which lands within a couple minutes of the
// physical start (confirmed live), so a tight window plus a title match is
// enough to avoid false matches across unrelated prints with the same name.
function matchTaskForHistoryItem(item)
{
    const itemStart = parseDeviceTime(item.start);

    if (!itemStart || latestPrinterTasks.length === 0)
        return null;

    let best = null;
    let bestDiff = Infinity;

    for (const task of latestPrinterTasks)
    {
        if (!task.amsDetail || task.amsDetail.length === 0)
            continue;

        // task.startTime is a proper UTC ISO string ("...Z") straight from
        // Bambu Cloud - unlike the device's own local, timezone-less
        // timestamps (see parseDeviceTime), so parse it directly rather
        // than routing it through that local-time parser, which would
        // silently misinterpret it and throw the match off by the local
        // UTC offset (confirmed ~2h against live data).
        if (!task.startTime)
            continue;

        const taskStart = new Date(task.startTime);

        if (isNaN(taskStart.getTime()))
            continue;

        const diff = Math.abs(taskStart - itemStart);
        const titleMatches = task.title && item.name && task.title === item.name;
        const withinWindow = diff < (titleMatches ? 30 * 60 * 1000 : 10 * 60 * 1000);

        if (withinWindow && diff < bestDiff)
        {
            best = task;
            bestDiff = diff;
        }
    }

    return best;
}

updatePrinterTask();
setInterval(updatePrinterTask, 60000);

// ===== Filament library (manually curated inventory, KV-backed) =====
// A separate record from "what's loaded right now" (the AMS grid above) -
// this is the user's own stock: material+color entries, each with one or
// more physical spools and a running remaining-weight total. Stored
// server-side (Cloudflare KV via /api/filament-library) rather than on the
// device or in localStorage, so it stays in sync across every browser/
// device viewing the dashboard, and survives independently of any single
// ESP32's NVS.

let filamentLibrary = { filaments: [], processedPrints: [], historyOverrides: {} };
let filamentLibraryLoaded = false;

function uid()
{
    return Math.random().toString(36).slice(2, 10);
}

async function loadFilamentLibrary()
{
    try
    {
        const res = await fetch("/api/filament-library");

        if (res.ok)
        {
            const data = await res.json();
            filamentLibrary = {
                filaments: data.filaments || [],
                processedPrints: data.processedPrints || [],
                historyOverrides: data.historyOverrides || {},
            };
        }
    }
    catch (err)
    {
        console.log("filament-library fetch failed", err);
    }
    finally
    {
        filamentLibraryLoaded = true;
        renderFilamentLibrary();
    }
}

async function saveFilamentLibrary()
{
    try
    {
        await fetch("/api/filament-library", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(filamentLibrary),
        });
    }
    catch (err)
    {
        console.log("filament-library save failed", err);
    }
}

function renderFilamentLibrary()
{
    const list = byId("filamentList");

    if (!list)
        return;

    list.innerHTML = "";

    if (filamentLibrary.filaments.length === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = "No filaments added yet.";
        list.appendChild(empty);
        return;
    }

    filamentLibrary.filaments.forEach(f =>
    {
        const entry = document.createElement("div");
        entry.className = "filamentEntry";

        const head = document.createElement("div");
        head.className = "filamentEntryHead";

        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = trayColorCss(f.colorHex || "");

        const meta = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = `${f.material} - ${f.color}`;
        meta.appendChild(title);

        if (f.brand)
        {
            const sub = document.createElement("small");
            sub.textContent = f.brand;
            meta.appendChild(sub);
        }

        const actions = document.createElement("div");
        actions.className = "filamentEntryActions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "infoBtn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => onEditFilament(f.id));

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "infoBtn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => onRemoveFilament(f.id));

        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);

        head.appendChild(sw);
        head.appendChild(meta);
        head.appendChild(actions);
        entry.appendChild(head);

        const spoolList = document.createElement("div");
        spoolList.className = "spoolList";

        (f.spools || []).forEach(spool =>
        {
            const row = document.createElement("div");
            row.className = "spoolRow";

            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.step = "1";
            input.value = Math.max(0, Math.round(spool.remaining));
            input.title = "Edit remaining weight - e.g. correct a partial spool";
            input.addEventListener("change", () => onEditSpoolRemaining(f.id, spool.id, input.value));

            const totalLabel = document.createElement("span");
            totalLabel.textContent = `/ ${spool.total}g`;

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "infoBtn";
            delBtn.textContent = "Remove spool";
            delBtn.addEventListener("click", () => onRemoveSpool(f.id, spool.id));

            row.appendChild(input);
            row.appendChild(totalLabel);
            row.appendChild(delBtn);
            spoolList.appendChild(row);
        });

        entry.appendChild(spoolList);

        const newSpoolBtn = document.createElement("button");
        newSpoolBtn.type = "button";
        newSpoolBtn.className = "infoBtn";
        newSpoolBtn.style.marginTop = "8px";
        newSpoolBtn.textContent = "New spool";
        newSpoolBtn.addEventListener("click", () => onNewLibrarySpool(f.id));

        entry.appendChild(newSpoolBtn);
        list.appendChild(entry);
    });
}

// Refetches from KV immediately before applying a change, rather than
// mutating whatever this tab happened to load at page-open time. This
// dashboard gets left open in multiple tabs at once - without this, an
// old tab (or an automatic background deduction, see
// processFilamentDeductions) blindly saving its own stale in-memory copy
// would silently overwrite filaments/spools added from another tab since
// this one was last loaded. Doesn't fully eliminate the race (two saves
// within the same round-trip can still collide), but closes the common
// case of "left a tab open for a while, then it clobbers a recent edit."
async function withFreshLibrary(mutatorFn)
{
    await loadFilamentLibrary();
    mutatorFn(filamentLibrary);
    renderFilamentLibrary();
    await saveFilamentLibrary();
}

function onRemoveFilament(filamentId)
{
    if (!window.confirm("Remove this filament and all its spools?"))
        return;

    withFreshLibrary(lib => { lib.filaments = lib.filaments.filter(f => f.id !== filamentId); });
}

function onRemoveSpool(filamentId, spoolId)
{
    withFreshLibrary(lib =>
    {
        const f = lib.filaments.find(x => x.id === filamentId);

        if (f)
            f.spools = f.spools.filter(s => s.id !== spoolId);
    });
}

function onEditSpoolRemaining(filamentId, spoolId, value)
{
    const n = Number(value);

    if (!Number.isFinite(n) || n < 0)
        return;

    withFreshLibrary(lib =>
    {
        const f = lib.filaments.find(x => x.id === filamentId);
        const spool = f && f.spools.find(s => s.id === spoolId);

        if (spool)
            spool.remaining = n;
    });
}

function onNewLibrarySpool(filamentId)
{
    const input = window.prompt("New spool weight in grams:", "1000");

    if (input === null)
        return;

    const total = Number(input);

    if (!Number.isFinite(total) || total <= 0)
        return;

    withFreshLibrary(lib =>
    {
        const f = lib.filaments.find(x => x.id === filamentId);

        if (f)
            f.spools.push({ id: uid(), total, remaining: total, createdAt: new Date().toISOString() });
    });
}

// Manually corrects a history entry's recorded material/color when Bambu's
// own Task API got it wrong - confirmed happening for jobs whose AMS slot
// wasn't explicitly set during slicing (Bambu Handy jobs, or auto-assigned
// on the printer's own screen): the API falls back to a placeholder rather
// than the tray actually used, with no way to recover the true value
// after the fact. Grams are left alone (matchedTask.weight is accurate),
// only material/color get overridden.
async function onFixHistoryFilament(item, matchedTask)
{
    const key = `${item.name}__${item.start}`;
    const existing = filamentLibrary.historyOverrides[key];
    const guess = matchedTask && matchedTask.amsDetail && matchedTask.amsDetail[0];

    const material = window.prompt(
        "Actual material used:",
        existing ? existing.material : (guess ? guess.type : "PLA"));

    if (material === null || !material.trim())
        return;

    const colorHexInput = window.prompt(
        "Actual color hex (RRGGBB):",
        existing ? existing.colorHex : (guess ? guess.color.slice(0, 6) : ""));

    if (colorHexInput === null)
        return;

    await withFreshLibrary(lib =>
    {
        lib.historyOverrides[key] = {
            material: material.trim(),
            colorHex: colorHexInput.replace("#", "").toUpperCase(),
        };
    });

    renderPrintHistory(lastHistoryItems);
}

// Bambu is the controller, this dashboard just listens - the library
// shouldn't require manually re-typing what's already loaded. Whenever the
// AMS reports a material/color combo with no matching library entry yet,
// create one automatically (default single 1000g spool - editable via the
// spool weight field, or Edit if it's actually a partial spool). Only ever
// adds; never touches or removes anything you've entered by hand.
let lastAmsSyncKey = "";

async function syncAmsToLibrary(trays)
{
    if (!filamentLibraryLoaded || !trays || trays.length === 0)
        return;

    const detected = trays.filter(t => t.type && t.color && t.color.length >= 6);

    if (detected.length === 0)
        return;

    // Cheap fingerprint of what's currently loaded, so this doesn't do a
    // KV read every 5s once everything currently in the AMS already has a
    // library entry - only re-checks when the AMS contents actually change.
    const syncKey = detected.map(t => `${t.id}:${t.type}:${t.color.slice(0, 6)}`).sort().join("|");

    if (syncKey === lastAmsSyncKey)
        return;

    const missing = detected.filter(t =>
    {
        const hex = t.color.slice(0, 6).toUpperCase();
        const material = t.type.toUpperCase();
        return !filamentLibrary.filaments.some(f =>
            f.material.toUpperCase() === material && (f.colorHex || "").toUpperCase() === hex);
    });

    lastAmsSyncKey = syncKey;

    if (missing.length === 0)
        return;

    await loadFilamentLibrary();

    let changed = false;

    missing.forEach(t =>
    {
        const hex = t.color.slice(0, 6).toUpperCase();
        const material = t.type.toUpperCase();
        const alreadyThere = filamentLibrary.filaments.some(f =>
            f.material.toUpperCase() === material && (f.colorHex || "").toUpperCase() === hex);

        if (alreadyThere)
            return;   // added by another tab between the pre-check above and this refresh

        filamentLibrary.filaments.push({
            id: uid(),
            material: t.type,
            color: guessColorName(hex),
            colorHex: hex,
            brand: "",
            spools: [{ id: uid(), total: 1000, remaining: 1000, createdAt: new Date().toISOString() }],
        });
        changed = true;
    });

    if (!changed)
        return;

    renderFilamentLibrary();
    await saveFilamentLibrary();
}

// Auto-deducts each finished print's acquired weight from the matching
// library spool, using the same Task API match used to enrich print
// history (see matchTaskForHistoryItem). processedPrints - persisted in KV
// alongside the library itself - stops the same print being deducted twice
// across repeated polls or page reloads.
async function processFilamentDeductions(items)
{
    if (!filamentLibraryLoaded || !items || items.length === 0)
        return;

    const candidates = items.filter(item => item.start && item.end);
    const hasUnprocessed = candidates.some(item =>
        !filamentLibrary.processedPrints.includes(`${item.name}__${item.start}`));

    if (!hasUnprocessed)
        return;

    // This runs automatically on every poll, with no user action involved -
    // refresh right before mutating so it can't silently clobber a filament
    // or spool added from another tab since this one last loaded (see
    // withFreshLibrary above). Gated on hasUnprocessed so it's not doing a
    // KV read every 5s, only when there's actually a finished print to settle.
    await loadFilamentLibrary();

    let changed = false;

    candidates.forEach(item =>
    {
        if (!item.start || !item.end)
            return;   // still running, or timestamps missing - nothing to settle yet

        const key = `${item.name}__${item.start}`;

        // The Task API's weight is a full-print slice estimate, fixed at
        // whatever the whole job was planned to use - it doesn't shrink to
        // match how far a cancelled/failed print actually got. Deducting
        // it anyway would over-charge the spool for material that was
        // never actually extruded. item.outcome is the device's own
        // gcode_state at the moment it stopped running ("FINISH" for a
        // normal completion); anything else is treated as not fully
        // trustworthy for weight purposes and skipped, marked processed so
        // it doesn't get silently retried forever with equally-wrong data
        // once (or if) the Task API happens to answer. History display
        // and manual "Fix filament" corrections aren't affected by this -
        // only the automatic deduction is.
        if (item.outcome && item.outcome !== "FINISH")
        {
            if (!filamentLibrary.processedPrints.includes(key))
            {
                filamentLibrary.processedPrints.push(key);
                changed = true;
            }

            return;
        }

        if (filamentLibrary.processedPrints.includes(key))
            return;

        const usage = parseTrayUsage(item.trays);
        const matchedTask = usage.length === 0 ? matchTaskForHistoryItem(item) : null;
        const override = filamentLibrary.historyOverrides[key];

        // A manual correction (see onFixHistoryFilament) means Bambu's own
        // per-tray breakdown is known wrong for this print - deduct the
        // task's total weight against the corrected material/color as a
        // single entry instead of trusting amsDetail's (possibly multiple,
        // possibly wrong) trays. A gcode-sourced override (see
        // /api/gcode-sync) already carries its own authoritative weight -
        // no need to wait on a Task API match at all in that case. A
        // manual "Fix filament" override has no weight of its own, so
        // that still needs the Task API's total to deduct against.
        const details = override
            ? (typeof override.weight === "number"
                ? [{ color: override.colorHex, type: override.material, weight: override.weight }]
                : (matchedTask ? [{ color: override.colorHex, type: override.material, weight: matchedTask.weight }] : []))
            : (matchedTask ? matchedTask.amsDetail : []);

        if (details.length === 0)
            return;   // Task API hasn't surfaced this print yet - retry on a later poll

        details.forEach(d =>
        {
            const hex = (d.color || "").slice(0, 6).toUpperCase();
            const material = (d.type || "").toUpperCase();

            const filament = filamentLibrary.filaments.find(f =>
                f.material.toUpperCase() === material && (f.colorHex || "").toUpperCase() === hex);

            if (!filament || !filament.spools || filament.spools.length === 0)
                return;

            // Draw down whichever spool has the least left first - mirrors
            // finishing an already-opened spool before starting a fresh one.
            const target = filament.spools
                .filter(s => s.remaining > 0)
                .sort((a, b) => a.remaining - b.remaining)[0];

            if (!target)
                return;

            target.remaining = Math.max(0, target.remaining - d.weight);
            changed = true;
        });

        filamentLibrary.processedPrints.push(key);
        changed = true;
    });

    if (!changed)
        return;

    if (filamentLibrary.processedPrints.length > 200)
        filamentLibrary.processedPrints = filamentLibrary.processedPrints.slice(-200);

    renderFilamentLibrary();
    await saveFilamentLibrary();
}

loadFilamentLibrary();

const filamentAddToggle = byId("filamentAddToggle");
const filamentAddForm = byId("filamentAddForm");
const filamentColorHexInput = byId("filamentColorHex");
const filamentColorPreview = byId("filamentColorPreview");

// Windows' native <input type=color> picker was unreliable to confirm a
// choice in, so this is a plain hex text field instead (also lets a Bambu
// color hex be pasted in directly for exact auto-deduction matches) - this
// just keeps the little preview swatch next to it in sync as you type.
if (filamentColorHexInput && filamentColorPreview)
{
    const updatePreview = () => { filamentColorPreview.style.background = trayColorCss(filamentColorHexInput.value); };
    filamentColorHexInput.addEventListener("input", updatePreview);
    updatePreview();
}

if (filamentAddToggle && filamentAddForm)
{
    filamentAddToggle.addEventListener("click", () =>
    {
        const hidden = filamentAddForm.hasAttribute("hidden");

        if (hidden)
            filamentAddForm.removeAttribute("hidden");
        else
            filamentAddForm.setAttribute("hidden", "");

        filamentAddToggle.textContent = hidden ? "Cancel" : "+ Add filament";
    });

    filamentAddForm.addEventListener("submit", (event) =>
    {
        event.preventDefault();

        const material = byId("filamentMaterial").value.trim();
        const color = byId("filamentColorName").value.trim();
        const colorHex = byId("filamentColorHex").value.replace("#", "").toUpperCase();
        const brand = byId("filamentBrand").value.trim();

        if (!material || !color)
            return;

        filamentAddForm.reset();
        filamentAddForm.setAttribute("hidden", "");
        filamentAddToggle.textContent = "+ Add filament";

        withFreshLibrary(lib => { lib.filaments.push({ id: uid(), material, color, colorHex, brand, spools: [] }); });
    });
}

// ===== MQTT (browser, over Secure WebSockets) =====

let lastMessageAt = 0;
let lastPrinterMessageAt = 0;
let lastStaleReconnectAt = 0;
const STALE_AFTER_MS = 30000; // SEND_INTERVAL is 5s; 30s silence => treat as offline
const STALE_RECONNECT_COOLDOWN_MS = 20000;

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

// Both devices publish with retain=true on every message, not just the
// first - so the MQTT retain flag can't tell a genuinely fresh publish
// apart from the same old snapshot getting redelivered, which happens on
// every (re)subscribe. That includes mqtt.js's own automatic reconnect
// after any transient WebSocket drop, which happens far more often than
// an actual device outage on a tab left open a while. Blindly stamping
// lastMessageAt/lastPrinterMessageAt on every "message" event meant each
// of those reconnects "refreshed" the staleness clock with stale data,
// masking a genuinely offline device indefinitely - the status dots could
// stay green forever even with zero real data since the device went dark.
// Only count it as fresh if the device's own reported clock actually
// moved since the last message seen.
let lastSeenUptime = null;
let lastSeenPrinterNow = null;

client.on("message", (topic, payload) =>
{
    if (topic === PRINTER_TOPIC)
    {
        try
        {
            const data = JSON.parse(payload.toString());
            const isFresh = data.now !== lastSeenPrinterNow;

            if (isFresh)
            {
                lastSeenPrinterNow = data.now;
                lastPrinterMessageAt = Date.now();
                updatePrinter(data);
            }

            // A stale redelivery has nothing new to show - previously this
            // still called updatePrinter(data), repainting the display
            // from that old payload's own content (e.g. "IDLE" from
            // whatever gcode_state it last legitimately reported) even
            // though the staleness watchdog's dots had already gone red.
            // Leaving the "gone stale" display entirely to that watchdog
            // (setPrinterOffline, below) keeps the two from fighting.
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
        const isFresh = data.uptime !== lastSeenUptime;

        if (isFresh)
        {
            lastSeenUptime = data.uptime;
            lastMessageAt = Date.now();
            updateStatus(data);
        }
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

        // A rebooted device and a still-red dashboard together means the
        // device's connection to the broker was never the problem - this
        // tab's own WebSocket died silently (no close/error event fired,
        // mqtt.js's `connected` flag still reads true) without ever being
        // backgrounded, so the visibilitychange handler below - the only
        // place that previously forced a reconnect - never ran. This
        // covers the same zombie-connection recovery for a tab that's
        // been sitting in the foreground the whole time. Cooldown-gated
        // so a still-recovering connection doesn't get torn down again
        // every 5s while it's mid-reconnect.
        if (Date.now() - lastStaleReconnectAt > STALE_RECONNECT_COOLDOWN_MS)
        {
            lastStaleReconnectAt = Date.now();
            connectionLog(`Forcing reconnect after ${silentFor}s of silence`);
            setDot("brokerDot", false);
            client.end(true, {}, () => client.reconnect());
        }
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

