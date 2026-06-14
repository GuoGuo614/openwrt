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

## 构建与运行

各模块的详细命令将在实现过程中逐步补充。

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
