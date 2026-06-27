/**
 * 防火墙配置前端逻辑
 *
 * 功能：
 * - 新增规则（POST /api/firewall/add）
 * - 查看规则（GET  /api/firewall/list）
 * - 删除规则（POST /api/firewall/delete）
 * - 清空规则（POST /api/firewall/clear）
 * - 展示执行结果、规则列表和错误信息
 * - localStorage 操作记录（最近 10 条）
 */

// ==================== DOM 元素 ====================

const firewallForm = document.getElementById("firewallForm");
const listRulesBtn = document.getElementById("listRulesBtn");
const clearRulesBtn = document.getElementById("clearRulesBtn");
const firewallStatus = document.getElementById("firewallStatus");
const firewallOutput = document.getElementById("firewallOutput");
const rulesTableBody = document.getElementById("rulesTableBody");
const opLog = document.getElementById("opLog");

// ==================== 工具函数 ====================

function setStatus(text, isError) {
  firewallStatus.textContent = text;
  firewallStatus.className = "card-head-status" + (isError ? " error" : "");
}

function setOutput(text) {
  firewallOutput.textContent = text;
}

// ==================== 操作记录（localStorage） ====================

const OP_LOG_KEY = "openwrt_firewall_log";
const OP_LOG_MAX = 10;

function loadOpLog() {
  try {
    return JSON.parse(localStorage.getItem(OP_LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOpLog(entries) {
  try {
    localStorage.setItem(OP_LOG_KEY, JSON.stringify(entries.slice(0, OP_LOG_MAX)));
  } catch { /* 静默忽略 */ }
}

function addOpLog(type, summary, success) {
  const entries = loadOpLog();
  entries.unshift({
    type,
    time: new Date().toLocaleTimeString(),
    summary,
    status: success ? "ok" : "fail",
  });
  while (entries.length > OP_LOG_MAX) entries.pop();
  saveOpLog(entries);
  renderOpLog(entries);
}

function renderOpLog(entries) {
  if (!opLog) return;
  if (entries.length === 0) {
    opLog.innerHTML = '<p class="empty-hint">暂无操作记录</p>';
    return;
  }
  opLog.innerHTML = entries
    .map(
      (e) => `
    <div class="op-item">
      <span class="op-type ${e.type}">${e.type}</span>
      <span class="op-time">${e.time}</span>
      <span class="op-summary">${e.summary}</span>
      <span class="op-status ${e.status}">${e.status === "ok" ? "成功" : "失败"}</span>
    </div>`
    )
    .join("");
}

// 启动时渲染已有记录
renderOpLog(loadOpLog());

// ==================== iptables 输出解析 ====================

function parseRules(stdout) {
  const lines = stdout.split("\n");
  const rules = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Chain") || trimmed.startsWith("num") || trimmed.startsWith("target")) {
      inHeader = trimmed.startsWith("Chain") || trimmed.startsWith("num");
      continue;
    }
    if (inHeader) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    rules.push({
      num: parts[0],
      pkts: parts[1],
      bytes: parts[2],
      target: parts[3],
      proto: parts[4],
      extra: parts.slice(5).join(" "),
    });
  }
  return rules;
}

function renderRules(stdout) {
  const rules = parseRules(stdout);
  if (rules.length === 0) {
    rulesTableBody.innerHTML = '<tr><td colspan="7">暂无实验规则</td></tr>';
    return rules;
  }
  rulesTableBody.innerHTML = rules
    .map(
      (r) => `
    <tr>
      <td>${r.num}</td>
      <td>${r.pkts}</td>
      <td>${r.bytes}</td>
      <td class="target-${r.target.toLowerCase()}">${r.target}</td>
      <td>${r.proto}</td>
      <td class="extra-cell">${r.extra}</td>
      <td><button class="btn-sm danger" data-rule="${r.num}">删除</button></td>
    </tr>`
    )
    .join("");
  for (const btn of rulesTableBody.querySelectorAll("[data-rule]")) {
    btn.addEventListener("click", () => deleteRule(btn.dataset.rule));
  }
  return rules;
}

// ==================== API 调用 ====================

async function addRule(formData) {
  setStatus("正在提交规则...", false);
  const payload = Object.fromEntries(formData.entries());

  try {
    const resp = await fetch("/api/firewall/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    setStatus("规则添加成功", false);
    setOutput(data.data?.stdout || "已添加");
    addOpLog("新增", `${payload.protocol} ${payload.src_ip}→${payload.dst_ip}:${payload.port} ${payload.action}`, true);
    await fetchRules();
  } catch (err) {
    setStatus(`添加失败：${err.message}`, true);
    setOutput(err.message);
    addOpLog("新增", `${payload.protocol} ${payload.dst_ip}:${payload.port}`, false);
  }
}

async function fetchRules() {
  setStatus("正在获取规则列表...", false);
  try {
    const resp = await fetch("/api/firewall/list");
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const stdout = data.data?.stdout || "";
    const rules = renderRules(stdout);
    setStatus(`共 ${rules.length} 条规则`, false);
    setOutput(stdout);
    addOpLog("查看", `${rules.length} 条规则`, true);
  } catch (err) {
    setStatus(`获取失败：${err.message}`, true);
    setOutput(err.message);
    rulesTableBody.innerHTML = '<tr><td colspan="7">获取规则列表失败</td></tr>';
    addOpLog("查看", "", false);
  }
}

async function deleteRule(num) {
  setStatus(`正在删除规则 ${num}...`, false);
  try {
    const resp = await fetch("/api/firewall/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_number: Number(num) }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    setStatus(`规则 ${num} 已删除`, false);
    setOutput(data.data?.stdout || "已删除");
    addOpLog("删除", `规则 ${num}`, true);
    await fetchRules();
  } catch (err) {
    setStatus(`删除失败：${err.message}`, true);
    setOutput(err.message);
    addOpLog("删除", `规则 ${num}`, false);
  }
}

async function clearRules() {
  if (!confirm("确定要清空所有实验防火墙规则吗？")) return;
  setStatus("正在清空规则...", false);
  try {
    const resp = await fetch("/api/firewall/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    setStatus("规则已清空", false);
    setOutput(data.data?.stdout || "已清空");
    rulesTableBody.innerHTML = '<tr><td colspan="7">暂无实验规则</td></tr>';
    addOpLog("清空", "所有规则", true);
  } catch (err) {
    setStatus(`清空失败：${err.message}`, true);
    setOutput(err.message);
    addOpLog("清空", "", false);
  }
}

// ==================== 事件绑定 ====================

firewallForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addRule(new FormData(firewallForm));
});

listRulesBtn.addEventListener("click", fetchRules);
clearRulesBtn.addEventListener("click", clearRules);
