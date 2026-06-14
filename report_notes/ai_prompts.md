# AI 提示词记录

## 记录模板

```text
时间：
目的：
提示词：
AI 回复摘要：
采纳内容：
手动修改：
测试结果：
评价：
```

## 记录列表

### 1. 整体技术方案设计

时间：2026-05-19

目的：
根据实验指导书，设计"基于 OpenWrt 的网络应用程序开发"实验的整体技术方案，明确架构、模块划分、开发顺序和验收标准。

提示词：
请根据实验指导书，帮我设计"基于 OpenWrt 的网络应用程序开发"实验的整体技术方案。

实验要求包括：
1. 部署 OpenWrt 虚拟机；
2. 用 C 语言和 libpcap 实现流量监控；
3. 先支持命令行显示流量统计；
4. 再开发 Web 前端和后端接口，实时展示流量；
5. 开发 Web 防火墙配置功能；
6. 后端要校验参数，调用 Shell 脚本新增、查看、删除或清空防火墙规则；
7. 最后需要实验报告、源码 README 和演示视频。

请给我一个适合学生实验实现的目录结构、模块划分、开发顺序和每一步的验收标准。

AI 回复摘要：
AI 给出了完整的分层技术方案，包括以下内容：
- 总体架构：C 程序 → JSON 文件 → 后端 HTTP → 前端 Web；防火墙则走 前端 → 后端校验 → Shell 脚本 → OpenWrt 防火墙。
- 推荐目录结构：在现有基础上新增 docs/ 目录存放 api.md 和 demo_script.md。
- 模块划分：OpenWrt 虚拟机部署、C 流量监控、后端接口、Web 前端、防火墙 Shell 脚本，共 5 个模块。
- 开发顺序：9 步，从 OpenWrt 环境搭建到最终联调和演示准备。
- 每个步骤都有明确的验收标准和建议截图内容。
- 最终验收清单：14 项检查项，覆盖全部实验要求。
- 报告中 AI 使用记录的建议模板和填写方法。

采纳内容：
- 整体架构方案全部采纳。
- 9 步开发顺序全部采纳，与后续 README 中的"建议开发顺序"保持一致。
- 验收标准和验收清单全部采纳，作为后续开发的目标参照。
- JSON 输出格式建议与现有 C 程序输出基本一致，无需修改。

手动修改：
- 暂未新增 docs/ 目录，api.md 和 demo_script.md 留待后续按需创建。
- 方案中后端推荐 Flask，当前采用 Python 标准库 http.server 实现，后续视需要决定是否切换。

测试结果：


评价：
AI 给出的方案非常完整，架构分层清晰，模块职责明确。开发顺序循序渐进，每一步都有可验证的验收标准，非常适合学生实验的节奏。最终验收清单覆盖了指导书全部要求，可以直接作为实验自检的 checklist。方案的实用性强，没有过度设计，建议的 JSON 格式、API 设计、Shell 脚本接口都与后续实际代码兼容。

---

### 2. 项目骨架搭建

时间：2026-05-19

目的：
为 OpenWrt 网络应用实验创建初始项目结构。

提示词：
请帮我创建本实验的项目骨架，要求包含：
1. traffic_monitor/：C 语言 libpcap 流量监控程序；
2. backend/：后端 HTTP 接口；
3. frontend/：Web 页面；
4. scripts/：防火墙规则 Shell 脚本；
5. README.md：项目说明；
6. report_notes/：用于记录 AI 使用过程和实验现象。

请按照适合 OpenWrt 实验提交的结构设计，并说明每个文件的作用。

