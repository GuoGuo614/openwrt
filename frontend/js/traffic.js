const trafficStatus = document.getElementById("trafficStatus");
const trafficTableBody = document.getElementById("trafficTableBody");
const trafficTab = document.getElementById("trafficTab");
const firewallTab = document.getElementById("firewallTab");
const trafficView = document.getElementById("trafficView");
const firewallView = document.getElementById("firewallView");

function switchView(name) {
  const showTraffic = name === "traffic";
  trafficTab.classList.toggle("active", showTraffic);
  firewallTab.classList.toggle("active", !showTraffic);
  trafficView.classList.toggle("active", showTraffic);
  firewallView.classList.toggle("active", !showTraffic);
}

trafficTab.addEventListener("click", () => switchView("traffic"));
firewallTab.addEventListener("click", () => switchView("firewall"));

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderTraffic(flows) {
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

async function fetchTraffic() {
  try {
    const response = await fetch("/api/traffic");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    renderTraffic(payload.data.flows);
    trafficStatus.textContent = `已更新 ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    trafficStatus.textContent = `连接失败：${error.message}`;
  }
}

fetchTraffic();
setInterval(fetchTraffic, 1000);

