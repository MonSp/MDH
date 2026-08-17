"""
MDH MCP Server — 将 MDH 内置工具暴露为 MCP 服务器

外部 agent 可通过 MCP 协议连接并使用 MDH 的工具。

Phase 1: 低级工具（文件/Git/搜索）— 8 个
Phase 2: 高级业务工具（工作流/技能/经验/资产）— 复用 REST API 逻辑

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
import os
import sys
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mcp_server")

# REST API 内部代理（复用 FastAPI 端点逻辑）
_rest_client = None


def _get_rest_client():
    """延迟加载 FastAPI TestClient（用于内部 REST 调用）"""
    global _rest_client
    if _rest_client is None:
        from fastapi.testclient import TestClient
        from server import app
        _rest_client = TestClient(app)
    return _rest_client


def _proxy_rest(method: str, path: str, json_data: dict = None, params: dict = None) -> dict:
    """代理 REST API 调用"""
    client = _get_rest_client()
    if method == "GET":
        response = client.get(path, params=params)
    elif method == "POST":
        response = client.post(path, json=json_data, params=params)
    elif method == "PUT":
        response = client.put(path, json=json_data)
    elif method == "DELETE":
        response = client.delete(path)
    else:
        return {"error": f"Unsupported method: {method}"}

    return response.json()


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

        # Phase 2: 高级业务工具（复用 REST API）
        self._register_workflow_tools()
        self._register_skill_tools()
        self._register_experience_tools()

    def _register_workflow_tools(self) -> None:
        """注册工作流管理工具（P0）"""
        self._tools["create_workflow"] = {
            "description": "创建工作流。返回工作流 ID 和初始状态。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "工作流名称"},
                    "description": {"type": "string", "description": "工作流描述"},
                    "nodes": {
                        "type": "array",
                        "description": "工作流节点列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "task_description": {"type": "string"},
                                "dept_id": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["name"],
            },
            "handler": self._create_workflow,
        }
        self._tools["execute_workflow"] = {
            "description": "执行工作流。启动 DAG 调度执行。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "execution_id": {"type": "string", "description": "工作流执行 ID"},
                },
                "required": ["execution_id"],
            },
            "handler": self._execute_workflow,
        }
        self._tools["pause_workflow"] = {
            "description": "暂停工作流执行。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "execution_id": {"type": "string", "description": "工作流执行 ID"},
                },
                "required": ["execution_id"],
            },
            "handler": self._pause_workflow,
        }
        self._tools["resume_workflow"] = {
            "description": "恢复暂停的工作流。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "execution_id": {"type": "string", "description": "工作流执行 ID"},
                },
                "required": ["execution_id"],
            },
            "handler": self._resume_workflow,
        }
        self._tools["get_workflow_status"] = {
            "description": "获取工作流执行状态。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "execution_id": {"type": "string", "description": "工作流执行 ID"},
                },
                "required": ["execution_id"],
            },
            "handler": self._get_workflow_status,
        }

    def _register_skill_tools(self) -> None:
        """注册技能管理工具（P0）"""
        self._tools["list_skills"] = {
            "description": "列出所有可用技能包。返回技能名称、版本、描述。",
            "inputSchema": {"type": "object", "properties": {}},
            "handler": self._list_skills,
        }
        self._tools["get_skill"] = {
            "description": "获取技能包详细信息。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "skill_id": {"type": "string", "description": "技能 ID"},
                },
                "required": ["skill_id"],
            },
            "handler": self._get_skill,
        }
        self._tools["create_skill"] = {
            "description": "创建新技能包。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "技能名称"},
                    "description": {"type": "string", "description": "技能描述"},
                    "version": {"type": "string", "description": "版本号", "default": "1.0.0"},
                    "category": {"type": "string", "description": "类别"},
                    "system_prompt": {"type": "string", "description": "系统提示词"},
                },
                "required": ["name", "description"],
            },
            "handler": self._create_skill,
        }

    def _register_experience_tools(self) -> None:
        """注册经验管理工具（P0）"""
        self._tools["list_experience_rules"] = {
            "description": "列出经验规则。可按状态过滤。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "过滤状态（approved/pending）", "default": ""},
                },
            },
            "handler": self._list_experience_rules,
        }
        self._tools["approve_experience_rule"] = {
            "description": "审批通过经验规则。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string", "description": "规则 ID"},
                },
                "required": ["rule_id"],
            },
            "handler": self._approve_experience_rule,
        }
        self._tools["reject_experience_rule"] = {
            "description": "拒绝经验规则。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string", "description": "规则 ID"},
                    "reason": {"type": "string", "description": "拒绝原因", "default": ""},
                },
                "required": ["rule_id"],
            },
            "handler": self._reject_experience_rule,
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

    # ── Phase 2: 高级业务工具实现（复用 REST API）──

    async def _create_workflow(self, name: str, description: str = "", nodes: list = None) -> str:
        """创建工作流"""
        result = _proxy_rest("POST", "/api/workflow/create", json_data={
            "name": name,
            "description": description,
            "nodes": nodes or [],
        })
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _execute_workflow(self, execution_id: str) -> str:
        """执行工作流"""
        result = _proxy_rest("POST", f"/api/workflow/execute/{execution_id}")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _pause_workflow(self, execution_id: str) -> str:
        """暂停工作流"""
        result = _proxy_rest("POST", f"/api/workflow/pause/{execution_id}")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _resume_workflow(self, execution_id: str) -> str:
        """恢复工作流"""
        result = _proxy_rest("POST", f"/api/workflow/resume/{execution_id}")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _get_workflow_status(self, execution_id: str) -> str:
        """获取工作流状态"""
        result = _proxy_rest("GET", f"/api/workflow/status/{execution_id}")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _list_skills(self) -> str:
        """列出技能"""
        result = _proxy_rest("GET", "/api/skills")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _get_skill(self, skill_id: str) -> str:
        """获取技能详情"""
        result = _proxy_rest("GET", f"/api/skills/{skill_id}")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _create_skill(self, name: str, description: str, version: str = "1.0.0",
                           category: str = "", system_prompt: str = "") -> str:
        """创建技能"""
        result = _proxy_rest("POST", "/api/skills", json_data={
            "name": name,
            "description": description,
            "version": version,
            "category": category,
            "system_prompt": system_prompt,
        })
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _list_experience_rules(self, status: str = "") -> str:
        """列出经验规则"""
        path = "/api/experience/rules/pending" if status == "pending" else "/api/experience/rules"
        result = _proxy_rest("GET", path)
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _approve_experience_rule(self, rule_id: str) -> str:
        """审批经验规则"""
        result = _proxy_rest("POST", f"/api/experience/rules/{rule_id}/approve")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _reject_experience_rule(self, rule_id: str, reason: str = "") -> str:
        """拒绝经验规则"""
        result = _proxy_rest("POST", f"/api/experience/rules/{rule_id}/reject",
                           json_data={"reason": reason})
        return json.dumps(result, ensure_ascii=False, indent=2)

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
