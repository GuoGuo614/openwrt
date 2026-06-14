/**
 * 流量监控前端逻辑
 *
 * 功能：
 * - 每秒通过 GET /api/traffic 轮询后端
 * - 表格展示各流的详细统计数据
 * - 发送速率图：Top 5 本机发出的流
 * - 接收速率图：Top 5 发往本机的流
 * - 各保留 300 个采样点（5 分钟），X 轴自动压缩
 * - 自动识别本机 IP，过滤 SSH 网关背景流量
 */

// ==================== DOM 元素 ====================

const trafficTab = document.getElementById("trafficTab");
const firewallTab = document.getElementById("firewallTab");
const trafficView = document.getElementById("trafficView");
const firewallView = document.getElementById("firewallView");
const trafficStatus = document.getElementById("trafficStatus");
const trafficTableBody = document.getElementById("trafficTableBody");
const sendCanvas = document.getElementById("sendChart");
const recvCanvas = document.getElementById("recvChart");

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

// ==================== 折线图 ====================

const CHART_MAX_POINTS = 300;
const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#7c3aed"];
const MAX_LINES = 5;

/** 在图表中隐藏涉及这些 IP 的流 */
const CHART_HIDDEN_IPS = ["10.0.2.2"];

/** 每条流的历史：{ [flowLabel]: [{time, rate}, ...] } */
const sendHistory = {};
const recvHistory = {};

let sendChart = null;
let recvChart = null;

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
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 14,
            usePointStyle: true, font: { size: 10 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatBytes(ctx.parsed.y)}/s`,
          },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: { maxTicksLimit: 8, color: "#94a3b8", font: { size: 10 } },
          grid: { color: "#f1f5f9" },
        },
        y: {
          display: true,
          title: { display: true, text: title, color: "#64748b" },
          ticks: {
            color: "#94a3b8", font: { size: 10 },
            callback: (val) => formatBytes(val) + "/s",
          },
          grid: { color: "#f1f5f9" },
        },
      },
    },
  });
}

function initCharts() {
  sendChart = createRateChart(sendCanvas, "发送速率");
  recvChart = createRateChart(recvCanvas, "接收速率");
}

/** 自动识别本机 IP */
function detectLocalIP(flows) {
  const counts = {};
  for (const f of flows) {
    if (!f.src_ip || CHART_HIDDEN_IPS.includes(f.src_ip)) continue;
    counts[f.src_ip] = (counts[f.src_ip] || 0) + 1;
  }
  let best = null, bestCount = 0;
  for (const [ip, c] of Object.entries(counts)) {
    if (c > bestCount) { bestCount = c; best = ip; }
  }
  return best;
}

/** 更新一张图表 */
function updateOneChart(chart, historyMap, topLabels, colors) {
  if (!chart) return;

  // 清理已不在 Top N 中的流的历史
  for (const label of Object.keys(historyMap)) {
    if (!topLabels.includes(label)) delete historyMap[label];
  }

  // 取时间轴（用第一条流的历史）
  const ref = historyMap[topLabels[0]] || [];
  const labels = ref.map((p) => p.time);

  const datasets = topLabels.map((label, i) => {
    const hist = historyMap[label] || [];
    const data = labels.map((_, idx) => (hist[idx] ? hist[idx].rate : null));
    return {
      label,
      data,
      borderColor: colors[i % colors.length],
      backgroundColor: "transparent",
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
      spanGaps: true,
    };
  });

  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update("none");
}

/** 更新两张图表 */
function updateCharts(flows) {
  const activeFlows = Array.isArray(flows) ? flows : [];

  const visible = activeFlows.filter(
    (f) =>
      !CHART_HIDDEN_IPS.includes(f.src_ip) &&
      !CHART_HIDDEN_IPS.includes(f.dst_ip)
  );

  const localIP = detectLocalIP(visible);
  const now = formatTime();

  // 分流：发送（本机→外部）、接收（外部→本机）
  const sendFlows = visible.filter((f) => f.src_ip === localIP && f.dst_ip !== localIP);
  const recvFlows = visible.filter((f) => f.dst_ip === localIP && f.src_ip !== localIP);

  // 排序取 Top N
  const topSend = sendFlows
    .sort((a, b) => (Number(b.avg_2s_bps) || 0) - (Number(a.avg_2s_bps) || 0))
    .slice(0, MAX_LINES);
  const topRecv = recvFlows
    .sort((a, b) => (Number(b.avg_2s_bps) || 0) - (Number(a.avg_2s_bps) || 0))
    .slice(0, MAX_LINES);

  // 追加数据点
  for (const flows of [topSend, topRecv]) {
    for (const f of flows) {
      const label = flowLabel(f);
      const map = (f.src_ip === localIP) ? sendHistory : recvHistory;
      if (!map[label]) map[label] = [];
      map[label].push({ time: now, rate: Number(f.avg_2s_bps) || 0 });
      while (map[label].length > CHART_MAX_POINTS) map[label].shift();
    }
  }

  const sendLabels = topSend.map(flowLabel);
  const recvLabels = topRecv.map(flowLabel);

  updateOneChart(sendChart, sendHistory, sendLabels, CHART_COLORS);
  updateOneChart(recvChart, recvHistory, recvLabels, CHART_COLORS);
}

// ==================== 表格渲染 ====================

function renderTable(flows) {
  if (!Array.isArray(flows) || flows.length === 0) {
    trafficTableBody.innerHTML = '<tr><td colspan="8">暂无数据</td></tr>';
    return;
  }

  trafficTableBody.innerHTML = flows.map((flow) => `
    <tr>
      <td>${flow.src_ip || "-"}</td>
      <td>${flow.dst_ip || "-"}</td>
      <td>${flow.protocol || "-"}</td>
      <td>${formatBytes(flow.total_bytes)}</td>
      <td>${formatBytes(flow.peak_bps)}/s</td>
      <td>${formatBytes(flow.avg_2s_bps)}/s</td>
      <td>${formatBytes(flow.avg_10s_bps)}/s</td>
      <td>${formatBytes(flow.avg_40s_bps)}/s</td>
    </tr>
  `).join("");
}

// ==================== 数据获取 ====================

async function fetchTraffic() {
  try {
    const response = await fetch("/api/traffic");
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const flows = payload.data?.flows || [];
    renderTable(flows);
    updateCharts(flows);
    trafficStatus.textContent = `已更新 ${formatTime()}`;
    trafficStatus.className = "";
  } catch (error) {
    trafficStatus.textContent = `连接失败：${error.message}`;
    trafficStatus.className = "error";
  }
}

// ==================== 初始化 ====================

initCharts();
fetchTraffic();
setInterval(fetchTraffic, 1000);
