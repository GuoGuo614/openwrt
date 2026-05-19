from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

from config import HOST, PORT, TRAFFIC_STATS_PATH


class LabRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/traffic":
            self.handle_traffic()
            return

        self._send_json(404, {"ok": False, "error": "not found"})

    def handle_traffic(self):
        if not os.path.exists(TRAFFIC_STATS_PATH):
            self._send_json(503, {
                "ok": False,
                "error": f"traffic stats file not found: {TRAFFIC_STATS_PATH}",
            })
            return

        try:
            with open(TRAFFIC_STATS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as exc:
            self._send_json(503, {"ok": False, "error": f"invalid traffic JSON: {exc}"})
            return

        self._send_json(200, {"ok": True, "data": data})


def main():
    server = HTTPServer((HOST, PORT), LabRequestHandler)
    print(f"backend listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()

