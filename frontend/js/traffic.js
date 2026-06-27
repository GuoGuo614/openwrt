/**
 * 流量监控前端逻辑
 *
 * 功能：
 * - 每秒通过 GET /api/traffic 轮询后端
 * - 全局状态栏：系统状态、监控接口、后端地址、当前时间、数据状态
 * - 统计卡片：活跃流数、总速率、活跃主机数、历史峰值
 * - 发送速率图 / 接收速率图（各 300 采样点）
 * - 活跃主机排行 Top 5（按累计流量）
 * - 实时连接表格
 * - 快捷操作按钮
 */

// ==================== DOM 元素 ====================

const trafficTab = document.getElementById("trafficTab");
const firewallTab = document.getElementById("firewallTab");
const trafficView = document.getElementById("trafficView");
const firewallView = document.getElementById("firewallView");

// 状态栏
const sysStatus = document.getElementById("sysStatus");
const sysOrigin = document.getElementById("sysOrigin");
const sysClock = document.getElementById("sysClock");
const sysDataStatus = document.getElementById("sysDataStatus");

// 统计卡片
const statFlowCount = document.getElementById("statFlowCount");
const statTotalRate = document.getElementById("statTotalRate");
const statHostCount = document.getElementById("statHostCount");
const statPeakRate = document.getElementById("statPeakRate");

// 图表
const sendCanvas = document.getElementById("sendChart");
const recvCanvas = document.getElementById("recvChart");

// 排行
const hostRanking = document.getElementById("hostRanking");

// 表格
const trafficStatus = document.getElementById("trafficStatus");
const trafficTableBody = document.getElementById("trafficTableBody");

// 快捷操作
const btnRefreshTraffic = document.getElementById("btnRefreshTraffic");
const btnViewRules = document.getElementById("btnViewRules");
const btnClearRules = document.getElementById("btnClearRules");
const btnReconnect = document.getElementById("btnReconnect");

// ==================== 标签页切换 ====================

function switchView(name) {
  const showTraffic = name === "traffic";
  trafficTab.classList.toggle("active", showTraffic);
  firewallTab.classList.toggle("active", !showTraffic);
  trafficView.classList.toggle("active", showTraffic);
  firewallView.classList.toggle("active", !showTraffic);
}

trafficTab.addEventListener("click", () => switchView("traffic"));
firewallTab.addEventListener("click", () => switchView("firewall"));

// ==================== 工具函数 ====================

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime() {
  return new Date().toLocaleTimeString();
}

function flowLabel(f) {
  return `${f.src_ip || "?"} → ${f.dst_ip || "?"} (${f.protocol || "?"})`;
}

// ==================== IP 过滤 ====================

/** 默认排除的系统地址（路由器网关、空地址、广播） */
const DEFAULT_EXCLUDED_IPS = ["192.168.10.1", "0.0.0.0", "255.255.255.255"];

/** 组播地址范围 */
function isMulticastIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  if (isNaN(first)) return false;
  // 224.0.0.0/4 和 239.0.0.0/8
  return first >= 224 && first <= 239;
}

/** 规范化 IP 字符串 */
function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return null;
  const trimmed = ip.trim();
  if (!trimmed || trimmed === "-" || trimmed === "unknown" || trimmed === "?" || trimmed === "0") return null;
  // 必须是 IPv4 格式
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * 判断 IP 是否应被过滤
 * @param {string} ip 已通过 normalizeIp() 规范化
 * @param {string[]} extraList 额外排除列表
 */
function isExcludedHost(ip, extraList) {
  if (!ip) return true;
  if (isMulticastIp(ip)) return true;
  if (DEFAULT_EXCLUDED_IPS.includes(ip)) return true;
  if (extraList && extraList.includes(ip)) return true;
  return false;
}

/** 过滤开关状态（localStorage 持久化） */
function getExcludeEnabled() {
  try {
    const v = localStorage.getItem("trafficDashboard.excludeSystemHosts");
    return v !== null ? v === "true" : true; // 默认开启
  } catch { return true; }
}

function setExcludeEnabled(val) {
  try {
    localStorage.setItem("trafficDashboard.excludeSystemHosts", String(val));
  } catch { /* 静默 */ }
}

// ==================== 全局状态栏 ====================

function initStatusBar() {
  sysOrigin.textContent = window.location.origin || "-";
  sysStatus.textContent = "● 运行中";
  sysStatus.className = "status-value ok";
}

function updateClock() {
  sysClock.textContent = formatTime();
}

setInterval(updateClock, 1000);

// ==================== 折线图 ====================

const CHART_MAX_POINTS = 300;
const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#7c3aed"];
const MAX_LINES = 5;
const CHART_HIDDEN_IPS = [];

const sendHistory = {};
const recvHistory = {};

let sendChart = null;
let recvChart = null;
/** 全局最大峰值速率 */
let globalPeakBps = 0;

