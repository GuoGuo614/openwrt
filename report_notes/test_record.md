# 联调与测试流程

本文档覆盖从 OpenWrt 环境验证到防火墙规则生效的全部测试步骤。
每条测试包含：命令、预期结果、截图建议。

> **关于 IP 地址说明**：
> - 虚拟机测试：后端监听 `0.0.0.0:8080`，在 VM 上用 `wget http://127.0.0.1:8080` 测试接口；浏览器通过 VirtualBox 端口转发（8080→8080）访问 `http://127.0.0.1:8080`。
> - 真实路由器测试：后端监听 `0.0.0.0:8080`，在路由器上用 `wget http://127.0.0.1:8080` 测试接口；电脑浏览器直接访问 `http://192.168.10.1:8080`（路由器 LAN IP）。
> - 以下命令中 `127.0.0.1:8080` 均指在后端所在机器上本地测试，两种场景通用。

---

## 一、OpenWrt 网络连通性测试

### 1.1 虚拟机基础检查

```bash
# 查看 IP 和网卡状态
ip addr
ip route
```

**预期**：br-lan 有 IP（如 10.0.2.15），路由表有 default gateway。

**截图**：`ip addr` 和 `ip route` 输出。

### 1.2 外网连通性

```bash
ping -c 4 openwrt.org
ping -c 4 8.8.8.8
```

**预期**：4 个包全部收到回复，延迟 < 100ms。

**截图**：ping 结果，显示 0% packet loss。

### 1.3 DNS 解析

```bash
nslookup example.com 2>/dev/null || ping -c 1 example.com | head -1
```

**预期**：能解析出 IP 地址。

---

## 二、C 流量监控程序测试

### 2.1 程序可执行性

```bash
ls -l /root/openwrt/traffic_monitor
file /root/openwrt/traffic_monitor
```

**预期**：文件有 x 权限，类型为 ELF 64-bit。

### 2.2 命令行运行

```bash
/root/openwrt/traffic_monitor br-lan
```

**预期**：终端全屏刷新，显示类似：

```
OpenWrt libpcap traffic monitor
Interface: br-lan | flows: 2 | time: 1781413147
JSON output: /tmp/traffic_stats.json

Source          Destination     Proto     Packets      Total          Peak        Avg-2s
...
```

**截图**：运行中的终端仪表盘全屏截图。

### 2.3 产生测试流量

另开一个 SSH 会话：

```bash
ping -c 10 openwrt.org &
ping -c 10 8.8.8.8 &
```

观察流量监控器终端，确认新增了 ICMP 流，统计数据在变化。

---

## 三、JSON 文件生成测试

### 3.1 文件存在性

```bash
ls -la /tmp/traffic_stats.json
```

**预期**：文件存在，大小 > 0，修改时间每秒更新。

### 3.2 JSON 格式验证

```bash
cat /tmp/traffic_stats.json | head -c 200
```

**预期**：合法的 JSON，包含 `ok`、`timestamp`、`interface`、`flow_count`、`flows` 字段。

```json
{
  "ok": true,
  "timestamp": 1781413147,
  "interface": "br-lan",
  "flow_count": 2,
  "flows": [
    {
      "src_ip": "10.0.2.15",
      "dst_ip": "8.8.8.8",
      "protocol": "ICMP",
      ...
    }
  ]
}
```

**截图**：`cat /tmp/traffic_stats.json` 输出（格式化后更佳）。

### 3.3 原子写入验证

```bash
# 连续快速读取 10 次，不应出现截断或格式错误
for i in $(seq 1 10); do
  python3 -c "import json; json.load(open('/tmp/traffic_stats.json'))" && echo "OK $i" || echo "FAIL $i"
done
```

**预期**：10 次全部 OK，无 JSON 解析错误。

**截图**：10 行 OK 的输出。

---

## 四、后端 /api/traffic 接口测试

### 4.1 后端启动

```bash
cd /root/openwrt/backend && python3 app.py
```

**预期**：输出监听信息和数据源路径。

### 4.2 健康检查

```bash
wget -O- http://127.0.0.1:8080/api
```

**预期**：返回 JSON，列出全部可用接口，防火墙接口标注"已实现"。

