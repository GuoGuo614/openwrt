#!/bin/sh
#
# OpenWrt 实验防火墙管理脚本
#
# 用法：
#   ./firewall.sh add    <协议> <源地址>   <目的地址>  <端口> <动作>
#   ./firewall.sh list
#   ./firewall.sh delete <规则编号>
#   ./firewall.sh clear
#
# 示例：
#   ./firewall.sh add tcp 0.0.0.0/0 8.8.8.8 80 reject
#   ./firewall.sh add udp 192.168.1.0/24 10.0.0.1 53 drop
#   ./firewall.sh add icmp 10.0.2.15 8.8.8.8 0 drop
#   ./firewall.sh list
#   ./firewall.sh delete 3
#   ./firewall.sh clear
#
# 设计说明：
#   - 所有规则写入独立 iptables 链 lab_rules，与系统规则隔离
#   - clear 仅清空实验规则，不影响 OpenWrt 自带规则
#   - 脚本自身做参数校验（后端也会校验，双重保险）
#   - 被调用的链：FORWARD（经过路由器转发的流量）
#     如需改为 INPUT（发往本机），修改下方 CHAIN 变量

set -e

CHAIN="lab_rules"

# ==================== 工具函数 ====================

usage() {
    echo "用法: $0 {add|list|delete|clear} [参数...]"
    echo ""
    echo "  add    <协议> <源地址>   <目的地址>  <端口> <动作>"
    echo "  list"
    echo "  delete <规则编号>"
    echo "  clear"
    echo ""
    echo "协议: tcp | udp | icmp | all"
    echo "动作: accept | reject | drop"
    echo ""
    echo "示例:"
    echo "  $0 add tcp 0.0.0.0/0 8.8.8.8 80 reject"
    echo "  $0 list"
    echo "  $0 delete 3"
    echo "  $0 clear"
    exit 2
}

die() {
    echo "错误: $1" >&2
    exit 1
}

# ==================== 参数校验 ====================

validate_protocol() {
    case "$1" in
        tcp|udp|icmp|all) return 0 ;;
        *) die "非法协议: $1（允许: tcp, udp, icmp, all）" ;;
    esac
}

validate_ip() {
    # 允许 IP、CIDR 网段、0.0.0.0/0（表示任意地址）
    echo "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$' || \
        die "非法 IP 地址格式: $1（示例: 192.168.1.1 或 192.168.1.0/24）"
}

validate_port() {
    case "$1" in
        ''|0) ;;  # ICMP / all 不需要端口，允许为 0 或空
        *)
            echo "$1" | grep -Eq '^[0-9]+$' || die "端口必须为数字: $1"
            if [ "$1" -lt 1 ] || [ "$1" -gt 65535 ]; then
                die "端口超出范围（1-65535）: $1"
            fi
            ;;
    esac
}

validate_action() {
    case "$1" in
        accept|reject|drop) return 0 ;;
        *) die "非法动作: $1（允许: accept, reject, drop）" ;;
    esac
}

validate_rule_number() {
    echo "$1" | grep -Eq '^[1-9][0-9]*$' || die "规则编号必须为正整数: $1"
}

# ==================== 链初始化 ====================

init_chain() {
    # 确保自定义链存在
    if ! iptables -L "$CHAIN" -n > /dev/null 2>&1; then
        iptables -N "$CHAIN"
    fi

    # 确保 FORWARD 和 OUTPUT 中都有跳转规则（各加一次）
    # FORWARD：控制经过路由器转发的流量
    # OUTPUT： 控制路由器本机发出的流量（wget、ping 等）
    for chain in FORWARD OUTPUT; do
        if ! iptables -C "$chain" -j "$CHAIN" 2> /dev/null; then
            iptables -I "$chain" 1 -j "$CHAIN"
        fi
    done
}

# ==================== 命令实现 ====================

cmd_add() {
    local proto="$1" src="$2" dst="$3" port="$4" action="$5"

    validate_protocol "$proto"
    validate_ip "$src"
    validate_ip "$dst"
    validate_port "$port"
    validate_action "$action"

    init_chain

    # 构建 iptables 参数（用数组避免字符串拼接注入）
    set -- -I "$CHAIN" 1

    # 协议（all 表示匹配所有，不指定 -p）
    if [ "$proto" != "all" ]; then
        set -- "$@" -p "$proto"
    fi

    # 源地址（0.0.0.0/0 表示任意，可不指定，但显式写出更清晰）
    set -- "$@" -s "$src"
    set -- "$@" -d "$dst"

    # 端口（TCP/UDP 才需要，ICMP 和 all 跳过）
    if [ "$proto" = "tcp" ] || [ "$proto" = "udp" ]; then
        if [ -n "$port" ] && [ "$port" != "0" ]; then
            set -- "$@" --dport "$port"
        fi
    fi

    # 动作
    set -- "$@" -j "$(echo "$action" | tr 'a-z' 'A-Z')"

    echo "执行: iptables $*"
    if iptables "$@"; then
        echo "规则添加成功"
    else
        die "iptables 执行失败"
    fi
}

cmd_list() {
    init_chain
    echo "实验防火墙规则列表（链: $CHAIN）："
    iptables -L "$CHAIN" -n -v --line-numbers 2>&1 || \
        die "无法列出 $CHAIN 链规则"
}

cmd_delete() {
    local num="$1"
    validate_rule_number "$num"

    init_chain

    # 确认规则存在
    local count
    count=$(iptables -L "$CHAIN" -n --line-numbers 2> /dev/null | grep -cE "^$num ")
    if [ "$count" -eq 0 ]; then
        die "规则编号 $num 不存在，请先执行 list 查看当前规则"
    fi

    echo "删除规则 $num ..."
    if iptables -D "$CHAIN" "$num"; then
        echo "规则 $num 删除成功"
    else
        die "删除规则 $num 失败"
    fi
}

cmd_clear() {
    init_chain
    echo "清空实验防火墙规则..."
    iptables -F "$CHAIN"
    echo "已清空 $CHAIN 链所有规则"
}

# ==================== 主入口 ====================

ACTION="${1:-}"

case "$ACTION" in
    add)
        if [ $# -ne 6 ]; then
            echo "错误: add 需要 5 个参数，实际提供了 $(( $# - 1 )) 个" >&2
            usage
        fi
        shift
        cmd_add "$@"
        ;;
    list)
        cmd_list
        ;;
    delete)
        if [ $# -ne 2 ]; then
            echo "错误: delete 需要 1 个参数（规则编号）" >&2
            usage
        fi
        cmd_delete "$2"
        ;;
    clear)
        cmd_clear
        ;;
    *)
        usage
        ;;
esac