function createRateChart(canvas, title) {
  if (!canvas) return null;
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 14, usePointStyle: true, font: { size: 10 } } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatBytes(ctx.parsed.y)}/s` } },
      },
      scales: {
        x: { display: true, ticks: { maxTicksLimit: 8, color: "#94a3b8", font: { size: 10 } }, grid: { color: "#f1f5f9" } },
        y: { display: true, title: { display: true, text: title, color: "#64748b" }, ticks: { color: "#94a3b8", font: { size: 10 }, callback: (val) => formatBytes(val) + "/s" }, grid: { color: "#f1f5f9" } },
      },
    },
  });
}

function initCharts() {
  sendChart = createRateChart(sendCanvas, "发送速率");
  recvChart = createRateChart(recvCanvas, "接收速率");
}

function detectLocalIP(flows) {
  const counts = {};
  for (const f of flows) {
    if (!f.src_ip) continue;
    counts[f.src_ip] = (counts[f.src_ip] || 0) + 1;
  }
  let best = null, bestCount = 0;
  for (const [ip, c] of Object.entries(counts)) {
    if (c > bestCount) { bestCount = c; best = ip; }
  }
  return best;
}

function updateOneChart(chart, historyMap, topLabels, colors) {
  if (!chart) return;
  for (const label of Object.keys(historyMap)) {
    if (!topLabels.includes(label)) delete historyMap[label];
  }
  const ref = historyMap[topLabels[0]] || [];
  const labels = ref.map((p) => p.time);
  const datasets = topLabels.map((label, i) => {
    const hist = historyMap[label] || [];
    const data = labels.map((_, idx) => (hist[idx] ? hist[idx].rate : null));
    return { label, data, borderColor: colors[i % colors.length], backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false, spanGaps: true };
  });
  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update("none");
}

function updateCharts(flows) {
  const activeFlows = Array.isArray(flows) ? flows : [];
  const visible = activeFlows.filter((f) => !CHART_HIDDEN_IPS.includes(f.src_ip) && !CHART_HIDDEN_IPS.includes(f.dst_ip));
  const localIP = detectLocalIP(visible);
  const now = formatTime();

  const sendFlows = visible.filter((f) => f.src_ip === localIP && f.dst_ip !== localIP);
  const recvFlows = visible.filter((f) => f.dst_ip === localIP && f.src_ip !== localIP);

  const topSend = sendFlows.sort((a, b) => (Number(b.avg_2s_bps) || 0) - (Number(a.avg_2s_bps) || 0)).slice(0, MAX_LINES);
  const topRecv = recvFlows.sort((a, b) => (Number(b.avg_2s_bps) || 0) - (Number(a.avg_2s_bps) || 0)).slice(0, MAX_LINES);

  for (const flowList of [topSend, topRecv]) {
    for (const f of flowList) {
      const label = flowLabel(f);
      const map = (f.src_ip === localIP) ? sendHistory : recvHistory;
      if (!map[label]) map[label] = [];
      map[label].push({ time: now, rate: Number(f.avg_2s_bps) || 0 });
      while (map[label].length > CHART_MAX_POINTS) map[label].shift();
    }
  }

  updateOneChart(sendChart, sendHistory, topSend.map(flowLabel), CHART_COLORS);
  updateOneChart(recvChart, recvHistory, topRecv.map(flowLabel), CHART_COLORS);
}

// ==================== 活跃主机排行 ====================

function updateHostRanking(flows) {
  if (!Array.isArray(flows) || flows.length === 0) {
    hostRanking.innerHTML = '<p class="empty-hint">暂无流量数据</p>';
    return { terminal: 0, total: 0 };
  }

  const excludeEnabled = getExcludeEnabled();
  const localIP = detectLocalIP(flows);
  const hostBytesAll = {};   // 未过滤，全部主机
  const hostBytesFiltered = {};  // 过滤后，仅终端主机

  for (const f of flows) {
    const ip = f.src_ip === localIP ? f.dst_ip : f.src_ip;
    const normalized = normalizeIp(ip);
    if (!normalized) continue;
    if (normalized === localIP) continue; // 跳过本机自身
    const bytes = Number(f.total_bytes || f.bytes || 0);

    hostBytesAll[normalized] = (hostBytesAll[normalized] || 0) + bytes;
    if (!isExcludedHost(normalized)) {
      hostBytesFiltered[normalized] = (hostBytesFiltered[normalized] || 0) + bytes;
    }
  }

  // 选择用哪个数据源
  const source = excludeEnabled ? hostBytesFiltered : hostBytesAll;

  const sorted = Object.entries(source)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    hostRanking.innerHTML = '<p class="empty-hint">暂无终端主机流量数据</p>';
    return { terminal: 0, total: Object.keys(hostBytesAll).length };
  }

  const maxBytes = sorted[0][1] || 1;
  const rankClasses = ["r1", "r2", "r3", "", ""];

  hostRanking.innerHTML = sorted
    .map(
      ([ip, bytes], i) => `
      <div class="host-item">
        <span class="host-rank ${rankClasses[i]}">${i + 1}</span>
        <span class="host-ip">${ip}</span>
        <span class="host-bytes">${formatBytes(bytes)}</span>
        <span class="host-bar-wrap"><span class="host-bar" style="width:${Math.round((bytes / maxBytes) * 100)}%"></span></span>
      </div>`
    )
    .join("");

  return {
    terminal: Object.keys(hostBytesFiltered).length,
    total: Object.keys(hostBytesAll).length,
  };
}

// ==================== 表格渲染 ====================

function renderTable(flows) {
  if (!Array.isArray(flows) || flows.length === 0) {
    trafficTableBody.innerHTML = '<tr><td colspan="8">暂无数据</td></tr>';
    return;
  }
  trafficTableBody.innerHTML = flows
    .map(
      (flow) => `
    <tr>
      <td>${flow.src_ip || "-"}</td>
      <td>${flow.dst_ip || "-"}</td>
      <td>${flow.protocol || "-"}</td>
      <td>${formatBytes(flow.total_bytes)}</td>
      <td>${formatBytes(flow.peak_bps)}/s</td>
      <td>${formatBytes(flow.avg_2s_bps)}/s</td>
      <td>${formatBytes(flow.avg_10s_bps)}/s</td>
      <td>${formatBytes(flow.avg_40s_bps)}/s</td>
    </tr>`
    )
    .join("");
}

// ==================== 统计卡片 ====================

function updateStatCards(flows) {
  const arr = Array.isArray(flows) ? flows : [];
  statFlowCount.textContent = arr.length;

  const totalRate = arr.reduce((s, f) => s + (Number(f.avg_2s_bps) || 0), 0);
  statTotalRate.textContent = formatBytes(totalRate) + "/s";

  // 活跃主机数（根据开关决定是否过滤）
  const excludeEnabled = getExcludeEnabled();
  const hosts = new Set();
  const localIP = detectLocalIP(arr);
  for (const f of arr) {
    const src = normalizeIp(f.src_ip || f.src || "");
    const dst = normalizeIp(f.dst_ip || f.dst || f.dst_ip || "");
    if (src && src !== localIP && (!excludeEnabled || !isExcludedHost(src))) hosts.add(src);
    if (dst && dst !== localIP && (!excludeEnabled || !isExcludedHost(dst))) hosts.add(dst);
  }
  statHostCount.textContent = hosts.size;

  const peakBps = arr.reduce((m, f) => Math.max(m, Number(f.peak_bps) || 0), 0);
  if (peakBps > globalPeakBps) globalPeakBps = peakBps;
  statPeakRate.textContent = formatBytes(globalPeakBps) + "/s";
}

// ==================== 数据获取 ====================

async function fetchTraffic() {
  try {
    const resp = await fetch("/api/traffic");
    const payload = await resp.json();
    if (!resp.ok || !payload.ok) throw new Error(payload.error || `HTTP ${resp.status}`);

    const flows = payload.data?.flows || [];
    renderTable(flows);
    updateCharts(flows);
    updateStatCards(flows);
    updateHostRanking(flows);

    trafficStatus.textContent = "数据更新正常";
    trafficStatus.className = "card-head-status";
    sysDataStatus.textContent = "连接正常";
    sysDataStatus.className = "status-value ok";
  } catch (err) {
    trafficStatus.textContent = `连接失败：${err.message}`;
    trafficStatus.className = "card-head-status error";
    sysDataStatus.textContent = "连接失败";
    sysDataStatus.className = "status-value error";
  }
}

// ==================== 快捷操作 ====================

btnRefreshTraffic.addEventListener("click", () => {
  fetchTraffic();
});

btnViewRules.addEventListener("click", () => {
  switchView("firewall");
  // 触发防火墙页面的查看规则
  if (typeof fetchRules === "function") fetchRules();
});

btnClearRules.addEventListener("click", () => {
  if (typeof clearRules === "function") clearRules();
});

btnReconnect.addEventListener("click", () => {
  sysDataStatus.textContent = "重新连接中...";
  sysDataStatus.className = "status-value warn";
  fetchTraffic();
});

// ==================== 初始化 ====================

// ==================== 过滤开关 ====================

const chkExcludeSystem = document.getElementById("chkExcludeSystem");
if (chkExcludeSystem) {
  chkExcludeSystem.checked = getExcludeEnabled();
  chkExcludeSystem.addEventListener("change", () => {
    setExcludeEnabled(chkExcludeSystem.checked);
    fetchTraffic();
  });
}

// ==================== 初始化 ====================

initStatusBar();
updateClock();
initCharts();
fetchTraffic();
setInterval(fetchTraffic, 1000);