### 4.3 流量接口（正常数据）

```bash
wget -O- http://127.0.0.1:8080/api/traffic
```

**预期**：返回完整 JSON 流量数据，与 `cat /tmp/traffic_stats.json` 内容一致。

**截图**：wget 输出，格式化展示 JSON。

### 4.4 流量接口（文件不存在）

```bash
# 停掉 C 程序后删除 JSON 测试
rm -f /tmp/traffic_stats.json
wget -O- http://127.0.0.1:8080/api/traffic
```

**预期**：

```json
{"ok": false, "error": "流量数据文件不存在: /tmp/traffic_stats.json。请确认 traffic_monitor 程序是否正在运行。"}
```

**截图**：错误信息响应。

### 4.5 恢复 C 程序

```bash
/root/openwrt/traffic_monitor br-lan &
```

---

## 五、前端流量监控展示测试

### 5.1 页面访问

浏览器打开 `http://127.0.0.1:8080/`（虚拟机场景需 VirtualBox 端口转发；真实路由器浏览器访问 `http://192.168.10.1:8080`）。

**预期**：页面正常加载，顶部导航栏显示"流量监控"和"防火墙配置"两个标签，默认在流量监控页。

**截图**：完整页面截图（浏览器窗口）。

### 5.2 表格实时刷新

观察表格 10 秒以上。

**预期**：
- 右上角状态栏显示"已更新 HH:MM:SS"每秒变化
- 表格行数据持续更新

**截图**：带时间戳的表格截图。

### 5.3 折线图展示

产生测试流量后再观察：

```bash
ping -c 5 openwrt.org
```

**预期**：
- 发送速率图出现 ICMP 流量突起
- 接收速率图出现对应的回应突起

**截图**：发送和接收两张折线图，标注流量突起对应 ping 操作。

### 5.4 连接失败处理

停掉后端（Ctrl+C），刷新页面。

**预期**：状态栏显示红色"连接失败"，页面不崩溃。

**截图**：错误状态截图。

---

## 六、防火墙 CRUD 测试

### 6.1 新增规则（API）

```bash
wget -O- --header='Content-Type: application/json' \
  --post-data='{"protocol":"tcp","src_ip":"0.0.0.0/0","dst_ip":"93.184.216.34","port":80,"action":"reject"}' \
  http://127.0.0.1:8080/api/firewall/add
```

**预期**：

```json
{"ok": true, "data": {"message": "规则添加成功", "stdout": "执行: iptables ...\n规则添加成功"}}
```

**截图**：终端 wget 输出。

### 6.2 查看规则（API）

```bash
wget -O- http://127.0.0.1:8080/api/firewall/list
```

**预期**：返回规则列表文本，包含编号 1 的 REJECT 规则。

**截图**：规则列表输出。

### 6.3 前端新增规则

浏览器 → 防火墙配置标签页 → 填写表单 → 点"新增规则"。

**预期**：状态栏显示"规则添加成功"，表格自动刷新显示新规则。

**截图**：表单填写状态 + 添加后的表格。

### 6.4 前端查看规则

点"查看规则"按钮。

**预期**：表格显示所有实验规则，每行含编号、包数、流量、目标（REJECT/ACCEPT/DROP）、协议、详情、删除按钮。

**截图**：完整的规则列表表格。

### 6.5 前端删除规则

点某行的"删除"按钮。

**预期**：该行消失，状态栏显示"规则 X 已删除"。

### 6.6 前端清空规则

点"清空规则" → 确认弹窗 → 确定。

**预期**：所有规则清空，表格显示"暂无实验规则"。

**截图**：清空前后的对比截图。

---

## 七、防火墙规则生效验证

### 7.1 规则生效——TCP 被拦截

```bash
# 1. 确认目标可达
wget -O- http://example.com
# 应返回 HTML 内容

# 2. 加拦截规则（先 ping 确认当时 IP）
ping -c 1 example.com | head -1
# 假设 IP 为 93.184.216.34（非 CDN 时）或当前解析 IP

# 通过 API 或脚本添加
wget -O- --header='Content-Type: application/json' \
  --post-data='{"protocol":"tcp","src_ip":"0.0.0.0/0","dst_ip":"93.184.216.34","port":80,"action":"reject"}' \
  http://127.0.0.1:8080/api/firewall/add

# 3. 再次访问——应被拦截
wget -O- http://example.com
# 预期：Connection refused 或长时间等待后失败
```

