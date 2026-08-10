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

// On mobile the status LEDs are duplicated further down the page (see
// index.html's #mobileStatusStrip) rather than reordered via CSS, since
// they live in a different container than the header original and CSS
// can't reorder across containers. Centralizing the mirroring here (vs
// touching every setDot/setText call site) keeps the two copies in sync
// automatically wherever they're updated.
const MOBILE_STATUS_DOT_MIRROR = {
    wifiDot: "wifiDotMobile",
    brokerDot: "brokerDotMobile",
    mqttDot: "mqttDotMobile",
    watchdogDot: "watchdogDotMobile",
    printerWifiDot: "printerWifiDotMobile",
    printerMqttDot: "printerMqttDotMobile",
};

const MOBILE_STATUS_TEXT_MIRROR = {
    printerEsp32Temp: "printerEsp32TempMobile",
};

function setText(id, value)
{
    const el = byId(id);

    if (el)
        el.textContent = value;

    const mirrorId = MOBILE_STATUS_TEXT_MIRROR[id];

    if (mirrorId)
    {
        const mirrorEl = byId(mirrorId);

        if (mirrorEl)
            mirrorEl.textContent = value;
    }
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

    const mirrorId = MOBILE_STATUS_DOT_MIRROR[id];

    if (mirrorId)
    {
        const mirrorEl = byId(mirrorId);

        if (mirrorEl)
            mirrorEl.classList.toggle("ok", !!ok);
    }
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

        // A full "YYYY-MM-DD HH:MM:SS" string as one nowrap line overflowed
        // this column's width and got clipped mid-time ("11:57:5...") - date
        // and time as two stacked lines each fit comfortably instead.
        const time = document.createElement("div");
        time.className = "historyTimestamp";

        if (item.time && item.time !== "pending")
        {
            const [isoDate, timePart] = item.time.split(" ");
            // Device stores/reports ISO "YYYY-MM-DD" (24h clock already, no
            // AM/PM anywhere in the firmware's format) - reformatted here
            // for display only, not touching the stored value itself.
            const [y, m, d] = (isoDate || "").split("-");
            const dateLine = document.createElement("span");
            dateLine.textContent = (y && m && d) ? `${d}.${m}.${y}` : (isoDate || "");
            const timeLine = document.createElement("span");
            timeLine.textContent = timePart || "";
            time.appendChild(dateLine);
            time.appendChild(timeLine);
        }
        else
        {
            const line = document.createElement("span");
            line.textContent = "syncing...";
            time.appendChild(line);
        }

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

// Euclidean RGB distance - used to match a Task API color against the
// library tolerantly instead of requiring an exact hex string match. Task
// API's amsDetail color is confirmed to sometimes report a generic/default
// value rather than the precise measured AMS color (e.g. black as
// "000000" when the library's real entry is "161616") - an exact-match
// deduction silently skips these forever, since the library lookup just
// finds nothing and returns. Small distances (near-black vs true black)
// should still match; genuinely different colors (black vs blue) are far
// enough apart that a reasonable threshold never confuses them.
function colorDistance(hexA, hexB)
{
    if (!hexA || !hexB || hexA.length < 6 || hexB.length < 6)
        return Infinity;

    const a = parseInt(hexA.slice(0, 6), 16);
    const b = parseInt(hexB.slice(0, 6), 16);

    const dr = ((a >> 16) & 0xFF) - ((b >> 16) & 0xFF);
    const dg = ((a >> 8) & 0xFF) - ((b >> 8) & 0xFF);
    const db = (a & 0xFF) - (b & 0xFF);

    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Same threshold used everywhere a Task API color needs correcting against
// the library - single source of truth so display and deduction never
// disagree on what counts as "close enough".
const COLOR_MATCH_THRESHOLD = 80;

// Best-effort color correction for DISPLAY - Task API's raw amsDetail
// color is the same approximate/sometimes-wrong field the deduction logic
// already treats with suspicion (see colorDistance's own comment above);
// showing that raw value verbatim can visibly contradict the spool that
// actually got decremented (confirmed live: a chip rendered orange for a
// print that used yellow). Falls back to the raw hex when nothing in the
// library is close enough to guess from.
function resolveLibraryColor(hex, material)
{
    const h = (hex || "").slice(0, 6).toUpperCase();
    const m = (material || "").toUpperCase();

    const match = filamentLibrary.filaments
        .filter(f => f.material.toUpperCase() === m)
        .map(f => ({ f, dist: colorDistance(h, (f.colorHex || "").toUpperCase()) }))
        .sort((a, b) => a.dist - b.dist)
        .find(c => c.dist <= COLOR_MATCH_THRESHOLD);

    return match ? match.f.colorHex : hex;
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

// renderPrintHistory rebuilds the whole list from scratch on every call
// (list.innerHTML = "") - it's invoked on every incoming printer MQTT
// message (~5s), so without tracking which items the user had open
// separately from the DOM itself, an expanded item would collapse again
// within a few seconds of opening it, before anyone could actually read
// the detail they just clicked to see.
const expandedHistoryKeys = new Set();

// Same "survive the every-5s rebuild" reasoning as expandedHistoryKeys
// above - persisted outside the render function so toggling "Show more"
// doesn't get reset by the next incoming printer MQTT message.
let historyShowAll = false;

const HISTORY_COLLAPSED_COUNT = 5;

// "Print by object" (sequential multi-copy) plates report a joined
// "name 4 + name 5 + name 8 + ..." string at each between-object
// transition - CYD already hard-truncates this before it ever reaches
// here (confirmed live: "...cep_let..." mid-word), so the segment count
// visible here can't be trusted as the true copy count. Collapse to just
// the base name + "(multiple copies)" rather than display the raw
// garbled/truncated string or claim a specific count that might be wrong.
function shrinkMultiObjectName(name)
{
    if (!name || !name.includes(" + "))
        return name;

    const first = name.split(" + ")[0].trim();
    const base = first.replace(/\s+\d+$/, "");

    return `${base} (multiple copies)`;
}

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

    const visibleItems = historyShowAll ? items : items.slice(0, HISTORY_COLLAPSED_COUNT);

    // Already newest-first from the device.
    visibleItems.forEach(item =>
    {
        // item.outcome is the printer's own gcode_state at the moment it
        // stopped running - "FINISH" for a normal completion. "PAUSE" is a
        // genuinely different situation from "FAILED"/cancelled (Bambu's
        // firmware uses FAILED for both a real failure AND a user-
        // initiated cancel, but PAUSE means the print is/was just paused,
        // not abandoned - confirmed live: a 15s "PAUSE" entry immediately
        // followed by a fresh full-length print of the same file, which a
        // red "Cancelled/failed" badge misrepresented as filament lost to
        // a failure). Both still skip auto-deduction (see
        // processFilamentDeductions) since there's no reliable way to
        // measure a partial amount from any data source available here -
        // only the wording/color differ.
        const isPause = item.outcome === "PAUSE";
        const notFinished = item.outcome && item.outcome !== "FINISH";

        const row = document.createElement("div");
        row.className = "historyItem historyItemClickable";
        row.style.borderLeftColor = notFinished ? (isPause ? "var(--yellow)" : "var(--red)") : "var(--cyan)";
        row.tabIndex = 0;
        row.setAttribute("role", "button");

        const left = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = shrinkMultiObjectName(item.name) || "Untitled";
        left.appendChild(title);

        if (notFinished)
        {
            const badge = document.createElement("span");
            badge.className = "historyOutcomeBadge";
            badge.textContent = isPause ? "Paused" : "Cancelled/failed";
            left.appendChild(badge);
        }

        const sub = document.createElement("small");
        sub.textContent = `${item.layers || 0} layers - ${formatDeviceDate(item.start)}`;
        left.appendChild(sub);

        const time = document.createElement("span");
        time.textContent = printDuration(item.start, item.end);

        row.appendChild(left);
        row.appendChild(time);

        const historyKey = `${item.name}__${item.start}`;
        const isExpanded = expandedHistoryKeys.has(historyKey);

        const detail = document.createElement("div");
        detail.className = "historyDetail";
        detail.hidden = !isExpanded;
        row.setAttribute("aria-expanded", isExpanded ? "true" : "false");

        const override = filamentLibrary.historyOverrides[historyKey];
        const usage = parseTrayUsage(item.trays);
        const matchedTask = usage.length === 0 ? matchTaskForHistoryItem(item) : null;
        const resolvedUsage = resolveItemUsage(item);

        // Manual corrections win over everything else - Bambu's own Task
        // API is confirmed unreliable for jobs whose AMS slot wasn't
        // explicitly set during slicing (Bambu Handy jobs, or auto-assigned
        // on the printer's own screen): it falls back to a placeholder
        // (slot 0, or a hardcoded default color) rather than the tray
        // actually used, and there's no way to recover the true value from
        // that API after the fact.
        if (resolvedUsage.length > 0)
        {
            const chips = document.createElement("div");
            chips.className = "usageChips";
            resolvedUsage.forEach(e => chips.appendChild(usageChip(e)));
            detail.appendChild(chips);

            if (override && override.source === "gcode")
            {
                const verified = document.createElement("p");
                verified.className = "gcodeVerified";
                verified.textContent = "Verified from printer's gcode";
                detail.appendChild(verified);
            }
        }
        else
        {
            const none = document.createElement("p");
            // Distinguish "Task API never had this print" (Bambu Handy
            // starts sometimes don't populate amsDetail at all, or the
            // task has aged out of Task API's rolling window) from the
            // A1 AMS-lite's genuine reporting gap, so it's clear "Fix
            // filament" is the only way to recover this one rather than
            // waiting for it to resolve itself.
            none.textContent = item.trays
                ? "No filament usage recorded for this print - the A1's AMS-lite doesn't report enough data to measure it."
                : "No filament usage recorded - Bambu's Task API has no per-color breakdown for this print. Use \"Fix filament\" below to correct it manually.";
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

            if (hidden)
                expandedHistoryKeys.add(historyKey);
            else
                expandedHistoryKeys.delete(historyKey);
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

    if (items.length > HISTORY_COLLAPSED_COUNT)
    {
        const moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.className = "infoBtn";
        moreBtn.style.width = "100%";
        moreBtn.style.marginTop = "8px";
        moreBtn.textContent = historyShowAll
            ? "Show less"
            : `Show more (${items.length - HISTORY_COLLAPSED_COUNT} older)`;

        moreBtn.addEventListener("click", () =>
        {
            historyShowAll = !historyShowAll;
            renderPrintHistory(lastHistoryItems);
        });

        list.appendChild(moreBtn);
    }
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

// ===== Historical filament spend (Today / Yesterday / This Week) =====
// Reads filamentLibrary.deductionLog directly instead of the live device
// history array - deductionLog is a permanent, KV-backed ledger of exactly
// what was deducted per print (kept for the last ~200 processed prints,
// see processFilamentDeductions), while CYD's own history is a volatile
// ~20-slot rolling buffer. "Today" happens to always fit in that buffer,
// but "Yesterday"/"This Week" can't - once more than ~20 prints have run
// since the period started, older ones silently fall off the device's own
// list and would undercount. deductionLog isn't subject to that limit.
let selectedSpendPeriod = "today";
// 1-12, defaults to the current calendar month - only consulted when
// selectedSpendPeriod === "month".
let selectedSpendMonth = new Date().getMonth() + 1;

function spendPeriodStart(period)
{
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (period === "yesterday")
    {
        start.setDate(start.getDate() - 1);
        return start;
    }

    if (period === "week")
    {
        // Rolling 7 days including today, not "since Monday" - avoids
        // week-start-day ambiguity and just answers "last 7 days".
        start.setDate(start.getDate() - 6);
        return start;
    }

    if (period === "month")
    {
        // Current calendar year - the dropdown only picks a month (1-12),
        // there's no year selector, so this always means "this year".
        return new Date(start.getFullYear(), selectedSpendMonth - 1, 1);
    }

    return start;   // today
}

function spendPeriodEnd(period)
{
    if (period === "yesterday")
    {
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        return end;   // exclusive - up to the start of today
    }

    if (period === "month")
    {
        // Exclusive upper bound: the 1st of the FOLLOWING month. Works
        // the same whether the selected month is the current one (still
        // in progress) or a past one (already fully elapsed) - either
        // way this correctly bounds the whole month.
        const now = new Date();
        return new Date(now.getFullYear(), selectedSpendMonth, 1);
    }

    const end = new Date();
    end.setSeconds(end.getSeconds() + 1);   // inclusive of right now
    return end;
}

// deductionLog keys are "${item.name}__${item.start}" - item.start is
// always a fixed "YYYY-MM-DD HH:MM:SS" device timestamp with no "__" in
// it, so the LAST "__" is always the real separator even if item.name
// itself happens to contain one.
function deductionKeyDate(key)
{
    const idx = key.lastIndexOf("__");
    return idx === -1 ? null : parseDeviceTime(key.slice(idx + 2));
}

function renderTodayTotals()
{
    const list = byId("todayTotalsList");

    if (!list)
        return;

    list.innerHTML = "";

    const start = spendPeriodStart(selectedSpendPeriod);
    const end = spendPeriodEnd(selectedSpendPeriod);

    // Group by colour+material: two different "reds" (e.g. red PLA vs red
    // PETG) stay separate rather than being merged into one bogus total.
    const groups = new Map();
    const printsInPeriod = new Set();

    for (const [key, log] of Object.entries(filamentLibrary.deductionLog || {}))
    {
        const d = deductionKeyDate(key);
        if (!d || d < start || d >= end)
            continue;

        printsInPeriod.add(key);

        for (const [hex, grams] of Object.entries(log || {}))
        {
            if (!grams)
                continue;

            // deductionLog's hex keys are the RAW source color (Task API's
            // targetColor or the live tray reading) at the moment of
            // deduction, not the library's own stored hex - same "BCBCBC
            // vs BBBBBB, both gray" mismatch as elsewhere, confirmed live
            // here too (showed "? - Gray"/"? - Blue" instead of the real
            // material). Fuzzy-match against the library the same way,
            // not an exact lookup. No material to pre-filter by (the log
            // only ever stored color), so this can only mis-pick when two
            // different materials share a near-identical color - not the
            // case for this library today, but a real limitation of what
            // deductionLog records.
            const filament = filamentLibrary.filaments
                .map(f => ({ f, dist: colorDistance(hex, (f.colorHex || "").toUpperCase()) }))
                .sort((a, b) => a.dist - b.dist)
                .find(c => c.dist <= COLOR_MATCH_THRESHOLD)?.f;
            const material = filament ? filament.material : "?";
            const canonicalColor = filament ? filament.colorHex : hex;
            const gKey = `${canonicalColor}|${material}`;
            const prev = groups.get(gKey) || { color: canonicalColor, type: material, total: 0, prints: new Set() };
            prev.total += grams;
            prev.prints.add(key);
            groups.set(gKey, prev);
        }
    }

    setText("todayPrintCount", `${printsInPeriod.size} print${printsInPeriod.size === 1 ? "" : "s"}`);

    if (groups.size === 0)
    {
        const empty = document.createElement("div");
        empty.className = "historyItem";
        empty.textContent = printsInPeriod.size === 0
            ? "No prints logged in this period"
            : `${printsInPeriod.size} print(s), no filament usage recorded`;
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
        // Same "Material - Color" convention as the Filament Library cards
        // right below this panel, so the two sections read consistently.
        title.textContent = `${g.type || "?"} - ${guessColorName(g.color)}`;
        left.appendChild(title);

        const sub = document.createElement("small");
        sub.textContent = `${g.prints.size} print(s)`;
        left.appendChild(sub);

        const total = document.createElement("span");
        total.textContent = `${g.total.toFixed(2)}g`;

        row.appendChild(left);
        row.appendChild(total);

        list.appendChild(row);
    });
}

function setSpendPeriod(period)
{
    const monthSelect = byId("spendMonthSelect");

    if (monthSelect)
        monthSelect.hidden = period !== "month";

    if (period === selectedSpendPeriod)
        return;

    selectedSpendPeriod = period;

    document.querySelectorAll(".spendPeriodBtn").forEach(btn =>
    {
        btn.classList.toggle("active", btn.dataset.period === period);
    });

    renderTodayTotals();
}

document.querySelectorAll(".spendPeriodBtn").forEach(btn =>
{
    btn.addEventListener("click", () => setSpendPeriod(btn.dataset.period));
});

const spendMonthSelect = byId("spendMonthSelect");

if (spendMonthSelect)
{
    spendMonthSelect.value = String(selectedSpendMonth);
    spendMonthSelect.addEventListener("change", () =>
    {
        selectedSpendMonth = Number(spendMonthSelect.value);
        renderTodayTotals();
    });
}

function updatePower(data)
{
    setText("powerState", "ONLINE");

    const w = Number(data.powerW) || 0;
    const v = Number(data.voltage) || 0;
    const a = Number(data.current) || 0;

    setText("powerWatts", w.toFixed(0));
    setText("powerVolts", v.toFixed(0));
    setText("powerAmps", a.toFixed(2));

    setText("powerToday", `${(Number(data.todayKwh) || 0).toFixed(2)} kWh`);
    setText("powerYesterday", `${(Number(data.yesterdayKwh) || 0).toFixed(2)} kWh`);
    setText("powerTotal", `${(Number(data.totalKwh) || 0).toFixed(2)} kWh`);

    // relayState is best-effort on the device side (a separate lightweight
    // poll from the wattage/voltage/current numbers above) - absent if
    // that particular request failed, not necessarily if the relay is off.
    if (data.relayState === "ON" || data.relayState === "OFF")
    {
        lastRelayState = data.relayState;
        setText("powerRelayState", data.relayState);

        const toggleBtn = byId("powerToggleBtn");

        if (toggleBtn)
        {
            toggleBtn.disabled = false;
            toggleBtn.textContent = data.relayState === "ON" ? "Turn OFF" : "Turn ON";
        }
    }

    recordPowerSample(w, v, a);
}

// ===== Power history (Min/Max/Average + the line graph) =====
//
// Scoped to the CURRENT PRINT, not an open-ended session - resets
// whenever data.currentStart (the printer's own per-print start
// timestamp, stable across pause/resume, see updatePrinter() below)
// changes to a new value. Persisted to this browser's localStorage, NOT
// to Cloudflare KV - the plug reports every 10s, and print_watch's own KV
// writes already had to be throttled to stay under the free-tier daily
// write limit (see print_watch.py), so writing every power sample
// server-side would blow through that same budget for comparatively
// little benefit. localStorage has no such quota concern (it's local to
// this browser/device), so a write per sample is fine - it just means
// the history is per-device, not shared across browsers.

const POWER_HISTORY_MAX = 360; // ~1 hour of samples at the plug's 10s poll interval
const POWER_HISTORY_STORAGE_KEY = "powerHistoryV1";

const powerHistory = []; // { w, v, a }[]

// Last relay state actually reported by the device - the toggle button
// below sends the OPPOSITE of this, so it always reflects reality even if
// someone flips the plug by hand (Tasmota's own web UI, physical button)
// rather than only through this dashboard.
let lastRelayState = null;

// The print (by its data.currentStart value) the current powerStats/
// powerHistory belong to - null until the first print start is seen.
let lastPrintStart = null;

const powerStats = {
    w: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
    v: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
    a: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
};

function savePowerHistory()
{
    try
    {
        localStorage.setItem(POWER_HISTORY_STORAGE_KEY, JSON.stringify({ history: powerHistory, stats: powerStats, printStart: lastPrintStart }));
    }
    catch (err)
    {
        // Storage full/disabled (private browsing, quota exceeded) - the
        // graph just won't survive a reload this time, not worth surfacing.
    }
}

function loadPowerHistory()
{
    let saved;

    try
    {
        saved = JSON.parse(localStorage.getItem(POWER_HISTORY_STORAGE_KEY));
    }
    catch (err)
    {
        return;
    }

    if (!saved || !Array.isArray(saved.history))
        return;

    // Mutate the existing array/object in place rather than reassigning -
    // both are declared const and already captured by reference in the
    // functions below.
    powerHistory.push(...saved.history.slice(-POWER_HISTORY_MAX));

    for (const key of ["w", "v", "a"])
    {
        if (saved.stats && saved.stats[key])
            Object.assign(powerStats[key], saved.stats[key]);
    }

    lastPrintStart = saved.printStart || null;

    renderPowerStats();
    schedulePowerChartDraw();
}

function resetPowerStatsForNewPrint()
{
    powerHistory.length = 0;

    for (const key of ["w", "v", "a"])
        Object.assign(powerStats[key], { min: Infinity, max: -Infinity, sum: 0, count: 0 });

    savePowerHistory();
    renderPowerStats();
    schedulePowerChartDraw();
}

function fmtPowerStat(value, digits)
{
    return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function renderPowerStats()
{
    setText("powerMinW", fmtPowerStat(powerStats.w.min, 0));
    setText("powerMaxW", fmtPowerStat(powerStats.w.max, 0));
    setText("powerAvgW", powerStats.w.count ? (powerStats.w.sum / powerStats.w.count).toFixed(0) : "--");

    setText("powerMinV", fmtPowerStat(powerStats.v.min, 0));
    setText("powerMaxV", fmtPowerStat(powerStats.v.max, 0));
    setText("powerAvgV", powerStats.v.count ? (powerStats.v.sum / powerStats.v.count).toFixed(0) : "--");

    setText("powerMinA", fmtPowerStat(powerStats.a.min, 2));
    setText("powerMaxA", fmtPowerStat(powerStats.a.max, 2));
    setText("powerAvgA", powerStats.a.count ? (powerStats.a.sum / powerStats.a.count).toFixed(2) : "--");
}

const powerChartCanvas = byId("powerChart");
const powerChartCtx = powerChartCanvas ? powerChartCanvas.getContext("2d") : null;
let powerChartDrawQueued = false;

function schedulePowerChartDraw()
{
    if (!powerChartCtx || powerChartDrawQueued)
        return;

    // Coalesce bursts of updates (a new sample plus a window resize
    // landing in the same tick) into a single redraw on the next frame,
    // rather than repainting the canvas multiple times back to back.
    powerChartDrawQueued = true;
    requestAnimationFrame(() =>
    {
        powerChartDrawQueued = false;
        drawPowerChart();
    });
}

function recordPowerSample(w, v, a)
{
    powerHistory.push({ w, v, a });

    if (powerHistory.length > POWER_HISTORY_MAX)
        powerHistory.shift();

    for (const [key, value] of [["w", w], ["v", v], ["a", a]])
    {
        const s = powerStats[key];

        // 0 means the plug is idle/off, not a real minimum worth
        // recording - a printer briefly reading 0W shouldn't permanently
        // pin "min" at 0 for the rest of the print once real draw resumes.
        if (value > 0 && value < s.min) s.min = value;
        if (value > s.max) s.max = value;

        s.sum += value;
        s.count += 1;
    }

    savePowerHistory();
    renderPowerStats();
    schedulePowerChartDraw();
}

function resizePowerCanvas()
{
    if (!powerChartCanvas)
        return;

    const rect = powerChartCanvas.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0)
        return; // hidden tab - nothing to size against yet

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));

    if (powerChartCanvas.width !== w || powerChartCanvas.height !== h)
    {
        powerChartCanvas.width = w;
        powerChartCanvas.height = h;
    }
}

function smoothLinePath(ctx, points)
{
    // Quadratic curve through each pair's midpoint - a cheap way to get a
    // smooth line without jagged straight segments, without pulling in a
    // charting library for one graph.
    if (points.length < 2)
        return;

    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++)
    {
        const mx = (points[i].x + points[i + 1].x) / 2;
        const my = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
}

function drawPowerSeries(ctx, values, width, height, padding, color)
{
    if (values.length < 2)
        return;

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max)
    {
        // Flat reading (plug idle at a constant draw) - give it headroom
        // so it still draws as a visible line instead of a hairline
        // pinned to one edge.
        min -= 1;
        max += 1;
    }

    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const points = values.map((value, i) => ({
        x: padding + (innerW * i) / (values.length - 1),
        y: padding + innerH - ((value - min) / (max - min)) * innerH,
    }));

    ctx.beginPath();
    smoothLinePath(ctx, points);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
}

function drawPowerChart()
{
    if (!powerChartCtx || !powerChartCanvas)
        return;

    resizePowerCanvas();

    const width = powerChartCanvas.width;
    const height = powerChartCanvas.height;

    if (powerHistory.length < 2 || width === 0 || height === 0)
    {
        if (width && height) powerChartCtx.clearRect(0, 0, width, height);
        return;
    }

    const padding = 10 * (window.devicePixelRatio || 1);

    powerChartCtx.clearRect(0, 0, width, height);

    const rootStyle = getComputedStyle(document.documentElement);

    // Each series is scaled to its OWN min/max range, not a shared axis -
    // Watts/Volts/Amps live on wildly different scales (a couple of watts
    // and well under 1 amp next to ~230 volts), so a shared axis would
    // flatten two of the three lines to a near-invisible sliver.
    drawPowerSeries(powerChartCtx, powerHistory.map(p => p.w), width, height, padding, rootStyle.getPropertyValue("--green").trim());
    drawPowerSeries(powerChartCtx, powerHistory.map(p => p.v), width, height, padding, rootStyle.getPropertyValue("--yellow").trim());
    drawPowerSeries(powerChartCtx, powerHistory.map(p => p.a), width, height, padding, rootStyle.getPropertyValue("--blue").trim());
}

window.addEventListener("resize", schedulePowerChartDraw);

// ===== Power History card (week/month, server-side via scripts/power_watch.py) =====

let powerHistoryPeriod = "week";

async function loadPowerHistoryCard()
{
    const days = powerHistoryPeriod === "month" ? 30 : 7;
    let data;

    try
    {
        const res = await fetch(`/api/power-history?days=${days}`);
        data = await res.json();
    }
    catch (err)
    {
        return;
    }

    renderPowerHistoryCard(Array.isArray(data.days) ? data.days : []);
}

function renderPowerHistoryCard(dayRecords)
{
    const agg = {
        w: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
        v: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
        a: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
    };
    let totalKwh = 0;

    for (const day of dayRecords)
    {
        for (const [key, upper] of [["w", "W"], ["v", "V"], ["a", "A"]])
        {
            const min = day[`min${upper}`];
            const max = day[`max${upper}`];

            if (min !== null && min < agg[key].min) agg[key].min = min;
            if (max !== null && max > agg[key].max) agg[key].max = max;

            agg[key].sum += Number(day[`sum${upper}`]) || 0;
            agg[key].count += Number(day[`count${upper}`]) || 0;
        }

        totalKwh += Number(day.kwh) || 0;
    }

    const fmt = (agg, digits) => ({
        min: Number.isFinite(agg.min) ? agg.min.toFixed(digits) : "--",
        max: Number.isFinite(agg.max) ? agg.max.toFixed(digits) : "--",
        avg: agg.count ? (agg.sum / agg.count).toFixed(digits) : "--",
    });

    const w = fmt(agg.w, 0);
    const v = fmt(agg.v, 0);
    const a = fmt(agg.a, 2);

    setText("powerHistMinW", w.min);
    setText("powerHistMaxW", w.max);
    setText("powerHistAvgW", w.avg);

    setText("powerHistMinV", v.min);
    setText("powerHistMaxV", v.max);
    setText("powerHistAvgV", v.avg);

    setText("powerHistMinA", a.min);
    setText("powerHistMaxA", a.max);
    setText("powerHistAvgA", a.avg);

    setText("powerHistTotalKwh", `${totalKwh.toFixed(2)} kWh`);
    setText("powerHistDayCount", String(dayRecords.length));

    const hintEl = byId("powerHistHint");

    if (hintEl)
        hintEl.hidden = dayRecords.length > 0;
}

document.querySelectorAll("[data-power-period]").forEach(btn =>
{
    btn.addEventListener("click", () =>
    {
        document.querySelectorAll("[data-power-period]").forEach(b => b.classList.toggle("active", b === btn));
        powerHistoryPeriod = btn.dataset.powerPeriod;
        loadPowerHistoryCard();
    });
});

// Restore any history saved by a previous page load - must happen after
// powerChartCanvas/powerChartCtx above are declared, since
// schedulePowerChartDraw()/drawPowerChart() read them.
loadPowerHistory();

// Read by the power-toggle confirm dialog, so turning the plug off while
// a print is actively running gets an extra, more specific warning.
let printerIsRunning = false;

function updatePrinter(data)
{
    const state = data.gcodeState || "UNKNOWN";
    const bambuOk = data.bambuConnected === true;

    printerIsRunning = bambuOk && state === "RUNNING";

    // currentStart is stable across pause/resume for the SAME print (see
    // print_history.cpp's historyOnPrintStart()) - only changes when a
    // genuinely new print begins, which is exactly the "start fresh"
    // signal the Power tab's Min/Max/Average card needs.
    if (data.currentStart && data.currentStart !== lastPrintStart)
    {
        lastPrintStart = data.currentStart;
        resetPowerStatsForNewPrint();
    }

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

    // mc_percent is Bambu's own progress % (what the printer's LCD shows),
    // not a layer-ratio we derive ourselves - the printer counts prep/
    // heating time toward its percentage, so a layerNum/totalLayerNum
    // ratio that only starts once real printing begins reads noticeably
    // lower than Bambu's own screen for the same moment (confirmed live:
    // 37% shown here vs 72% on the printer's LCD with 1h13m left).
    const pct = showProgress ? Math.round(Number(data.mcPercent) || 0) : 0;
    setText("printerProgressPct", showProgress ? `${pct}%` : "--%");
    setBar("printerProgressBar", pct, 100, "var(--cyan)");

    setText("printerNozzle", `${Number(data.nozzleTemp || 0).toFixed(1)} °C`);
    setText("printerBed", `${Number(data.bedTemp || 0).toFixed(1)} °C`);
    setText("printerFan", bambuOk ? `${Number(data.fanSpeedPct) || 0}%` : "--%");
    setText("printerEsp32Temp", `${Number(data.esp32Temp || 0).toFixed(1)} °C`);

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
    // Multi-tray matching tries slot first, then falls back to comparing
    // the detail's color against the LIVE tray's color (fuzzy, same
    // threshold as deductions) - confirmed live during a yellow+white
    // print: the yellow amsDetail entry's slotId was wrong, so "Filament
    // used" went blank whenever yellow was the active color even though
    // a perfectly identifiable yellow entry was sitting right there.
    const amsDetail = (latestPrinterTask && latestPrinterTask.amsDetail) || [];
    const liveHex = mqttActiveTray ? (mqttActiveTray.color || "").slice(0, 6).toUpperCase() : "";
    const matchingDetail = amsDetail.length === 1
        ? amsDetail[0]
        : amsDetail.find(d => (d.amsId * 4) + d.slotId === trayNow)
            || (liveHex ? amsDetail.find(d => colorDistance((d.color || "").slice(0, 6).toUpperCase(), liveHex) <= 80) : null)
            || null;

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
        setText("printerFilamentUsed", `${matchingDetail.weight.toFixed(2)} g (${colorName} ${matchingDetail.type || "?"})`);
    }
    else
    {
        if (filamentUsedSwatch)
            filamentUsedSwatch.style.background = "#2a3136";

        setText("printerFilamentUsed", "--");
    }

    renderAmsGrid(trays, trayNow);
    renderPrintHistory(data.history || []);
    renderTodayTotals();
    processFilamentDeductions(data.history || []);
    reconcileDeductionLog();
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
    // Exact match when the device reports its own taskId (subtask_id/
    // task_id/project_id from the live MQTT report - confirmed live to be
    // the SAME value as Task API's own "id" field for the same job). Real
    // fix for the recurring "multiple prints share the same generic
    // slicer title" collision the fuzzy title+time-window fallback below
    // has to guess around - not yet populated until the device firmware
    // sends it, so this silently falls through to that fallback for any
    // history entry older than that update.
    if (item.taskId)
    {
        const exact = latestPrinterTasks.find(t => t.id != null && String(t.id) === String(item.taskId));

        if (exact && exact.amsDetail && exact.amsDetail.length > 0)
            return exact;
    }

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

// Single source of truth for "what filament did this history item use" -
// override > device-reported trays > Task API fallback, the exact
// precedence renderPrintHistory's own detail panel already used. Sharing
// it here fixes renderTodayTotals, which used to read only the raw
// device-reported trays and so showed "no filament usage recorded" for
// any print that actually resolves through an override or the Task API
// fallback (confirmed live: "9 print(s) today, no filament usage
// recorded" while those same prints' own history rows displayed fine).
// Returns entries with amount already formatted as a display string
// ("12.34g"), matching what usageChip() and the today-totals join both
// expect.
function resolveItemUsage(item)
{
    const key = `${item.name}__${item.start}`;
    const override = filamentLibrary.historyOverrides[key];

    if (override)
    {
        // Multi-color gcode-verified override (see gcode-sync.js) - each
        // detail already carries its own weight, unlike the single-color
        // shape below where a missing weight falls back to Task API's
        // total (there's no single "total" that makes sense to split
        // across multiple details here, so a detail with no weight is
        // just skipped rather than guessed at).
        if (Array.isArray(override.details))
        {
            return override.details
                .filter(d => typeof d.weight === "number")
                .map(d => ({ color: d.colorHex, type: d.material, amount: `${d.weight.toFixed(2)}g` }));
        }

        if (typeof override.weight === "number")
            return [{ color: override.colorHex, type: override.material, amount: `${override.weight.toFixed(2)}g` }];

        const matched = matchTaskForHistoryItem(item);
        return matched ? [{ color: override.colorHex, type: override.material, amount: `${matched.weight.toFixed(2)}g` }] : [];
    }

    const usage = parseTrayUsage(item.trays);
    if (usage.length > 0)
        return usage;

    const matched = matchTaskForHistoryItem(item);
    if (matched)
    {
        return matched.amsDetail.map(d => ({
            color: resolveLibraryColor(d.color, d.type),
            type: d.type,
            amount: `${d.weight.toFixed(2)}g`,
        }));
    }

    return [];
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

// deductionLog: per-print record of what was actually subtracted from
// spools ({ printKey: { colorHex: grams } }). This is what makes
// re-processing a print idempotent - when a gcode correction un-marks a
// print as processed (so corrected data gets applied), the re-run
// deducts only the DIFFERENCE vs what this log says was already taken,
// instead of the full amount again. Confirmed live without it: Holder
// (21.07) deducted 6.37g twice - once from the Task API match, then
// again in full when the gcode override landed.
let filamentLibrary = { filaments: [], processedPrints: [], historyOverrides: {}, deductionLog: {} };
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
                deductionLog: data.deductionLog || {},
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
        renderTodayTotals();
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

// Which filament entries have their spool-history panel open - persisted
// outside renderFilamentLibrary so it survives the periodic re-render
// (same reasoning as expandedHistoryKeys/historyShowAll above).
const expandedSpoolHistory = new Set();

function toggleSpoolHistory(filamentId)
{
    if (expandedSpoolHistory.has(filamentId))
        expandedSpoolHistory.delete(filamentId);
    else
        expandedSpoolHistory.add(filamentId);

    renderFilamentLibrary();
}

// Every spool has always recorded createdAt (see onNewLibrarySpool); this
// is just the first place it's ever surfaced back to the user - to answer
// "how long did this spool actually last" and "which color/material am I
// burning through fastest". toLocaleDateString() uses the browser's own
// timezone, no manual offset needed.
function buildSpoolHistoryPanel(f)
{
    const panel = document.createElement("div");
    panel.className = "spoolHistoryPanel";

    const spools = (f.spools || []).slice().sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (spools.length === 0)
    {
        const empty = document.createElement("p");
        empty.textContent = "No spools recorded yet.";
        panel.appendChild(empty);
        return panel;
    }

    spools.forEach(spool =>
    {
        const row = document.createElement("div");
        row.className = "spoolHistoryRow";

        const added = spool.createdAt ? new Date(spool.createdAt) : null;
        const removed = spool.removedAt ? new Date(spool.removedAt) : null;

        const addedText = added ? added.toLocaleDateString() : "unknown date";
        const line = document.createElement("span");

        if (removed && added)
        {
            const days = Math.max(0, Math.round((removed - added) / 86400000));
            line.textContent = `${spool.total}g - added ${addedText}, removed ${removed.toLocaleDateString()} (lasted ${days} day${days === 1 ? "" : "s"})`;
        }
        else if (added)
        {
            const daysSoFar = Math.max(0, Math.round((Date.now() - added.getTime()) / 86400000));
            line.textContent = `${spool.total}g - added ${addedText} (in use ${daysSoFar} day${daysSoFar === 1 ? "" : "s"} so far)`;
        }
        else
        {
            line.textContent = `${spool.total}g - added date unknown (from before this was tracked)`;
        }

        row.appendChild(line);
        panel.appendChild(row);
    });

    return panel;
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

        // Warns against the LOWEST active (non-removed) spool of this
        // color, not the sum across all its spools - a fresh backup spool
        // would otherwise mask a nearly-empty one still loaded and at
        // risk of slipping off the spool (confirmed live: ~93g remaining
        // on the loaded spool, well past the point where that's a real
        // risk). Fixed gram thresholds, not a percentage of that spool's
        // own total, so a small and a large spool warn at the same
        // physical remaining amount - same thresholds as CYD's own
        // Filament Library screen.
        const activeSpools = (f.spools || []).filter(s => !s.removedAt);

        if (activeSpools.length > 0)
        {
            const lowest = Math.min(...activeSpools.map(s => s.remaining));

            if (lowest <= 200)
            {
                const mark = document.createElement("span");
                mark.className = lowest <= 150 ? "lowFilamentMark critical" : "lowFilamentMark";
                mark.textContent = "!";
                title.appendChild(mark);
            }
        }

        meta.appendChild(title);

        if (f.brand)
        {
            const sub = document.createElement("small");
            sub.textContent = f.brand;
            meta.appendChild(sub);
        }

        head.appendChild(sw);
        head.appendChild(meta);
        entry.appendChild(head);

        if (expandedSpoolHistory.has(f.id))
            entry.appendChild(buildSpoolHistoryPanel(f));

        const spoolList = document.createElement("div");
        spoolList.className = "spoolList";

        // Removed spools stay in the data (see onRemoveSpool) so the
        // History panel above can still show when they were added/
        // removed - just hidden from the active/editable list here.
        (f.spools || []).filter(s => !s.removedAt).forEach(spool =>
        {
            const row = document.createElement("div");
            row.className = "spoolRow";

            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.step = "0.01";
            input.value = Math.max(0, spool.remaining).toFixed(2);
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

        // All entry-level actions on one row (was Edit/Remove/History up
        // in the header, "New spool" separate at the bottom) - consolidated
        // per request, and frees up header space for the title/brand in
        // the narrower 4-column grid layout.
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

        const historyBtn = document.createElement("button");
        historyBtn.type = "button";
        historyBtn.className = "infoBtn";
        historyBtn.textContent = "History";
        historyBtn.addEventListener("click", () => toggleSpoolHistory(f.id));

        const newSpoolBtn = document.createElement("button");
        newSpoolBtn.type = "button";
        newSpoolBtn.className = "infoBtn";
        newSpoolBtn.textContent = "New spool";
        newSpoolBtn.addEventListener("click", () => onNewLibrarySpool(f.id));

        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);
        actions.appendChild(historyBtn);
        actions.appendChild(newSpoolBtn);

        entry.appendChild(actions);
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

// Was wired to the Edit button (filamentEntryActions) but never actually
// implemented - clicking it silently did nothing (a ReferenceError in the
// console, invisible without devtools open). Confirmed live: this is
// exactly how a filament ends up with a wrong stored color forever - the
// Add-filament form's hex field defaults to FFFFFF (white) if left
// untouched, and there was no way to go back and fix it afterward short
// of removing and re-adding the whole entry (losing its spools/history).
function onEditFilament(filamentId)
{
    withFreshLibrary(lib =>
    {
        const f = lib.filaments.find(x => x.id === filamentId);

        if (!f)
            return;

        const material = window.prompt("Material:", f.material);
        if (material === null || !material.trim())
            return;

        const color = window.prompt("Color name:", f.color);
        if (color === null || !color.trim())
            return;

        const colorHexInput = window.prompt("Color hex (RRGGBB):", f.colorHex);
        if (colorHexInput === null)
            return;

        const colorHex = colorHexInput.replace("#", "").toUpperCase();

        if (!/^[0-9A-F]{6}$/.test(colorHex))
        {
            window.alert("Color hex must be exactly 6 hex digits (e.g. BBBBBB) - not saved.");
            return;
        }

        const brand = window.prompt("Brand (optional):", f.brand || "");
        if (brand === null)
            return;

        f.material = material.trim();
        f.color = color.trim();
        f.colorHex = colorHex;
        f.brand = brand.trim();
    });
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
        const spool = f && f.spools.find(s => s.id === spoolId);

        // Soft-delete (removedAt, not filtered out) - a hard delete here
        // would erase the createdAt this spool has always recorded,
        // losing the "how long did it actually last" answer the moment
        // someone removes a spent spool - exactly the case this was
        // asked for. Still disappears from the active/editable list (see
        // renderFilamentLibrary's spool-list filter) - just not gone.
        if (spool)
            spool.removedAt = new Date().toISOString();
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

        // A correction made after the fact is pointless if deduction
        // already ran (and found no matching filament, since the wrong
        // color never matched anything) and marked this print processed -
        // it would just sit there "fixed" on screen while the spool never
        // actually got charged. Un-mark it so the next poll picks it back
        // up and deducts using the corrected material/color.
        const idx = lib.processedPrints.indexOf(key);

        if (idx !== -1)
            lib.processedPrints.splice(idx, 1);
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

    // Fuzzy color comparison, same threshold as deduction matching - an
    // exact-hex check here created a duplicate whenever a manually-added
    // entry's hex differed slightly from what the AMS reports for the
    // same physical spool (confirmed live: user added PETG Black by hand,
    // the AMS sync then added a second PETG Black next to it).
    const hasCloseEntry = (material, hex) => filamentLibrary.filaments.some(f =>
        f.material.toUpperCase() === material && colorDistance((f.colorHex || "").toUpperCase(), hex) <= 80);

    const missing = detected.filter(t =>
        !hasCloseEntry(t.type.toUpperCase(), t.color.slice(0, 6).toUpperCase()));

    lastAmsSyncKey = syncKey;

    if (missing.length === 0)
        return;

    await loadFilamentLibrary();

    let changed = false;

    missing.forEach(t =>
    {
        const hex = t.color.slice(0, 6).toUpperCase();
        const material = t.type.toUpperCase();

        // Same fuzzy check as the pre-filter above (hasCloseEntry closes
        // over the pre-refresh library, so re-check against the fresh one).
        const alreadyThere = filamentLibrary.filaments.some(f =>
            f.material.toUpperCase() === material && colorDistance((f.colorHex || "").toUpperCase(), hex) <= 80);

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

// Self-heals a confirmed bug: a gcode-verified override correcting a
// print's color to the one actually used could land AFTER an earlier
// (wrong) client-side deduction had already run against Task API's color
// field before it preferred targetColor over sourceColor (see
// printer-task.js) - the correction added its own deductionLog entry but
// never reversed the earlier wrong one, charging TWO different spools for
// what was genuinely one print. Confirmed live:
// "dop_51_5mm_editž__2026-07-28 10:31:43" had deductionLog entries for
// BOTH 0078BF (blue, wrong) and BCBCBC (gray, correct) at 17.96g each,
// for a print that only ever used gray - blue's spool was 17.96g short of
// what it should show. Only touches single-color overrides (a multi-color
// print's several hex entries are legitimate by design, not stale
// duplicates) and only refunds a hex that doesn't fuzzy-match what the
// override says is actually correct.
async function reconcileDeductionLog()
{
    if (!filamentLibraryLoaded)
        return;

    let changed = false;

    for (const [key, log] of Object.entries(filamentLibrary.deductionLog || {}))
    {
        const override = filamentLibrary.historyOverrides[key];

        if (!override || Array.isArray(override.details) || typeof override.colorHex !== "string")
            continue;

        const correctHex = override.colorHex.toUpperCase();

        for (const hex of Object.keys(log))
        {
            if (colorDistance(hex, correctHex) <= COLOR_MATCH_THRESHOLD)
                continue;   // this IS the correct entry (or close enough)

            const grams = log[hex];

            if (!grams)
                continue;

            const material = (override.material || "").toUpperCase();
            const filament = filamentLibrary.filaments
                .filter(f => f.material.toUpperCase() === material)
                .map(f => ({ f, dist: colorDistance(hex, (f.colorHex || "").toUpperCase()) }))
                .sort((a, b) => a.dist - b.dist)
                .find(c => c.dist <= COLOR_MATCH_THRESHOLD)?.f;

            if (filament && filament.spools && filament.spools.length > 0)
            {
                // Refund to whichever active spool currently has the
                // least left - the same one a fresh deduction would draw
                // from, and the most likely one the original wrong
                // deduction actually hit.
                const target = filament.spools
                    .filter(s => !s.removedAt)
                    .sort((a, b) => a.remaining - b.remaining)[0];

                if (target)
                    target.remaining += grams;
            }

            delete log[hex];
            changed = true;
        }
    }

    if (!changed)
        return;

    renderFilamentLibrary();
    renderTodayTotals();
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
        //
        // Multi-color gcode-verified override: each detail already has
        // its own weight (cross-verified against the live AMS before
        // print_watch.py ever pushed it - see that script's own
        // comments), so this deducts each one directly, same as trusting
        // matchedTask.amsDetail below but from a source that's actually
        // been checked rather than blindly trusted.
        const details = override
            ? (Array.isArray(override.details)
                ? override.details.filter(d => typeof d.weight === "number")
                    .map(d => ({ color: d.colorHex, type: d.material, weight: d.weight }))
                : (typeof override.weight === "number"
                    ? [{ color: override.colorHex, type: override.material, weight: override.weight }]
                    : (matchedTask ? [{ color: override.colorHex, type: override.material, weight: matchedTask.weight }] : [])))
            : (matchedTask ? matchedTask.amsDetail : []);

        if (details.length === 0)
            return;   // Task API hasn't surfaced this print yet - retry on a later poll

        // Only mark this print fully processed if EVERY detail found a
        // spool to deduct from - a partial failure (confirmed live: a
        // multi-color print where one color matched and another silently
        // didn't) used to get marked processed anyway, permanently losing
        // that portion of the deduction with no retry. Now it's retried on
        // the next poll instead, until every color succeeds.
        let allMatched = true;

        details.forEach(d =>
        {
            const hex = (d.color || "").slice(0, 6).toUpperCase();
            const material = (d.type || "").toUpperCase();

            // Closest color within the same material, not an exact hex
            // match - see colorDistance()'s comment for why an exact match
            // silently drops deductions for colors Task API reports
            // approximately (confirmed live: black as "000000" vs the
            // library's real "161616").
            const filament = filamentLibrary.filaments
                .filter(f => f.material.toUpperCase() === material)
                .map(f => ({ f, dist: colorDistance(hex, (f.colorHex || "").toUpperCase()) }))
                .sort((a, b) => a.dist - b.dist)
                .find(c => c.dist <= COLOR_MATCH_THRESHOLD)?.f;

            if (!filament || !filament.spools || filament.spools.length === 0)
            {
                allMatched = false;
                return;
            }

            // Draw down whichever spool has the least left first - mirrors
            // finishing an already-opened spool before starting a fresh one.
            // Must exclude removed (soft-deleted) spools - confirmed live:
            // a removed spool with leftover "remaining" still had the
            // lowest value of the bunch, so it kept getting silently
            // picked as the deduction target over the actual active spool
            // the user had just loaded, invisibly draining a spool that
            // was supposed to be retired instead of the one really in use.
            const target = filament.spools
                .filter(s => s.remaining > 0 && !s.removedAt)
                .sort((a, b) => a.remaining - b.remaining)[0];

            if (!target)
            {
                allMatched = false;
                return;
            }

            // Deduct only what hasn't already been taken for this print+
            // color - see deductionLog's declaration comment for the
            // double-deduction this prevents when a print gets
            // re-processed after a gcode correction.
            const log = filamentLibrary.deductionLog[key] || (filamentLibrary.deductionLog[key] = {});
            const already = log[hex] || 0;
            const delta = d.weight - already;

            if (delta > 0)
            {
                target.remaining = Math.max(0, target.remaining - delta);
                log[hex] = already + delta;
                changed = true;
            }
        });

        if (allMatched)
        {
            filamentLibrary.processedPrints.push(key);
            changed = true;
        }
    });

    if (!changed)
        return;

    if (filamentLibrary.processedPrints.length > 200)
        filamentLibrary.processedPrints = filamentLibrary.processedPrints.slice(-200);

    // Prune deductionLog alongside - but ONLY entries that are neither
    // marked processed nor still present in the device's live history
    // (a partially-deducted print awaiting retry is in the log without
    // being in processedPrints - deleting its row would forget what was
    // already taken and re-deduct it in full on the next poll).
    const liveKeys = new Set(items.map(it => `${it.name}__${it.start}`));

    for (const logKey of Object.keys(filamentLibrary.deductionLog))
    {
        if (!filamentLibrary.processedPrints.includes(logKey) && !liveKeys.has(logKey))
            delete filamentLibrary.deductionLog[logKey];
    }

    renderFilamentLibrary();
    renderTodayTotals();
    await saveFilamentLibrary();
}

loadFilamentLibrary().then(reconcileDeductionLog);

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

        // Confirmed live: the hex field's own FFFFFF default got left
        // untouched when adding a filament that wasn't actually white,
        // silently storing the wrong color - which then never fuzzy-
        // matches Bambu's real reported color, so it never deducts, ever,
        // for that filament. A real "White" is a legitimate choice too,
        // so this confirms rather than blocks outright.
        if (colorHex === "FFFFFF" && !/white/i.test(color))
        {
            const proceed = window.confirm(
                `Color hex is FFFFFF (white), but the color name is "${color}" - ` +
                "did you forget to set the actual hex? Click Cancel to go back and fix it, " +
                "or OK to save it as white anyway.");

            if (!proceed)
                return;
        }

        // Same fuzzy duplicate check already used for AMS auto-sync (see
        // syncAmsToLibrary's own hasCloseEntry) - that path was protected,
        // this manual form wasn't, so a same-material/near-identical-color
        // entry could be added twice with no warning at all. Two entries
        // this close would also make automatic deduction's "closest match"
        // logic pick between them inconsistently.
        const existingClose = filamentLibrary.filaments.find(f =>
            f.material.toUpperCase() === material.toUpperCase() &&
            colorDistance((f.colorHex || "").toUpperCase(), colorHex) <= 80);

        if (existingClose)
        {
            const proceed = window.confirm(
                `A similar ${existingClose.material} filament already exists: "${existingClose.color}" ` +
                `(#${existingClose.colorHex}). Add this as a separate entry anyway, or did you mean ` +
                "to use \"New spool\" on the existing one instead? Click Cancel to go back.");

            if (!proceed)
                return;
        }

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

// Tasmota smart-plug telemetry, relayed onto this subtopic by the master
// project (which polls the plug's own local HTTP status - see master's
// config.h for why the plug can't publish here directly itself).
const POWER_TOPIC = `${BROKER_CONFIG.topic}/power`;

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

    client.subscribe(POWER_TOPIC, (err) =>
    {
        if (err)
            connectionLog(`Power topic subscribe failed: ${err.message}`);
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
    if (topic === POWER_TOPIC)
    {
        try
        {
            updatePower(JSON.parse(payload.toString()));
        }
        catch (err)
        {
            connectionLog(`Bad payload on power topic: ${err.message}`);
        }

        return;
    }

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

const TABS = ["room", "printer", "power"];

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

    // The chart canvas reads getBoundingClientRect() to size itself, which
    // returns 0x0 while its tab is hidden - redraw once the Power tab
    // actually becomes visible so it picks up its real size. Also refresh
    // the History card here rather than on an interval - it only changes
    // hourly (see power_watch.py), so "whenever you open the tab" is
    // plenty fresh.
    if (name === "power")
    {
        schedulePowerChartDraw();
        loadPowerHistoryCard();
    }
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
    //
    // But this was previously unconditional - firing the same disruptive
    // teardown+reconnect on every single visibility change, even ones
    // where a message had arrived a second or two earlier (confirmed live:
    // "0s since last message" logged right before a forced reconnect).
    // That's not a backgrounded-tab recovery, it's just churn - and on
    // mobile, where the OS suspends/resumes background tabs frequently,
    // it produced exactly the rapid-fire reconnect clusters seen in the
    // Connection Log. Only force it when there's actual evidence of
    // staleness (same threshold as the periodic watchdog); a connection
    // that was fine a few seconds ago doesn't need tearing down.
    if (silentFor === null || silentFor > STALE_AFTER_MS / 1000)
    {
        setDot("brokerDot", false);
        client.end(true, {}, () => client.reconnect());
    }
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

const powerToggleBtn = byId("powerToggleBtn");

if (powerToggleBtn)
{
    powerToggleBtn.addEventListener("click", async () =>
    {
        // Always send the opposite of the last REPORTED state (not just
        // flip a locally-tracked flag), so this stays correct even if the
        // plug was switched by hand since the last poll.
        const nextState = lastRelayState === "ON" ? "Off" : "On";

        let confirmMsg = `Turn the plug ${nextState.toUpperCase()}?`;

        if (nextState === "Off" && printerIsRunning)
            confirmMsg = "A print is currently RUNNING - turning the plug off will cut power to the printer immediately and ruin the print. Are you sure?";

        if (!window.confirm(confirmMsg))
            return;

        const resultEl = byId("powerToggleResult");

        powerToggleBtn.disabled = true;
        resultEl.textContent = "Publishing command...";

        try
        {
            const res = await fetch("/api/trigger-power", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ state: nextState }),
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
            // The button's label ("Turn ON"/"Turn OFF") only actually
            // flips once the device's next poll reports the new
            // relayState back through updatePower() - powerClientSetState
            // forces that poll to happen right away rather than waiting
            // out the normal interval, so this is a ~1s wait in practice.
            powerToggleBtn.disabled = false;
        }
    });
}