AI 回复摘要：
AI 在 C:\code\openwrt 下创建了完整的实验项目骨架，并完成了后端 Python 语法检查，通过。各核心文件及作用如下：
- README.md：总项目说明、目录结构、模块职责、开发顺序。
- traffic_monitor/traffic_monitor.c：C/libpcap 流量监控程序入口，此时为骨架代码。
- traffic_monitor/Makefile：C 程序编译脚本。
- backend/app.py：后端 HTTP 服务，已实现 GET /api/traffic 读取 /tmp/traffic_stats.json。
- backend/config.py：后端配置项（流量 JSON 路径、监听端口等）。
- frontend/index.html：Web 页面，包含"流量监控"和"防火墙配置"两个标签页。
- frontend/js/traffic.js：每秒请求 /api/traffic 并刷新流量表格。
- frontend/js/firewall.js：防火墙前端交互骨架。
- scripts/firewall.sh：防火墙脚本统一入口，规划支持 add / list / delete / clear。
- report_notes/ai_prompts.md：AI 使用记录模板。
- report_notes/setup_record.md：OpenWrt 安装和网络配置记录模板。
- report_notes/test_record.md：联调测试记录模板。
- report_notes/screenshots.md：实验报告截图索引模板。
验证结果：python -m py_compile backend\app.py backend\config.py 通过。
AI 建议下一步将 traffic_monitor.c 从骨架扩展为真正的 libpcap 命令行流量监控程序。

采纳内容：
- 全部目录结构和文件均采纳。
- 各模块的职责划分清晰，C 程序负责抓包统计、后端负责 HTTP 接口、前端负责展示、scripts 负责防火墙操作。
- 后端已实现 GET /api/traffic 基础逻辑，前端流量监控页面已接通后端轮询。
- 防火墙相关代码（后端 API + 前端 JS + Shell 脚本）为骨架占位，后续逐步实现。
- Python 语法检查通过，骨架代码无语法错误。

手动修改：
- 所有 README.md 和 report_notes 下的记录模板由英文翻译为中文，保留计算机领域专有名词（如 libpcap、JSON、HTTP、API、SSH 等）。
- 新增 report_notes/start_cmd.md，补充交叉编译命令、scp 文件上传命令、SSH 连接命令和 traffic_monitor 运行示例。

测试结果：
- Python 语法检查：python -m py_compile backend\app.py backend\config.py 通过，无语法错误。
- 后端启动：python3 app.py 可正常监听 0.0.0.0:8080。
- 前端页面：浏览器打开 index.html 可正常渲染，标签页切换正常。
- C 程序此时为骨架代码，尚未编译运行。
- 防火墙模块为占位符，尚未测试。

评价：
AI 生成的项目骨架结构合理、模块边界清晰，直接对应实验指导书的各项要求。每个目录的职责单一明确，文件命名规范。后端入口文件和前端页面在骨架阶段就已经具备了基础交互逻辑（GET /api/traffic + 前端轮询），为后续增量开发提供了良好的起点。不足之处是防火墙相关模块仅有接口框架，需要后续手动补充实现。整体来看，骨架阶段一次性完成了通常需要手动搭建半天的工程结构，大幅提升了开发效率。

---

### 3. 命令行流量监控

时间：2026-05-19

目的：
实现 C 语言 libpcap 命令行流量监控程序，在终端实时显示网络流量统计。

提示词：
请帮我实现一个 C 语言 libpcap 流量监控程序，先在命令行运行。

功能要求：
1. 捕获指定网卡上的 IPv4 数据包；
2. 解析源 IP、目的 IP、协议类型和数据包长度；
3. 按"源 IP -> 目的 IP"统计累计接收/发送流量；
4. 统计最近 2 秒、10 秒、40 秒的平均流量；
5. 统计峰值流量；
6. 每隔 1 秒在终端刷新输出统计结果；
7. 代码要有清晰注释，适合作为实验源码提交。

请给出完整代码、编译命令和运行命令。

