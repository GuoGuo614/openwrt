"""
OpenWrt 网络实验 —— 后端 HTTP 服务

提供：
  - 前端静态文件托管（HTML / CSS / JS）
  - GET  /api/traffic           读取 C 程序生成的流量 JSON
  - GET  /api                   健康检查，返回可用接口列表
  - POST /api/firewall/add      新增防火墙规则
  - GET  /api/firewall/list     查看实验规则
  - POST /api/firewall/delete   删除指定规则
  - POST /api/firewall/clear    清空实验规则

仅使用 Python 标准库，无需额外安装依赖，适合在 OpenWrt 虚拟机中直接运行。
"""

import json
import mimetypes
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

from config import (
    FIREWALL_SCRIPT_PATH,
    HOST,
    PORT,
    STATIC_DIR,
    TRAFFIC_STATS_PATH,
)

# 补充标准库未覆盖的 MIME 类型
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")


# ==================== 参数校验 ====================

def validate_protocol(value):
    """校验协议类型"""
    if value not in ("tcp", "udp", "icmp", "all"):
        raise ValueError(f"非法协议: {value}（允许: tcp, udp, icmp, all）")
    return value


def validate_ip(value):
    """校验 IP 地址或 CIDR 网段"""
    if not re.match(
        r"^(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?$", value
    ):
        raise ValueError(f"非法 IP 地址格式: {value}（示例: 192.168.1.1 或 192.168.1.0/24）")
    return value


def validate_port(value):
    """校验端口号（1-65535，ICMP/all 允许 0）"""
    try:
        port = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"端口必须为数字: {value}")
    if port < 0 or port > 65535:
        raise ValueError(f"端口超出范围（0-65535）: {port}")
    return port


def validate_action(value):
    """校验防火墙动作"""
    if value not in ("accept", "reject", "drop"):
        raise ValueError(f"非法动作: {value}（允许: accept, reject, drop）")
    return value


def validate_rule_number(value):
    """校验规则编号"""
    try:
        num = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"规则编号必须为整数: {value}")
    if num < 1:
        raise ValueError(f"规则编号必须为正整数: {value}")
    return num


# ==================== 脚本调用 ====================

def run_firewall_script(args):
    """
    安全调用防火墙脚本。
    使用 list 传参（非 shell 拼接），捕获 stdout / stderr / returncode。
    """
    # FIREWALL_SCRIPT_PATH 已在 config.py 中解析为绝对路径
    script_path = FIREWALL_SCRIPT_PATH

    if not os.path.isfile(script_path):
        return {
            "ok": False,
            "error": f"防火墙脚本不存在: {script_path}",
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }

    try:
        result = subprocess.run(
            [script_path] + args,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "防火墙脚本执行超时",
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }
    except OSError as exc:
        return {
            "ok": False,
            "error": f"无法执行防火墙脚本: {exc}",
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }


