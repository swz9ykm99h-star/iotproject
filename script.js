// ============================================================
// INDUSTRIAL IOT DASHBOARD CONTROLLER (THINGSPEAK + DEMO MODE)
// ============================================================

const THINGSPEAK_CHANNEL_ID = 3492290;
const THINGSPEAK_READ_API_KEY = "HRK2QZJZILK4NRXD";
const RESULTS_COUNT = 20;
const REFRESH_INTERVAL = 20000;

// UI Elements
const tempVal = document.getElementById("tempVal");
const tempPill = document.getElementById("tempPill");
const tempBar = document.getElementById("tempBar");

const humVal = document.getElementById("humVal");
const humPill = document.getElementById("humPill");
const humBar = document.getElementById("humBar");

const vibVal = document.getElementById("vibVal");
const vibPill = document.getElementById("vibPill");
const vibText = document.getElementById("vibText");
const vibLed = document.getElementById("vibLed");

const irVal = document.getElementById("irVal");
const irPill = document.getElementById("irPill");
const irText = document.getElementById("irText");

const machDot = document.getElementById("machDot");
const machState = document.getElementById("machState");
const mTemp = document.getElementById("mTemp");
const mHum = document.getElementById("mHum");
const mVib = document.getElementById("mVib");
const mIr = document.getElementById("mIr");

const anomalyBanner = document.getElementById("anomalyBanner");
const anomalyText = document.getElementById("anomalyText");
const acknowledgeBtn = document.getElementById("acknowledgeBtn");

const connectionDot = document.getElementById("connectionDot");
const connectionText = document.getElementById("connectionText");
const clock = document.getElementById("clock");
const tableBody = document.getElementById("tableBody");
const alertList = document.getElementById("alertList");
const chartCanvas = document.getElementById("liveChart");
const chartTabs = document.querySelectorAll(".tab-btn");
const demoToggle = document.getElementById("demoToggle");
const audioToggle = document.getElementById("audioToggle");
const audioStatusText = document.getElementById("audioStatusText");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");
const navItems = document.querySelectorAll(".nav-item");

let isDemoMode = false;
let soundEnabled = false;
let alertAcknowledged = false;
let liveChart = null;
let currentChartKey = "temperature";

let history = {
    temperature: [],
    humidity: [],
    vibration: [],
    ir: [],
    timestamps: [],
    rawFeeds: []
};

// Sidebar Toggle on Mobile
if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });
}

// Navigation Scrolling
navItems.forEach(item => {
    item.addEventListener("click", function() {
        navItems.forEach(n => n.classList.remove("active"));
        this.classList.add("active");

        const targetId = this.getAttribute("data-target");
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
        }
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.remove("open");
        }
    });
});

// Acknowledge Button
if (acknowledgeBtn) {
    acknowledgeBtn.addEventListener("click", () => {
        alertAcknowledged = true;
        anomalyBanner.style.display = "none";
    });
}

// Audio Buzzer API
function playAlarmTone() {
    if (!soundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        console.warn("Audio Context blocked");
    }
}

audioToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    audioStatusText.textContent = soundEnabled ? "Sound On" : "Sound Off";
    audioToggle.classList.toggle("bg-cyan-950", soundEnabled);
    audioToggle.classList.toggle("text-cyan-400", soundEnabled);
    if (soundEnabled) playAlarmTone();
});

demoToggle.addEventListener("change", (e) => {
    isDemoMode = e.target.checked;
    if (isDemoMode) {
        connectionText.textContent = "Simulation Mode Active";
        connectionDot.classList.remove("blink");
        generateMockData();
    } else {
        fetchThingSpeakData();
    }
});

function getThingSpeakURL() {
    return `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=${RESULTS_COUNT}&_=${Date.now()}`;
}

function initializeChart() {
    if (!chartCanvas || typeof Chart === "undefined") return;
    const ctx = chartCanvas.getContext("2d");
    liveChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "Temperature (°C)",
                data: [],
                borderWidth: 2.5,
                borderColor: '#06B6D4',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                tension: 0.35,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#94A3B8' } },
                y: { beginAtZero: false, grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#94A3B8' } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
        }
    });
}

const chartSettings = {
    temperature: { label: "Temperature (°C)", data: () => history.temperature, color: '#06B6D4' },
    humidity: { label: "Humidity (%)", data: () => history.humidity, color: '#3B82F6' },
    vibration: { label: "Vibration State", data: () => history.vibration, color: '#F59E0B' },
    ir: { label: "IR Sensor State", data: () => history.ir, color: '#8B5CF6' }
};

function updateChart(key = currentChartKey) {
    if (!liveChart) return;
    if (!chartSettings[key]) key = "temperature";
    currentChartKey = key;
    const setting = chartSettings[key];

    liveChart.data.labels = history.timestamps;
    liveChart.data.datasets[0].label = setting.label;
    liveChart.data.datasets[0].data = setting.data();
    liveChart.data.datasets[0].borderColor = setting.color;
    liveChart.data.datasets[0].backgroundColor = setting.color + '20';
    liveChart.update("none");
}