AI 回复摘要：
AI 已实现完整的命令行版 libpcap 流量监控程序（traffic_monitor.c，约 470 行），功能包括：
- 捕获指定网卡 IPv4 数据包，使用 BPF 过滤器 "ip" 和以太网数据链路层检查。
- 解析源 IP、目的 IP、协议类型（TCP/UDP/ICMP/OTHER）、IP 包长度。
- 按 源 IP → 目的 IP → 协议 三元组聚合为流（flow），最多 512 个流。
- 统计累计包数（total_packets）、累计流量（total_bytes）、峰值速率（peak_bytes_per_sec）。
- 使用 40 个 1 秒桶的滑动窗口，计算最近 2s / 10s / 40s 平均速率。
- 每 1 秒用 ANSI 转义码全屏刷新终端表格，展示前 30 个流量最大的流。
- 支持 SIGINT/SIGTERM 信号优雅退出，捕获线程安全关闭。
- 编译命令：cd traffic_monitor && make。依赖 libpcap-dev。
- 运行命令：./traffic_monitor br-lan 或 ./traffic_monitor eth0。
- AI 同时更新了 traffic_monitor/README.md 说明文件。
- 验证情况：AI 尝试在 WSL 编译，但 WSL 缺少 pcap.h，apt update 受阻，未完成最终编译验证。代码按 Linux/OpenWrt libpcap API 编写，装好依赖即可 make。

采纳内容：
- 全部 C 代码采纳，traffic_monitor.c 约 470 行，功能完整。
- 按流聚合的设计（src_ip + dst_ip + protocol 三元组）采纳，比原始要求"按源 IP → 目的 IP"更精细，区分了不同协议。
- 滑动窗口历史统计（40 个 1 秒桶）采纳，使 2s/10s/40s 平均速率的计算更准确。
- 终端全屏刷新（ANSI 转义码）和信号优雅退出采纳。
- Makefile 的双模式（原生编译 + OpenWrt SDK 交叉编译）采纳。

手动修改：
- 增加了默认 JSON 输出路径常量 DEFAULT_JSON_PATH，避免硬编码。
- 后续手动新增了 write_json_stats() 函数（原子写入：先写 .tmp 文件再 rename），为第 4 步 JSON 输出做准备。此函数本次提示词未要求，是提前预留的扩展点。
- 代码注释保持 AI 原始英文注释，未做翻译。

测试结果：
- WSL 环境缺少 libpcap-dev，AI 未能完成本机编译验证。
- 后续在 OpenWrt 虚拟机中交叉编译后上传测试：编译通过，运行正常。
- 终端仪表盘每秒刷新，ping / wget 产生流量后表格数据实时变化。
- Ctrl+C 可正常退出，无资源泄漏。

评价：
AI 生成的 C 代码质量很高，超出实验指导书的基本要求。数据结构的抽象合理（FlowKey 三元组 + FlowStat 滑动窗口），多线程设计（捕获线程 + 主线程打印）保证了抓包和显示的并发性。代码注释清晰，函数职责单一，适合作为实验源码。不足之处是 AI 在本机无法完成编译验证，需要在目标环境手动验证；另外按 协议 维度聚合虽更精细，但提示词原意是"源 IP → 目的 IP"两层聚合，实际输出变成了三层，不过这对于实验来说是正向的扩展。

---

### 4. 流量数据 JSON 输出

时间：2026-05-19

目的：
在命令行流量监控程序基础上增加 JSON 文件输出功能，为后端 API 提供数据源。

提示词：
请在已有 C 语言流量监控程序基础上增加 JSON 输出功能。

要求：
1. 程序持续捕获流量；
2. 每隔 1 秒把统计结果写入一个 JSON 文件，例如 /tmp/traffic_stats.json；
3. JSON 中包含源 IP、目的 IP、协议、累计流量、峰值、2 秒/10 秒/40 秒平均速率；
4. 写文件时避免前端或后端读取到半截 JSON；
5. 保留命令行输出，方便调试；
6. 给出修改后的完整代码和说明。

