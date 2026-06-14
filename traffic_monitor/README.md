# 流量监控器

本模块包含基于 C/libpcap 的流量监控程序。

## 已实现功能

- 从指定网络接口捕获 IPv4 数据包。
- 解析源 IP、目的 IP、协议类型和数据包长度。
- 按流（flow）聚合流量数据。
- 每秒刷新命令行统计信息。
- 计算累计流量、峰值速率和近期平均速率。
- 将 JSON 输出写入 `/tmp/traffic_stats.json`，供后端读取。

## 文件说明

- `traffic_monitor.c`：C 主程序源文件。
- `Makefile`：面向 OpenWrt/Linux 的构建脚本。
- `sample_output.md`：记录命令行输出示例，用于实验报告。

## 构建

在 Linux 开发环境中安装依赖：

```sh
sudo apt update
sudo apt install build-essential libpcap-dev
```

如果直接在 OpenWrt 上编译，需要先安装可用的构建工具和 libpcap 包：

```sh
opkg update
opkg install gcc make libpcap
```

对于资源受限的 OpenWrt 镜像，建议使用 OpenWrt SDK 进行交叉编译。

```sh
make
```

## 运行

查看网络接口列表：

```sh
ip link
```

运行监控器：

```sh
./traffic_monitor br-lan
```

默认 JSON 输出路径为 `/tmp/traffic_stats.json`。你也可以指定自定义路径：

```sh
./traffic_monitor br-lan /tmp/traffic_stats.json
```

在另一个 SSH 会话中生成测试流量：

```sh
ping -c 4 openwrt.org
wget -O /tmp/test.html http://example.com
```

查看 JSON 输出：

```sh
cat /tmp/traffic_stats.json
```

程序先写入临时文件，再重命名为最终 JSON 路径，因此后端不会读取到写入一半的 JSON 文档。
