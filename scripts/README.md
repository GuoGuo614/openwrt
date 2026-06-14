# 防火墙脚本

本目录包含后端调用的脚本，用于管理 OpenWrt 防火墙规则。

## 文件说明

- `firewall.sh`：统一的命令行入口，支持 add / list / delete / clear 操作。
- `firewall_rules.conf`：预留的实验管理规则记录文件（按需使用）。

## 规划的命令

```sh
./firewall.sh add tcp 0.0.0.0/0 8.8.8.8 80 reject
./firewall.sh list
./firewall.sh delete 1
./firewall.sh clear
```