AI 回复摘要：
AI 在 traffic_monitor.c 中新增了 write_json_stats() 函数，并更新了主循环。关键设计：
- JSON 输出字段：ok、timestamp、interface、flow_count、flows 数组（含 src_ip、dst_ip、protocol、protocol_number、total_packets、total_bytes、peak_bps、avg_2s_bps、avg_10s_bps、avg_40s_bps）。
- 原子写入方案：先写 /tmp/traffic_stats.json.tmp.<pid> → fsync 确保落盘 → rename 到最终路径。rename 在同一文件系统内是原子操作，后端不会读到半截文件。
- 主循环每 1 秒同时执行 print_stats()（终端输出）和 write_json_stats()（JSON 输出），两套输出独立运作、互不影响。
- 更新了 traffic_monitor/README.md，补充 JSON 相关说明和验证命令。
- 验证结果：make openwrt 交叉编译通过，生成 x86-64 ELF 文件（musl 链接）。提醒 OpenWrt 上需 opkg install libpcap。

采纳内容：
- write_json_stats() 全部采纳，JSON 字段设计与后端接口预期完全一致。
- 原子写入方案（tmp + fsync + rename）采纳，保证了读写并发安全。
- 主循环双输出架构采纳。
- JSON 格式在后续步骤中作为后端 /api/traffic 的数据契约，未再修改。

手动修改：
- 无实质性代码修改。原子写入逻辑在 AI 生成时已正确处理 fflush、fsync、fclose、rename 的完整错误处理链。
- traffic_monitor/README.md 为英文原文，后续手动翻译为中文。

测试结果：
- OpenWrt SDK 交叉编译通过，生成 traffic_monitor 可执行文件（ELF 64-bit x86-64, musl）。
- 上传至 OpenWrt 虚拟机后运行 ./traffic_monitor br-lan，/tmp/traffic_stats.json 每秒更新。
- cat /tmp/traffic_stats.json 验证 JSON 格式合法，timestamp 和流量数值持续变化。
- 在 JSON 写入同时用 cat 重复读取，未出现截断或格式错误。
- 终端命令行输出和 JSON 输出同步进行，互不影响。

评价：
AI 在已有代码基础上新增 JSON 输出功能的方案非常合理，没有重写已有逻辑，而是在主循环中并行调用 write_json_stats()，改动最小化。原子写入方案（tmp + fsync + rename）是标准做法，错误处理覆盖了 fopen、fflush、fsync、fclose、rename 所有环节，体现了一定的工程素养。JSON 结构与前端表格列一一对应，数据契约明确，为后续后端开发提供了清晰的接口规范。

---

### 5. 后端 HTTP 服务（流量接口）

时间：2026-06-14

目的：
开发后端 HTTP 服务，读取 C 程序生成的流量统计 JSON 文件并通过 API 提供给前端。

提示词：
请帮我开发后端 HTTP 服务，用于读取 C 程序生成的流量统计 JSON 文件，并提供接口给前端。

要求：
1. 提供 GET /api/traffic 接口；
2. 读取 /tmp/traffic_stats.json；
3. 返回 JSON 数据；
4. 如果文件不存在或格式错误，要返回清晰的错误信息；
5. 后端代码要尽量轻量，适合 OpenWrt 或实验环境运行；
6. 请给出代码、启动命令和接口测试命令。

AI 回复摘要：
AI 基于项目骨架阶段已有的 backend/app.py 进行了增强重构，主要改动：
- 代码结构优化：提取 _send_json()、_ok()、_error() 三个工具方法，消除重复代码，接口实现更简洁。
- 新增 CORS 支持：所有响应带 Access-Control-Allow-Origin: *，前端无论从 file:// 还是不同端口访问都能正常请求。
- 新增健康检查端点 GET /：返回服务名称、版本号、全部可用接口列表。
- 新增 OPTIONS 预检处理：支持浏览器跨域预检请求。
- 错误处理细化：文件不存在（503）、JSON 格式错误（503）、未知路由（404），每种错误都有中文提示和解决建议。
- 响应格式统一：成功 {"ok": true, "data": ...}，失败 {"ok": false, "error": "..."}。
- 技术选型：仅使用 Python 标准库 http.server + json + os，无需 pip 安装任何依赖，适合 OpenWrt 环境。
启动命令：cd backend && python3 app.py。
测试命令：curl http://127.0.0.1:8080/（健康检查）、curl http://127.0.0.1:8080/api/traffic（流量数据）。

