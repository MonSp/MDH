"""
MDH MCP Server — 将 MDH 内置工具暴露为 MCP 服务器

外部 agent 可通过 MCP 协议连接并使用 MDH 的 18 个内置工具。

使用方式：
    # 作为模块运行
    python -m backend.mcp_server

    # 或通过 API 启动
    from backend.mcp_server import create_mcp_server
    server = create_mcp_server("/path/to/workspace")
"""

import asyncio
import json
import logging
import sys
from typing import Any, Dict, List

logger = logging.getLogger("mcp_server")


class MDHMCPServer:
    """MDH MCP Server — 暴露 MDH 内置工具

    用法：
        server = MDHMCPServer("/path/to/workspace")
        await server.run()
    """

    def __init__(self, workspace: str = "/tmp"):
        self._workspace = workspace
        self._tools: Dict[str, Dict[str, Any]] = {}
        self._register_builtin_tools()

    def _register_builtin_tools(self) -> None:
        """注册 18 个内置工具"""
        # 文件操作
        self._tools["read_file"] = {
            "description": "读取文件内容",
            "inputSchema": {
                "type": "object",
                "properties": {"path": {"type": "string", "description": "文件路径"}},
                "required": ["path"],
            },
            "handler": self._read_file,
        }
        self._tools["write_file"] = {
            "description": "写入/创建文件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径"},
                    "content": {"type": "string", "description": "文件内容"},
                },
                "required": ["path", "content"],
            },
            "handler": self._write_file,
        }
        self._tools["list_directory"] = {
            "description": "列出目录内容",
            "inputSchema": {
                "type": "object",
                "properties": {"path": {"type": "string", "description": "目录路径"}},
                "required": ["path"],
            },
            "handler": self._list_directory,
        }

        # Git 操作
        self._tools["git_status"] = {
            "description": "查看 git 状态",
            "inputSchema": {"type": "object", "properties": {}},
            "handler": self._git_status,
        }
        self._tools["git_diff"] = {
            "description": "查看 git 差异",
            "inputSchema": {"type": "object", "properties": {}},
            "handler": self._git_diff,
        }
        self._tools["git_log"] = {
            "description": "查看 git 提交日志",
            "inputSchema": {
                "type": "object",
                "properties": {"count": {"type": "integer", "description": "显示条数", "default": 10}},
            },
            "handler": self._git_log,
        }

        # 搜索工具
        self._tools["search_files"] = {
            "description": "搜索文件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "搜索模式"},
                    "path": {"type": "string", "description": "搜索路径", "default": "."},
                },
                "required": ["pattern"],
            },
            "handler": self._search_files,
        }
        self._tools["grep_content"] = {
            "description": "搜索文件内容",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "搜索模式"},
                    "path": {"type": "string", "description": "搜索路径", "default": "."},
                },
                "required": ["pattern"],
            },
            "handler": self._grep_content,
        }

    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """处理 JSON-RPC 请求"""
        method = request.get("method", "")
        params = request.get("params", {})
        request_id = request.get("id")

        try:
            if method == "initialize":
                result = await self._handle_initialize(params)
            elif method == "tools/list":
                result = await self._handle_list_tools(params)
            elif method == "tools/call":
                result = await self._handle_call_tool(params)
            elif method == "notifications/initialized":
                return None  # 通知，无需响应
            else:
                return self._error_response(request_id, -32601, f"Method not found: {method}")

            return self._success_response(request_id, result)
        except Exception as e:
            return self._error_response(request_id, -32603, str(e))

    async def _handle_initialize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """处理初始化请求"""
        return {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {"listChanged": False},
            },
            "serverInfo": {
                "name": "mdh-tools",
                "version": "1.0.0",
            },
        }

    async def _handle_list_tools(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """处理工具列表请求"""
        tools = []
        for name, tool in self._tools.items():
            tools.append({
                "name": name,
                "description": tool["description"],
                "inputSchema": tool["inputSchema"],
            })
        return {"tools": tools}

    async def _handle_call_tool(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """处理工具调用请求"""
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        tool = self._tools.get(tool_name)
        if not tool:
            return {"content": [{"type": "text", "text": f"Tool not found: {tool_name}"}], "isError": True}

        try:
            result = await tool["handler"](**arguments)
            return {"content": [{"type": "text", "text": str(result)}]}
        except Exception as e:
            return {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}

    # ── 工具实现 ──

    async def _read_file(self, path: str) -> str:
        import os
        full_path = os.path.join(self._workspace, path)
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()

    async def _write_file(self, path: str, content: str) -> str:
        import os
        full_path = os.path.join(self._workspace, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"Written {len(content)} bytes to {path}"

    async def _list_directory(self, path: str = ".") -> str:
        import os
        full_path = os.path.join(self._workspace, path)
        entries = os.listdir(full_path)
        return "\n".join(sorted(entries))

    async def _git_status(self) -> str:
        return await self._run_command("git status")

    async def _git_diff(self) -> str:
        return await self._run_command("git diff")

    async def _git_log(self, count: int = 10) -> str:
        return await self._run_command(f"git log --oneline -{count}")

    async def _search_files(self, pattern: str, path: str = ".") -> str:
        return await self._run_command(f"find {path} -name '{pattern}' -type f 2>/dev/null | head -20")

    async def _grep_content(self, pattern: str, path: str = ".") -> str:
        return await self._run_command(f"grep -r '{pattern}' {path} 2>/dev/null | head -20")

    async def _run_command(self, command: str) -> str:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._workspace,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        return stdout.decode() if stdout else stderr.decode()

    # ── JSON-RPC 辅助 ──

    def _success_response(self, request_id: Any, result: Any) -> Dict[str, Any]:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def _error_response(self, request_id: Any, code: int, message: str) -> Dict[str, Any]:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}

    async def run(self) -> None:
        """运行 MCP 服务器（Stdio 传输）"""
        logger.info("MDH MCP Server 启动，工作区: %s", self._workspace)

        while True:
            try:
                line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
                if not line:
                    break

                request = json.loads(line.strip())
                response = await self.handle_request(request)

                if response:
                    sys.stdout.write(json.dumps(response) + "\n")
                    sys.stdout.flush()

            except json.JSONDecodeError:
                continue
            except Exception as e:
                logger.error("MCP 服务器错误: %s", e)
                break


def create_mcp_server(workspace: str = "/tmp") -> MDHMCPServer:
    """创建 MCP 服务器实例"""
    return MDHMCPServer(workspace)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    workspace = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
    server = MDHMCPServer(workspace)
    asyncio.run(server.run())
