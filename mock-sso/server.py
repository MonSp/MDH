import http.server
import socketserver
import os
import sys
import json
from urllib.parse import urlparse, parse_qs

PORT = 8766
HOST = "0.0.0.0"

class MockSSOHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/" or parsed.path == "/login":
            self.path = "/login.html"
            return super().do_GET()

        if parsed.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response = {
                "status": "ok",
                "service": "mock-sso",
                "port": PORT
            }
            self.wfile.write(json.dumps(response).encode())
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/login":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body)
                username = data.get("username", "")
                password = data.get("password", "")
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return

            if username and password:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                response = {
                    "success": True,
                    "token": f"mock_token_{username}_{hash(username + password)}",
                    "username": username,
                    "message": "登录成功"
                }
                self.wfile.write(json.dumps(response).encode())
            else:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                response = {
                    "success": False,
                    "message": "用户名或密码错误"
                }
                self.wfile.write(json.dumps(response).encode())
            return

        self.send_error(404, "Not Found")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

def main():
    global PORT

    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print(f"无效的端口号: {sys.argv[1]}")
            sys.exit(1)

    with socketserver.TCPServer((HOST, PORT), MockSSOHandler) as httpd:
        print(f"模拟 SSO 服务器已启动")
        print(f"访问地址: http://localhost:{PORT}")
        print(f"登录页面: http://localhost:{PORT}/login")
        print(f"健康检查: http://localhost:{PORT}/health")
        print(f"按 Ctrl+C 停止服务器")
        print("-" * 40)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务器已停止")
            httpd.shutdown()

if __name__ == "__main__":
    main()
