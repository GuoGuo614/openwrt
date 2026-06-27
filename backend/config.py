"""
后端配置文件

所有路径均基于本文件所在目录（backend/）解析，不受启动命令的当前工作目录影响。
支持通过环境变量覆盖默认值，方便在不同设备上部署。
"""

import os

# ========== 基于本文件的路径解析 ==========

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_DIR = os.path.dirname(_BACKEND_DIR)


def _resolve(path):
    """将相对于项目根目录的路径转为绝对路径"""
    return os.path.normpath(os.path.join(_PROJECT_DIR, path))


# ========== 监听地址与端口 ==========

HOST = os.environ.get("LAB_HOST", "0.0.0.0")
PORT = int(os.environ.get("LAB_PORT", "8080"))

# ========== 数据与脚本路径 ==========

# 流量统计数据 JSON 文件路径（C 程序每秒写入）
TRAFFIC_STATS_PATH = os.environ.get(
    "TRAFFIC_STATS_PATH",
    "/tmp/traffic_stats.json",
)

# 防火墙 Shell 脚本路径
FIREWALL_SCRIPT_PATH = os.environ.get(
    "FIREWALL_SCRIPT_PATH",
    _resolve("scripts/firewall.sh"),
)

# 前端静态文件目录
STATIC_DIR = os.environ.get(
    "STATIC_DIR",
    _resolve("frontend"),
)