class LabRequestHandler(BaseHTTPRequestHandler):
    """实验后端请求处理器"""

    # ==================== 工具方法 ====================

    def _add_cors(self):
        """添加跨域响应头"""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status, payload):
        """将 dict 序列化为 JSON 响应"""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._add_cors()
        self.end_headers()
        self.wfile.write(body)

    def _ok(self, data):
        """200 成功响应"""
        self._send_json(200, {"ok": True, "data": data})

    def _error(self, status, message):
        """错误响应"""
        self._send_json(status, {"ok": False, "error": message})

    def _read_json_body(self):
        """读取 POST 请求的 JSON Body"""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            raise ValueError("请求 Body 为空")
        raw = self.rfile.read(content_length)
        return json.loads(raw)

    def _serve_file(self, rel_path):
        """返回静态文件内容"""
        if ".." in rel_path or rel_path.startswith("/"):
            self._error(403, "禁止访问的路径")
            return

        full_path = os.path.join(STATIC_DIR, rel_path)
        full_path = os.path.normpath(full_path)

        if not full_path.startswith(os.path.normpath(STATIC_DIR)):
            self._error(403, "禁止访问的路径")
            return

        if not os.path.isfile(full_path):
            self._error(404, f"文件不存在: /{rel_path}")
            return

        try:
            with open(full_path, "rb") as f:
                content = f.read()

            mime_type, _ = mimetypes.guess_type(full_path)
            if mime_type is None:
                mime_type = "application/octet-stream"

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self._add_cors()
            self.end_headers()
            self.wfile.write(content)
        except OSError as exc:
            self._error(500, f"读取文件失败: {exc}")

    # ==================== CORS 预检 ====================

    def do_OPTIONS(self):
        """响应 CORS 预检请求"""
        self.send_response(204)
        self._add_cors()
        self.end_headers()

    # ==================== 路由 ====================

    def do_GET(self):
        """GET 请求路由"""
        if self.path == "/api":
            self.handle_api_index()
            return

        if self.path == "/api/traffic":
            self.handle_traffic()
            return

        if self.path == "/api/firewall/list":
            self.handle_firewall_list()
            return

        # 静态文件
        if self.path == "/":
            self._serve_file("index.html")
            return

        self._serve_file(self.path.lstrip("/"))

    def do_POST(self):
        """POST 请求路由"""
        if self.path == "/api/firewall/add":
            self.handle_firewall_add()
            return

        if self.path == "/api/firewall/delete":
            self.handle_firewall_delete()
            return

        if self.path == "/api/firewall/clear":
            self.handle_firewall_clear()
            return

        self._error(404, f"未找到接口: {self.path}")

    # ==================== API 实现 ====================

    def handle_api_index(self):
        """健康检查 / 接口列表"""
        self._ok({
            "service": "OpenWrt 网络实验后端",
            "version": "1.0",
            "endpoints": [
                "GET  /                    前端页面",
                "GET  /api                 接口列表（本页）",
                "GET  /api/traffic         流量统计数据",
                "POST /api/firewall/add    新增防火墙规则",
                "GET  /api/firewall/list   查看实验规则",
                "POST /api/firewall/delete 删除指定规则",
                "POST /api/firewall/clear  清空实验规则",
            ],
        })

    def handle_traffic(self):
        """读取流量统计 JSON 文件并返回"""
        if not os.path.exists(TRAFFIC_STATS_PATH):
            self._error(503, (
                f"流量数据文件不存在: {TRAFFIC_STATS_PATH}。"
                "请确认 traffic_monitor 程序是否正在运行。"
            ))
            return

        try:
            with open(TRAFFIC_STATS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as exc:
            self._error(503, (
                f"流量数据文件格式错误（JSON 解析失败）: {exc}。"
                "文件可能正在写入中，请稍后重试。"
            ))
            return
        except OSError as exc:
            self._error(503, f"读取流量数据文件失败: {exc}")
            return

        self._ok(data)

    # ==================== 防火墙 API ====================

    def handle_firewall_add(self):
        """新增防火墙规则"""
        try:
            body = self._read_json_body()
            proto = validate_protocol(body.get("protocol", ""))
            src = validate_ip(body.get("src_ip", ""))
            dst = validate_ip(body.get("dst_ip", ""))
            port = validate_port(body.get("port", 0))
            action = validate_action(body.get("action", ""))
        except (ValueError, json.JSONDecodeError) as exc:
            self._error(400, f"参数校验失败: {exc}")
            return

        result = run_firewall_script([
            "add", proto, src, dst, str(port), action,
        ])

        if result["ok"]:
            self._ok({
                "message": "规则添加成功",
                "stdout": result["stdout"],
            })
        else:
            self._error(500, result.get("error") or result["stderr"] or "脚本执行失败")

    def handle_firewall_list(self):
        """查看实验规则列表"""
        result = run_firewall_script(["list"])

        if result["ok"]:
            self._ok({
                "stdout": result["stdout"],
                "rules_text": result["stdout"],
            })
        else:
            self._error(500, result.get("error") or result["stderr"] or "获取规则列表失败")

    def handle_firewall_delete(self):
        """删除指定规则"""
        try:
            body = self._read_json_body()
            num = validate_rule_number(body.get("rule_number", 0))
        except (ValueError, json.JSONDecodeError) as exc:
            self._error(400, f"参数校验失败: {exc}")
            return

        result = run_firewall_script(["delete", str(num)])

        if result["ok"]:
            self._ok({
                "message": f"规则 {num} 删除成功",
                "stdout": result["stdout"],
            })
        else:
            self._error(500, result.get("error") or result["stderr"] or "删除规则失败")

    def handle_firewall_clear(self):
        """清空实验规则"""
        result = run_firewall_script(["clear"])

        if result["ok"]:
            self._ok({
                "message": "实验规则已清空",
                "stdout": result["stdout"],
            })
        else:
            self._error(500, result.get("error") or result["stderr"] or "清空规则失败")


def main():
    """启动后端 HTTP 服务"""
    import socket
    server = HTTPServer((HOST, PORT), LabRequestHandler)
    server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    print(f"OpenWrt 网络实验后端已启动")
    print(f"====================================")
    print(f"路由器本地访问: http://{HOST}:{PORT}/")
    print(f"电脑浏览器访问: http://<路由器LAN_IP>:{PORT}/")
    print(f"  (例如 http://192.168.10.1:{PORT}/)")
    print(f"接口列表:       http://<路由器IP>:{PORT}/api")
    print(f"====================================")
    print(f"流量数据源:     {TRAFFIC_STATS_PATH}")
    print(f"防火墙脚本:     {FIREWALL_SCRIPT_PATH}")
    print(f"静态文件目录:   {STATIC_DIR}")
    print(f"按 Ctrl+C 停止服务")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n后端服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
