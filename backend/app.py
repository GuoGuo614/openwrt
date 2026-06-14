"""
OpenWrt 网络实验 —— 后端 HTTP 服务

提供：
  - 前端静态文件托管（HTML / CSS / JS）
  - GET  /api/traffic       读取 C 程序生成的流量 JSON
  - GET  /api               健康检查，返回可用接口列表

仅使用 Python 标准库，无需额外安装依赖，适合在 OpenWrt 虚拟机中直接运行。
"""

import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from config import HOST, PORT, STATIC_DIR, TRAFFIC_STATS_PATH

# 补充标准库未覆盖的 MIME 类型
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")


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
        """错误响应，统一格式 {"ok": false, "error": "..."}"""
        self._send_json(status, {"ok": False, "error": message})

    def _serve_file(self, rel_path):
        """返回静态文件内容"""
        # 安全检查：拒绝路径穿越（..）和绝对路径
        if ".." in rel_path or rel_path.startswith("/"):
            self._error(403, "禁止访问的路径")
            return

        full_path = os.path.join(STATIC_DIR, rel_path)
        full_path = os.path.normpath(full_path)

        # 确保解析后的路径仍在 STATIC_DIR 内
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
        """GET 请求路由 —— 先匹配 API，再匹配静态文件"""

        # --- API 路由 ---

        if self.path == "/api":
            self.handle_api_index()
            return

        if self.path == "/api/traffic":
            self.handle_traffic()
            return

        # --- 静态文件路由 ---

        # 首页
        if self.path == "/":
            self._serve_file("index.html")
            return

        # CSS / JS / 图片等
        # 去掉开头的 /，转为相对于 STATIC_DIR 的路径
        self._serve_file(self.path.lstrip("/"))

    # ==================== API 实现 ====================

    def handle_api_index(self):
        """健康检查 / 接口列表"""
        self._ok({
            "service": "OpenWrt 网络实验后端",
            "version": "1.0",
            "endpoints": [
                "GET  /                前端页面",
                "GET  /api             接口列表（本页）",
                "GET  /api/traffic     流量统计数据",
                "POST /api/firewall/add    （待实现）",
                "GET  /api/firewall/list   （待实现）",
                "POST /api/firewall/delete （待实现）",
                "POST /api/firewall/clear  （待实现）",
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


def main():
    """启动后端 HTTP 服务"""
    import socket
    server = HTTPServer((HOST, PORT), LabRequestHandler)
    server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    print(f"OpenWrt 网络实验后端已启动")
    print(f"前端页面: http://{HOST}:{PORT}/")
    print(f"接口列表: http://{HOST}:{PORT}/api")
    print(f"流量数据源: {TRAFFIC_STATS_PATH}")
    print(f"静态文件目录: {STATIC_DIR}")
    print(f"按 Ctrl+C 停止服务")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n后端服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