采纳内容：
- 全部代码采纳。增强后的 app.py 约 100 行，config.py 约 10 行。
- CORS 支持和健康检查端点采纳，前端开发时无需额外配置。
- 错误响应格式采纳，前端可以统一按 {"ok": ..., "error": ...} 模式处理。
- 纯标准库方案采纳，OpenWrt 上无需 pip install。

手动修改：
- 无。AI 一次性给出完整代码，语法检查直接通过。
- 后续根据测试情况可能会调整防火墙接口路由结构，不影响当前 traffic 接口。

测试结果：
- Python 语法检查：python -m py_compile app.py config.py 通过。
- GET /：curl 测试通过，返回 JSON 服务信息。
- GET /api/traffic（有文件）：curl 测试通过，正确返回流量 JSON 数据。
- GET /api/traffic（文件不存在）：返回 503 + "流量数据文件不存在: /tmp/traffic_stats.json。请确认 traffic_monitor 程序是否正在运行。"。
- GET /api/traffic（JSON 格式错误）：返回 503 + JSON 解析失败详细信息。
- GET /api/unknown（未知路由）：返回 404 + "未找到接口: /api/unknown"。
- Windows 本机测试时发现 /tmp 路径在 Python 和 bash 间映射不一致（Python 解析为 C:\tmp，bash 映射到 Windows Temp 目录），这是环境差异，代码部署到 OpenWrt 后完全正常。

评价：
AI 的增强方案在保持原有骨架简洁性的前提下，补充了完整的工程化细节。CORS 和健康检查虽不是指导书明确要求的功能，但对于实际联调非常有价值。错误提示信息用中文撰写且附带解决建议，对学生实验调试友好。纯标准库的选型决策正确，避免了在 OpenWrt 上安装 pip 包的额外复杂度。代码结构清晰，三个工具方法（_send_json/_ok/_error）形成了很好的复用模式，后续新增防火墙接口时可以直接调用。

---

### 6. 流量监控前端页面开发

时间：2026-06-14

目的：
开发流量监控 Web 前端页面，通过折线图和表格实时展示 C 程序捕获的网络流量数据。

提示词：
请帮我开发流量监控 Web 前端页面。

要求：
1. 页面通过 GET /api/traffic 每秒请求一次后端接口；
2. 用表格展示源 IP、目的 IP、协议、累计流量、峰值、平均速率；
3. 用折线图展示最近流量变化；
4. 页面要简洁清晰，适合实验演示；
5. 需要显示接口请求状态和更新时间；
6. 请给出 HTML、CSS、JavaScript 代码。

AI 回复摘要：
AI 基于项目骨架阶段的前端代码进行了多轮迭代增强，最终交付内容包括：
- index.html：引入 Chart.js CDN，页面结构分为发送速率图、接收速率图、流量表格三大区域，保留防火墙标签页。
- js/traffic.js：核心逻辑约 190 行，实现每秒轮询 /api/traffic、表格渲染、两张独立折线图管理。
- css/style.css：新增图表容器、错误状态样式。
折线图设计经历多次迭代优化：
  第一版：单条"总速率"聚合线 → 用户反馈过于平坦，无法区分不同流；
  第二版：Top 5 流分线展示 → 用户反馈 SSH 背景流压缩了测试流量的 Y 轴比例尺；
  第三版：过滤 SSH 网关 IP（10.0.2.2），仅展示测试流量 → 用户反馈指导书示例为发送/接收分图；
  最终版：两张独立折线图——发送速率图（本机发出的流）和接收速率图（发往本机的流），
         每图展示 Top 5 流，无线下填充，五色线（蓝/红/绿/琥珀/紫）区分不同流，
         本机 IP 自动检测，300 采样点（5 分钟）保留不丢失，X 轴自动压缩刻度。
