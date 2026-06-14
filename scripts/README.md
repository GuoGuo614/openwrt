# 防火墙脚本

本目录包含后端调用的脚本，用于管理 OpenWrt 防火墙规则。

## 文件说明

- `firewall.sh`：统一的命令行入口，支持 add / list / delete / clear 操作。
- `firewall_rules.conf`：预留的实验管理规则记录文件（按需使用）。

## 设计说明

所有实验规则写入独立的 iptables 链 `lab_rules`，通过 FORWARD 链调用。与系统自带防火墙规则完全隔离，clear 操作不会影响 OpenWrt 正常网络功能。

脚本和后端各做一次参数校验，双重保险防止命令注入。

## 命令参考

```sh
# 新增规则：禁止访问 8.8.8.8 的 80 端口
./firewall.sh add tcp 0.0.0.0/0 8.8.8.8 80 reject

# 新增规则：丢弃来自某网段的 UDP DNS 请求
./firewall.sh add udp 192.168.1.0/24 10.0.0.1 53 drop

# 新增规则：允许所有 ICMP
./firewall.sh add icmp 0.0.0.0/0 0.0.0.0/0 0 accept

# 查看实验规则列表（含编号）
./firewall.sh list

# 删除编号为 3 的规则
./firewall.sh delete 3

# 清空所有实验规则
./firewall.sh clear
```

## 验证方法

```sh
# 添加一条拒绝规则
./firewall.sh add tcp 0.0.0.0/0 8.8.8.8 80 reject

# 在 OpenWrt 上验证规则已生效
ping 8.8.8.8                     # ICMP，应该通
wget -O- http://8.8.8.8:80      # TCP 80，应该被拒绝（超时或连接拒绝）

# 查看规则
./firewall.sh list

# 清空后恢复
./firewall.sh clear
wget -O- http://8.8.8.8:80      # 恢复（可能超时但不再被防火墙拦截）
```
