# OpenWrt 网络应用实验

本项目为实验二：基于 OpenWrt 的网络应用程序开发。

项目包含一个基于 C/libpcap 的流量监控器、一个轻量级 HTTP 后端、一个 Web 前端、
防火墙管理脚本，以及用于 AI 辅助开发记录的实验笔记。

## 目录结构

```text
.
├── traffic_monitor/        # C/libpcap 流量监控器
├── backend/                # HTTP API 服务
├── frontend/               # 流量监控与防火墙模块的 Web 界面
├── scripts/                # OpenWrt 防火墙规则脚本
└── report_notes/           # AI 提示词、环境配置记录、测试记录、截图
```

## 各模块说明

### traffic_monitor

在 OpenWrt 网络接口上捕获数据包，解析 IP 流量，计算流（flow）统计数据，
在命令行中打印实时输出，并将 JSON 数据写入 `/tmp/traffic_stats.json`。

### backend

为前端提供 HTTP API：

- `GET /api/traffic`：从 `/tmp/traffic_stats.json` 读取流量统计数据。
- `POST /api/firewall/add`：新增一条防火墙规则。
- `GET /api/firewall/list`：列出实验相关的防火墙规则。
- `POST /api/firewall/delete`：删除一条规则。
- `POST /api/firewall/clear`：清空实验相关的防火墙规则。

### frontend

展示流量统计数据，并提供防火墙规则配置页面。

### scripts

包含后端调用的 shell 脚本，用于在 OpenWrt 上管理防火墙规则。

### report_notes

存放实验过程记录和 AI 交互记录，供实验报告使用。

## 建议开发顺序

1. 完成 OpenWrt 虚拟机的网络和 SSH 配置。
2. 实现并测试命令行 C 流量监控器。
3. 为流量监控器添加 JSON 输出。
4. 实现后端流量 API。
5. 实现流量监控 Web 页面。
6. 实现防火墙 shell 脚本。
7. 实现防火墙后端 API。
8. 实现防火墙 Web 页面。
9. 编写 README、实验报告笔记和演示视频脚本。

## 前端仪表盘说明

### 访问地址

```
http://192.168.10.1:8080
```

> ⚠ 不要访问 `http://127.0.0.1:8080`，那是电脑本机，不是路由器。

页面标题：**OpenWrt 监控中心**，副标题：**网络流量监控与防火墙管理平台**。

### 页面模块

| 模块 | 说明 | 数据来源 |
|------|------|----------|
| 全局状态栏 | 系统状态、监控接口、后端地址、当前时间、数据状态 | 前端生成 |
| 统计卡片 | 活跃流数、总速率、活跃主机数、历史峰值 | `/api/traffic` |
| 发送速率图 | 本机发出的 Top 5 流，最近 5 分钟趋势 | `/api/traffic` + Chart.js |
| 接收速率图 | 发往本机的 Top 5 流，最近 5 分钟趋势 | `/api/traffic` + Chart.js |
| 活跃主机排行 | 按累计流量 Top 5，附进度条 | `/api/traffic` 前端聚合 |
| 实时连接记录 | 全部流的详细表格 | `/api/traffic` |
| 防火墙管理 | 新增/查看/删除/清空规则 + 动作说明 | `/api/firewall/*` |
| 执行结果 | 深色终端风格输出区域 | POST 接口返回 |
| 操作记录 | 最近 10 条防火墙操作（localStorage） | 前端存储 |
| 快捷操作 | 刷新流量、查看规则、清空规则、重连后端 | 调用已有 API |

所有前端请求均使用相对路径（`/api/...`），因此适配任意路由器 LAN IP，无需修改代码。

### Chart.js 依赖

图表使用 Chart.js 4.4.0，优先加载本地 `vendor/chart.umd.min.js`。如果本地文件不存在，自动回退到 CDN（jsdelivr）。如果部署环境无法访问外网 CDN，请提前下载：

```sh
cd frontend/vendor
wget https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
```

---

## 构建与运行

### 活跃主机排行过滤说明

192.168.10.1 是路由器网关地址，天然会产生较多管理、后端、DNS/DHCP 和转发相关流量，如果不加过滤会占据活跃主机排行首位，干扰终端主机活跃度的判断。

为此前端实现了"防污染过滤"：

- **默认排除**：路由器网关（192.168.10.1）、空地址（0.0.0.0）、广播地址（255.255.255.255）、组播地址（224.0.0.0/4、239.0.0.0/8）。
- **仅影响展示层**：过滤只作用于活跃主机排行和主机数量统计卡片，**不影响** C 程序抓包、`/tmp/traffic_stats.json` 原始数据、实时连接记录表。
- **可切换开关**：页面提供"排除系统地址"复选框，关闭后可查看包含网关的完整主机排行。开关状态保存在浏览器 localStorage 中，刷新不丢失。