function formatTime(timestamp) {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "--" : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateClock() {
    if (clock) clock.textContent = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

function generateMockData() {
    if (!isDemoMode) return;
    const now = new Date();
    const mockFeeds = [];
    
    for (let i = 15; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 5000);
        mockFeeds.push({
            created_at: d.toISOString(),
            field1: (28 + Math.sin(i * 0.5) * 4 + (i === 2 ? 24 : 0)).toFixed(1),
            field2: (55 + Math.cos(i * 0.3) * 8).toFixed(1),
            field3: (i === 3 || i === 12) ? "1" : "0",
            field4: (i === 7) ? "0" : "1"
        });
    }
    processFeedData(mockFeeds);
}

async function fetchThingSpeakData() {
    if (isDemoMode) return;
    try {
        if (connectionText) connectionText.textContent = "Connecting...";
        if (connectionDot) connectionDot.classList.add("blink");

        const response = await fetch(getThingSpeakURL(), { method: "GET", cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        
        if (!data || !Array.isArray(data.feeds) || data.feeds.length === 0) {
            throw new Error("No data available");
        }

        processFeedData(data.feeds);

        if (connectionText) connectionText.textContent = "Connected";
        if (connectionDot) connectionDot.classList.remove("blink");
    } catch (error) {
        console.error("ThingSpeak Error:", error);
        if (connectionText) connectionText.textContent = "Connection Error (Try Demo Mode)";
        if (connectionDot) connectionDot.classList.remove("blink");
    }
}

function processFeedData(feeds) {
    history.temperature = [];
    history.humidity = [];
    history.vibration = [];
    history.ir = [];
    history.timestamps = [];
    history.rawFeeds = feeds;

    feeds.forEach(feed => {
        history.temperature.push(parseFloat(feed.field1));
        history.humidity.push(parseFloat(feed.field2));
        history.vibration.push(parseInt(feed.field3) || 0);
        history.ir.push(parseInt(feed.field4) === 0 ? 0 : 1);
        history.timestamps.push(formatTime(feed.created_at));
    });

    const latest = feeds[feeds.length - 1];
    updateUI(latest);
    updateTable(feeds);
    updateChart(currentChartKey);
}

function updateUI(feed) {
    if (!feed) return;
    const temp = parseFloat(feed.field1);
    const hum = parseFloat(feed.field2);
    const vib = parseInt(feed.field3);
    const ir = parseInt(feed.field4);

    // Temperature update
    tempVal.textContent = !isNaN(temp) ? `${temp.toFixed(1)} °C` : "--.- °C";
    const tempPct = Math.min(Math.max((temp / 80) * 100, 5), 100);
    if (tempBar) tempBar.style.width = `${tempPct}%`;

    if (temp > 50) {
        tempPill.textContent = "HIGH";
        tempPill.className = "status-pill critical text-[10px] px-2.5 py-0.5 rounded-full font-extrabold text-rose-400 bg-rose-950/80 border border-rose-800";
        if (tempBar) tempBar.className = "bg-rose-500 h-full rounded-full transition-all duration-500";
    } else {
        tempPill.textContent = "NORMAL";
        tempPill.className = "status-pill normal text-[10px] px-2.5 py-0.5 rounded-full font-extrabold text-emerald-400 bg-emerald-950/80 border border-emerald-800";
        if (tempBar) tempBar.className = "bg-cyan-500 h-full rounded-full transition-all duration-500";
    }

    // Humidity update
    humVal.textContent = !isNaN(hum) ? `${hum.toFixed(1)} %` : "--.- %";
    if (humBar) humBar.style.width = `${Math.min(Math.max(hum, 5), 100)}%`;

    // Vibration update (SW-420)
    if (vib === 1) {
        vibVal.textContent = "VIBRATION SHOCK";
        vibPill.textContent = "ALERT";
        vibPill.className = "status-pill critical text-[10px] px-2.5 py-0.5 rounded-full font-extrabold text-amber-400 bg-amber-950/80 border border-amber-800";
        vibText.textContent = "High vibration shock registered!";
        vibLed.style.background = "#F59E0B";
        playAlarmTone();
    } else {
        vibVal.textContent = "NORMAL";
        vibPill.textContent = "NORMAL";
        vibPill.className = "status-pill normal text-[10px] px-2.5 py-0.5 rounded-full font-extrabold text-emerald-400 bg-emerald-950/80 border border-emerald-800";
        vibText.textContent = "No vibration detected";
        vibLed.style.background = "#10B981";
    }

    // IR Beam update
    if (ir === 0) {
        irVal.textContent = "OBSTRUCTED";
        irPill.textContent = "DETECTED";
        irPill.className = "status-pill critical text-[10px] px-2.5 py-0.5 rounded-full font-extrabold text-purple-400 bg-purple-950/80 border border-purple-800";
        irText.textContent = "Object/line detected in beam path";
    } else {
        irVal.textContent = "CLEAR";
        irPill.textContent = "NORMAL";
        irPill.className = "status-pill normal text-[10px] px-2.5 py-0.5 rounded-full font-extrabold text-emerald-400 bg-emerald-950/80 border border-emerald-800";
        irText.textContent = "No object detected in beam path";
    }

    // Machine Health & Anomaly Banner
    const isWarning = (vib === 1 || ir === 0 || temp > 50);
    machState.textContent = isWarning ? "WARNING STATE" : "MACHINE NORMAL";
    machState.className = isWarning ? "text-2xl font-black text-rose-400 flex items-center gap-2.5" : "text-2xl font-black text-emerald-400 flex items-center gap-2.5";
    machDot.style.background = isWarning ? "#F43F5E" : "#10B981";
    machDot.className = isWarning ? "inline-block w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50 animate-pulse" : "inline-block w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50";

    if (isWarning && !alertAcknowledged) {
        anomalyBanner.style.display = "flex";
        if (vib === 1) anomalyText.textContent = "SW-420 sensor detected abnormal vibration shock!";
        else if (temp > 50) anomalyText.textContent = "Temperature exceeded safe operational threshold (>50°C)!";
        else anomalyText.textContent = "IR Beam Sensor obstructed!";
        playAlarmTone();
    } else if (!isWarning) {
        anomalyBanner.style.display = "none";
        alertAcknowledged = false;
    }

    mTemp.textContent = !isNaN(temp) ? `${temp.toFixed(1)} °C` : "--";
    mHum.textContent = !isNaN(hum) ? `${hum.toFixed(1)} %` : "--";
    mVib.textContent = vib === 1 ? "SHOCK" : "NORMAL";
    mIr.textContent = ir === 0 ? "OBSTRUCTED" : "CLEAR";

    updateAlerts(temp, hum, vib, ir);
}

function updateAlerts(temp, hum, vib, ir) {
    const alerts = [];
    if (temp > 50) alerts.push("🔴 High Temperature warning (>50°C)");
    if (hum > 85) alerts.push("🟠 Elevated humidity levels detected");
    if (vib === 1) alerts.push("🟠 SW-420 Vibration shock recorded");
    if (ir === 0) alerts.push("🟣 IR Beam obstruction triggered");

    if (alerts.length === 0) {
        alertList.innerHTML = `<div class="text-xs text-slate-400 py-2">🟢 All telemetry parameters nominal.</div>`;
        return;
    }
    alertList.innerHTML = alerts.map(a => `<div class="text-xs text-rose-300 font-medium py-1.5 border-b border-slate-800/50 flex items-center gap-2">${a}</div>`).join("");
}

function updateTable(feeds) {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    [...feeds].reverse().forEach(feed => {
        const temp = parseFloat(feed.field1);
        const hum = parseFloat(feed.field2);
        const vib = parseInt(feed.field3);
        const ir = parseInt(feed.field4);
        const status = (vib === 1 || ir === 0 || temp > 50) ? "ALERT" : "NORMAL";

        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="p-3 text-slate-300">${formatTime(feed.created_at)}</td>
            <td class="p-3 text-slate-300">${isNaN(temp) ? "--" : temp.toFixed(1) + " °C"}</td>
            <td class="p-3 text-slate-300">${isNaN(hum) ? "--" : hum.toFixed(1) + " %"}</td>
            <td class="p-3 font-medium ${vib === 1 ? 'text-amber-400' : 'text-slate-300'}">${vib === 1 ? "SHOCK" : "NORMAL"}</td>
            <td class="p-3 ${ir === 0 ? 'text-purple-400' : 'text-slate-300'}">${ir === 0 ? "OBSTRUCTED" : "CLEAR"}</td>
            <td class="p-3 font-bold ${status === 'ALERT' ? 'text-rose-400' : 'text-emerald-400'}">${status}</td>
        `;
        tableBody.appendChild(row);
    });
}

if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
        if (!history.rawFeeds || history.rawFeeds.length === 0) {
            alert("No data available to export.");
            return;
        }
        let csvContent = "data:text/csv;charset=utf-8,Timestamp,Temperature(C),Humidity(%),Vibration,IR_Sensor\n";
        history.rawFeeds.forEach(f => {
            csvContent += `${f.created_at},${f.field1},${f.field2},${f.field3},${f.field4}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `industrial_iot_data_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

chartTabs.forEach(button => {
    button.addEventListener("click", function() {
        chartTabs.forEach(t => {
            t.classList.remove("active", "bg-cyan-500", "text-slate-950", "border-cyan-500", "font-bold");
            t.classList.add("bg-[#0D1322]", "text-slate-300", "border-slate-800");
        });
        this.classList.add("active", "bg-cyan-500", "text-slate-950", "border-cyan-500", "font-bold");
        this.classList.remove("bg-[#0D1322]", "text-slate-300", "border-slate-800");
        updateChart(this.dataset.key);
    });
});

document.addEventListener("DOMContentLoaded", () => {
    initializeChart();
    fetchThingSpeakData();
    setInterval(() => {
        if (isDemoMode) generateMockData();
        else fetchThingSpeakData();
    }, REFRESH_INTERVAL);
});