# 后端配置文件
# 集中管理所有可配置项，方便在不同环境中调整

# 流量统计数据文件路径（C 程序每秒写入）
TRAFFIC_STATS_PATH = "/tmp/traffic_stats.json"

# 防火墙脚本路径（相对于 backend 目录）
FIREWALL_SCRIPT_PATH = "../scripts/firewall.sh"

# 前端静态文件目录（相对于 backend 目录）
STATIC_DIR = "../frontend"

# HTTP 服务监听地址与端口
HOST = "0.0.0.0"
PORT = 8080