**截图**：三步对比（通 → 被拦 → 恢复），三张终端截图并排。

### 7.2 非目标协议不受影响

```bash
# 规则只拦 TCP 80，不影响 ICMP
ping -c 4 example.com
```

**预期**：ping 正常，0% loss。证明规则精确匹配了协议和端口。

**截图**：ping 成功 + 防火墙规则列表同框。

### 7.3 清空后恢复

```bash
# 通过 API 清空
wget -O- --header='Content-Type: application/json' \
  --post-data='{}' \
  http://127.0.0.1:8080/api/firewall/clear

# 或脚本清空
/root/openwrt/scripts/firewall.sh clear

# 验证恢复
wget -O- http://example.com
# 预期：恢复访问，能下载到 HTML
```

**截图**：清空操作 + 恢复访问成功。

### 7.4 参数校验验证

```bash
# 非法协议应被拒绝
wget -O- --header='Content-Type: application/json' \
  --post-data='{"protocol":"evil","src_ip":"0.0.0.0/0","dst_ip":"8.8.8.8","port":80,"action":"drop"}' \
  http://127.0.0.1:8080/api/firewall/add
```

**预期**：

```json
{"ok": false, "error": "参数校验失败: 非法协议: evil（允许: tcp, udp, icmp, all）"}
```

**截图**：错误响应，标注校验成功拦截。

---

## 八、常见错误及排查

| 现象 | 可能原因 | 排查命令 |
|------|----------|----------|
| 后端启动失败 `Address already in use` | 旧进程未退出 | `ps \| grep python; kill -9 <PID>` |
| `/api/traffic` 返回文件不存在 | C 程序没跑或路径不对 | `ls -la /tmp/traffic_stats.json` |
| `pcap_open_live failed` | 网卡名错误 | `ip link` 查看可用接口 |
| 防火墙规则不生效 | 本机流量走 OUTPUT 非 FORWARD | `iptables -L OUTPUT -n` 确认有 lab_rules 跳转 |
| wget 始终被拒无法恢复 | 规则残留 | `iptables -F lab_rules` 手动清 |
| 前端页面打不开 | 端口转发未配或后端未启 | `wget -O- http://127.0.0.1:8080/` 在 VM 上先测 |
| 折线图无数据 | Chart.js CDN 在 OpenWrt 上无法加载 | 检查浏览器控制台 Network 面板 |
| opkg update 失败 | DNS 或网关未配 | `ping 8.8.8.8; cat /etc/config/network` |
| overlay 空间不足 | 磁盘太小 | `df -h` 查看；扩容或清理 |

---

## 九、最终验收清单

测试前逐项打勾确认：

- [ ] OpenWrt 可以 ping 通外网 IP
- [ ] OpenWrt 可以 DNS 解析域名
- [ ] Windows 可通过 SSH 连接 OpenWrt
- [ ] traffic_monitor 可编译/可执行
- [ ] 终端仪表盘每秒刷新，显示流量统计
- [ ] `/tmp/traffic_stats.json` 每秒更新，JSON 格式合法
- [ ] `GET /api/traffic` 返回完整 JSON
- [ ] 流量文件不存在时返回 503 + 中文错误信息
- [ ] 浏览器打开前端页面，表格每秒刷新
- [ ] 发送速率图和接收速率图有流量波动
- [ ] `POST /api/firewall/add` 可新增规则
- [ ] `GET /api/firewall/list` 可查看规则列表
- [ ] `POST /api/firewall/delete` 可删除指定规则
- [ ] `POST /api/firewall/clear` 可清空所有规则
- [ ] 非法防火墙参数被后端拒绝（400 + 错误提示）
- [ ] 防火墙规则添加后 wget 被拦截
- [ ] 防火墙规则清空后 wget 恢复
- [ ] 非目标协议（如 ICMP）不受防火墙规则影响
- [ ] 前端防火墙页面可新增/查看/删除/清空
- [ ] README.md 说明完整
- [ ] ai_prompts.md 记录完整

---
