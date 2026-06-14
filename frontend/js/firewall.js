/**
 * 防火墙配置前端逻辑
 *
 * 功能：
 * - 新增规则（POST /api/firewall/add）
 * - 查看规则（GET  /api/firewall/list）
 * - 删除规则（POST /api/firewall/delete）
 * - 清空规则（POST /api/firewall/clear）
 * - 展示执行结果、规则列表和错误信息
 */

// ==================== DOM 元素 ====================

const firewallForm = document.getElementById("firewallForm");
const listRulesBtn = document.getElementById("listRulesBtn");
const clearRulesBtn = document.getElementById("clearRulesBtn");
const firewallStatus = document.getElementById("firewallStatus");
const firewallOutput = document.getElementById("firewallOutput");
const rulesTableBody = document.getElementById("rulesTableBody");

// ==================== 工具函数 ====================

function setStatus(text, isError) {
  firewallStatus.textContent = text;
  firewallStatus.className = isError ? "error" : "";
}

function setOutput(text) {
  firewallOutput.textContent = text;
}

/** 解析 iptables 输出，提取规则行 */
function parseRules(stdout) {
  // iptables -L -n -v --line-numbers 输出格式：
  // num  pkts bytes target  prot opt in out source    destination
  // 1    0    0     REJECT  tcp  --  *  *   0.0.0.0/0 8.8.8.8     tcp dpt:80 reject-with icmp-port-unreachable
  const lines = stdout.split("\n");
  const rules = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 跳过标题行和表头
    if (
      trimmed.startsWith("Chain") ||
      trimmed.startsWith("num") ||
      trimmed.startsWith("target")
    ) {
      inHeader = trimmed.startsWith("Chain") || trimmed.startsWith("num");
      continue;
    }

    if (inHeader) continue;

    // 匹配：编号 包数 字节数 目标 协议 opt in out 源 目的 [额外信息]
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;

    rules.push({
      num: parts[0],
      pkts: parts[1],
      bytes: parts[2],
      target: parts[3],
      proto: parts[4],
      // 从第 5 列往后提取源、目的和额外信息
      extra: parts.slice(5).join(" "),
    });
  }

  return rules;
}

function renderRules(stdout) {
  const rules = parseRules(stdout);

  if (rules.length === 0) {
    rulesTableBody.innerHTML =
      '<tr><td colspan="7">暂无实验规则</td></tr>';
    return rules;
  }

  rulesTableBody.innerHTML = rules.map((r) => `
    <tr>
      <td>${r.num}</td>
      <td>${r.pkts}</td>
      <td>${r.bytes}</td>
      <td class="target-${r.target.toLowerCase()}">${r.target}</td>
      <td>${r.proto}</td>
      <td class="extra-cell">${r.extra}</td>
      <td>
        <button class="btn-sm danger" data-rule="${r.num}">删除</button>
      </td>
    </tr>
  `).join("");

  // 绑定删除按钮事件
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

    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    setStatus("规则添加成功", false);
    setOutput(data.data?.stdout || "已添加");
    // 自动刷新列表
    await fetchRules();
  } catch (err) {
    setStatus(`添加失败：${err.message}`, true);
    setOutput(err.message);
  }
}

async function fetchRules() {
  setStatus("正在获取规则列表...", false);

  try {
    const resp = await fetch("/api/firewall/list");
    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    const stdout = data.data?.stdout || "";
    const rules = renderRules(stdout);
    setStatus(`共 ${rules.length} 条规则`, false);
    setOutput(stdout);
  } catch (err) {
    setStatus(`获取失败：${err.message}`, true);
    setOutput(err.message);
    rulesTableBody.innerHTML =
      '<tr><td colspan="7">获取规则列表失败</td></tr>';
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

    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    setStatus(`规则 ${num} 已删除`, false);
    setOutput(data.data?.stdout || "已删除");
    // 自动刷新列表
    await fetchRules();
  } catch (err) {
    setStatus(`删除失败：${err.message}`, true);
    setOutput(err.message);
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

    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    setStatus("规则已清空", false);
    setOutput(data.data?.stdout || "已清空");
    rulesTableBody.innerHTML =
      '<tr><td colspan="7">暂无实验规则</td></tr>';
  } catch (err) {
    setStatus(`清空失败：${err.message}`, true);
    setOutput(err.message);
  }
}

// ==================== 事件绑定 ====================

firewallForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addRule(new FormData(firewallForm));
});

listRulesBtn.addEventListener("click", fetchRules);
clearRulesBtn.addEventListener("click", clearRules);