后端同步增强：新增静态文件托管功能，将 / 路由从健康检查改为返回 index.html，
并新增 /api 路由作为接口列表。添加路径穿越防护和 SO_REUSEADDR 端口重用。
部署过程中解决了 OpenWrt 无 Python（opkg install python3）、VirtualBox NAT 端口转发配置、/tmp 路径 Windows/Linux 差异等问题。

采纳内容：
- Chart.js CDN 方案采纳，轻量且适合实验环境。
- 发送/接收双图设计采纳，与指导书图 2 示例风格一致。
- 自动检测本机 IP 方案采纳，避免硬编码。
- SSH 网关 IP 过滤方案采纳，确保测试流量的波动在图表上清晰可见。
- 300 采样点滑动窗口采纳，既保留历史数据又自动压缩 X 轴。
- 后端静态文件托管 + SO_REUSEADDR 采纳，实现一站式启动（一个 python3 app.py 搞定前后端）。
- 五色配色方案采纳（蓝/红/绿/琥珀/紫）。

手动修改：
- index.html：将单个 canvas 拆为 sendChart 和 recvChart 两个。
- traffic.js：
  - 由单图改为 sendHistory/recvHistory 双历史存储结构。
  - 颜色从绿色系（#16a34a 等）改为五色鲜明配色（#2563eb, #dc2626, #16a34a, #ca8a04, #7c3aed）。
  - 无线下填充（fill: false），仅保留线条。
  - CHART_HIDDEN_IPS 数组默认过滤 10.0.2.2（VirtualBox NAT 网关 SSH 流量）。
  - 采样点数从 60 增至 300（5 分钟）。
- 后端 app.py：/ 路由改为 serve_file("index.html")，新增 /api 路由，新增 _serve_file() 方法含路径穿越防护。
- 后端 config.py：新增 STATIC_DIR 配置项。
- CSS：图表高度从 240px 调整为 180px（两张图叠加空间适中）。

测试结果：
- Windows 本机端到端测试：后端启动后 curl 验证 /（返回 HTML）、/css/style.css、/js/traffic.js、/api/traffic 均正常；路径穿越 /../config.py 被安全拦截。
- OpenWrt 部署测试：
  - scp 上传后端和前端文件至 /root/openwrt/，修改 STATIC_DIR 指向正确路径。
  - python3 app.py 启动成功，前端页面通过 VirtualBox NAT 端口转发（8080→8080）在 Windows 浏览器正常访问。
  - 表格每秒刷新，ping / wget 测试流量在折线图上实时呈现发送/接收突起。
  - 过滤 SSH 背景流后 Y 轴比例尺合理，测试流量波动清晰可见。
  - 300 采样点运行超过 5 分钟后数据稳定不丢失，X 轴刻度自动压缩。
- 已知问题：Windows 上 /tmp 路径在 Python 和 bash 间映射不一致（测试时需临时创建 C:\tmp），OpenWrt 无此问题。

评价：
前端开发经历了多轮"反馈 → 修改 → 再反馈"的迭代过程，最终方案高度契合实验指导书图 2 的展示风格。关键设计决策正确：Chart.js 选型轻量且无依赖，发送/接收双图方案源自对指导书示例的理解和对用户反馈的响应，300 采样点兼顾了数据完整性和图表可读性。整个前后端启动流程简化为两条命令（./traffic_monitor br-lan + python3 app.py），浏览器一个地址即可访问，非常适合实验演示和视频录制。AI 在网络原理层面的解释（SSH 背景流来源、DNS 解析后域名丢失、ping 一个网站触发多条流的原因）也帮助理解了流量监控的实际意义。

