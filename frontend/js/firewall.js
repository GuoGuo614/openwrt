const firewallForm = document.getElementById("firewallForm");
const firewallStatus = document.getElementById("firewallStatus");
const firewallOutput = document.getElementById("firewallOutput");

firewallForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(firewallForm);
  const payload = Object.fromEntries(formData.entries());

  firewallStatus.textContent = "正在提交规则";
  firewallOutput.textContent = JSON.stringify(payload, null, 2);

  // The real API call will be enabled after backend firewall APIs are implemented.
  // await fetch("/api/firewall/add", { method: "POST", body: JSON.stringify(payload) });
  firewallStatus.textContent = "前端骨架已生成，等待后端防火墙接口实现";
});