---

### 虚拟机环境（开发测试）

C 模块：

```sh
cd traffic_monitor
make
./traffic_monitor br-lan
```

后端：

```sh
cd backend
python3 app.py
```

前端：直接打开 `frontend/index.html`，或通过后端服务托管。

---

## 真实路由器部署（CMCC RAX3000Me / ImmortalWrt）

### 路由器环境

| 项目 | 值 |
|------|-----|
| 系统 | ImmortalWrt 23.05.3 |
| Target | mediatek/filogic |
| 架构 | aarch64_cortex-a53 |
| LAN IP 示例 | 192.168.10.1 |

### 安装依赖

```sh
ssh root@192.168.10.1
opkg update
opkg install python3
opkg install libpcap   # 如果失败，尝试 libpcap1
```

### 上传项目

```powershell
# 在电脑上执行（PowerShell）
# 创建目录结构
ssh root@192.168.10.1 "mkdir -p /root/openwrt/traffic_monitor /root/openwrt/backend /root/openwrt/frontend/js /root/openwrt/frontend/css /root/openwrt/frontend/vendor /root/openwrt/scripts /root/openwrt/report_notes"

# 上传文件
scp -O .\traffic_monitor\traffic_monitor root@192.168.10.1:/root/openwrt/traffic_monitor/
scp -O .\backend\*.py root@192.168.10.1:/root/openwrt/backend/
scp -O .\frontend\index.html root@192.168.10.1:/root/openwrt/frontend/
scp -O .\frontend\css\style.css root@192.168.10.1:/root/openwrt/frontend/css/
scp -O .\frontend\js\traffic.js root@192.168.10.1:/root/openwrt/frontend/js/
scp -O .\frontend\js\firewall.js root@192.168.10.1:/root/openwrt/frontend/js/
scp -O .\frontend\vendor\chart.umd.min.js root@192.168.10.1:/root/openwrt/frontend/vendor/
scp -O .\scripts\firewall.sh root@192.168.10.1:/root/openwrt/scripts/
```

### 启动 C 流量监控程序

```sh
ssh root@192.168.10.1
cd /root/openwrt/traffic_monitor
chmod +x traffic_monitor
./traffic_monitor br-lan
```

> ⚠️ C 程序必须是 aarch64 版本。x86 版本会报 Exec format error。交叉编译方法见 traffic_monitor/Makefile。

### 启动后端

另开一个 SSH 会话：

```sh
ssh root@192.168.10.1
cd /root/openwrt/backend
python3 app.py
```

或者从项目根目录启动也一样：

```sh
ssh root@192.168.10.1
cd /root/openwrt
python3 backend/app.py
```

### 防火墙脚本权限

```sh
chmod +x /root/openwrt/scripts/firewall.sh
```

### 电脑浏览器访问

```
http://192.168.10.1:8080/
```

> ⚠️ 不要访问 `http://127.0.0.1:8080/`，那个是电脑自己，不是路由器。

### 环境变量（可选）

后端支持通过环境变量覆盖默认配置：

```sh
export LAB_PORT=9090
export TRAFFIC_STATS_PATH=/tmp/my_traffic.json
export STATIC_DIR=/root/openwrt/frontend
python3 app.py
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LAB_HOST` | `0.0.0.0` | 监听地址 |
| `LAB_PORT` | `8080` | 监听端口 |
| `TRAFFIC_STATS_PATH` | `/tmp/traffic_stats.json` | 流量数据文件 |
| `STATIC_DIR` | 自动解析 | 前端文件目录 |
| `FIREWALL_SCRIPT_PATH` | 自动解析 | 防火墙脚本路径 |

### 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| 浏览器访问 127.0.0.1 不对 | 那是电脑自己 | 用 `http://192.168.10.1:8080` |
| Exec format error | C 程序不是 aarch64 | 交叉编译 ARM64 版本 |
| `/tmp/traffic_stats.json` 不存在 | C 程序未启动 | 先启动 `traffic_monitor` |
| 防火墙脚本 Permission denied | 缺少执行权限 | `chmod +x firewall.sh` |
| 折线图不显示 | 浏览器无法加载 Chart.js | 确认 `vendor/chart.umd.min.js` 已上传 |
| 后端启动报端口占用 | 旧进程未退出 | `killall python3` 后重试 |
| Python3 未安装 | 系统无 Python | `opkg update && opkg install python3` |
