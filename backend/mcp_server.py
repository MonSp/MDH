"""
MDH MCP Server — 将 MDH 内置工具暴露为 MCP 服务器

外部 agent 可通过 MCP 协议连接并使用 MDH 的工具。

Phase 1: 低级工具（文件/Git/搜索）— 8 个
Phase 2: 高级业务工具（工作流/技能/经验/资产）— 复用 REST API 逻辑
Phase 3: 资源暴露（files + prompts）+ 工具描述安全

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
import re
import sys
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mcp_server")

# ── Phase 3 T3.3: 工具描述安全 ──

# 敏感关键词列表（防止工具描述注入）
_SENSITIVE_PATTERNS = [
    r'ignore\s+previous\s+instructions',
    r'system\s*prompt',
    r'you\s+are\s+now',
    r'act\s+as\s+if',
    r'forget\s+your',
    r'disregard\s+',
    r'override\s+',
    r'jailbreak',
    r'developer\s+mode',
    r'DAN\s+mode',
]

# 工具描述最大长度
_MAX_DESCRIPTION_LENGTH = 500

def _sanitize_description(description: str) -> str:
    """清理工具描述，防止注入攻击

    规则：
    1. 截断超长描述
    2. 移除可疑的 prompt injection 模式
    3. 移除控制字符
    """
    if not description:
        return ""

    # 截断超长描述
    if len(description) > _MAX_DESCRIPTION_LENGTH:
        description = description[:_MAX_DESCRIPTION_LENGTH] + "..."

    # 移除控制字符（保留换行和制表符）
    description = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', description)

    # 检测并移除可疑的注入模式
    for pattern in _SENSITIVE_PATTERNS:
        if re.search(pattern, description, re.IGNORECASE):
            logger.warning("检测到可疑工具描述，已清理: %s", description[:100])
            description = re.sub(pattern, '[REDACTED]', description, flags=re.IGNORECASE)

    return description.strip()


def _read_file_safe(path: str, max_size: int = 100_000) -> str:
    """安全读取文件（限制大小）"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read(max_size)
        if len(content) == max_size:
            content += "\n... [truncated]"
        return content
    except Exception as e:
        return f"Error reading file: {e}"


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
        self._register_asset_tools()
        self._register_marketplace_tools()
        self._register_role_tools()
        self._register_minutes_tools()

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

    def _register_asset_tools(self) -> None:
        """注册资产管理工具（P1）"""
        self._tools["search_assets"] = {
            "description": "搜索资产（产出物/模板/技能规则）。返回匹配的资产列表。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "keywords": {"type": "string", "description": "搜索关键词"},
                    "asset_type": {"type": "string", "description": "资产类型（artifacts/templates/rules）", "default": ""},
                    "team_id": {"type": "string", "description": "团队 ID", "default": ""},
                },
            },
            "handler": self._search_assets,
        }
        self._tools["create_artifact"] = {
            "description": "创建产出物资产。将文件注册为可复用资产。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "资产名称"},
                    "description": {"type": "string", "description": "资产描述"},
                    "content": {"type": "string", "description": "资产内容"},
                    "team_id": {"type": "string", "description": "团队 ID", "default": ""},
                },
                "required": ["name", "content"],
            },
            "handler": self._create_artifact,
        }
        self._tools["list_assets"] = {
            "description": "列出所有资产。可按类型过滤。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "asset_type": {"type": "string", "description": "资产类型过滤", "default": ""},
                    "team_id": {"type": "string", "description": "团队 ID", "default": ""},
                },
            },
            "handler": self._list_assets,
        }

    def _register_marketplace_tools(self) -> None:
        """注册市场工具（P1）"""
        self._tools["search_shared_experience"] = {
            "description": "搜索共享经验池中的经验规则。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "keywords": {"type": "string", "description": "搜索关键词（逗号分隔）"},
                    "task_type": {"type": "string", "description": "任务类型", "default": ""},
                },
            },
            "handler": self._search_shared_experience,
        }
        self._tools["publish_experience"] = {
            "description": "发布经验规则到共享池。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "trigger_condition": {"type": "string", "description": "触发条件"},
                    "action": {"type": "string", "description": "建议动作"},
                    "keywords": {"type": "string", "description": "关键词（逗号分隔）"},
                    "rule_type": {"type": "string", "description": "规则类型", "default": "success_pattern"},
                },
                "required": ["trigger_condition", "action"],
            },
            "handler": self._publish_experience,
        }
        self._tools["fork_skill_from_marketplace"] = {
            "description": "从共享池 Fork 技能包到项目本地。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "skill_name": {"type": "string", "description": "技能名称"},
                    "project_id": {"type": "string", "description": "目标项目 ID", "default": "current"},
                },
                "required": ["skill_name"],
            },
            "handler": self._fork_skill_from_marketplace,
        }

    def _register_role_tools(self) -> None:
        """注册角色管理工具（P2）"""
        self._tools["get_roles_config"] = {
            "description": "获取角色配置。返回所有可用角色及其工具/技能。",
            "inputSchema": {"type": "object", "properties": {}},
            "handler": self._get_roles_config,
        }
        self._tools["get_role"] = {
            "description": "获取单个角色详情。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "role_id": {"type": "string", "description": "角色 ID"},
                },
                "required": ["role_id"],
            },
            "handler": self._get_role,
        }

    def _register_minutes_tools(self) -> None:
        """注册会议纪要工具（P2）"""
        self._tools["create_minutes"] = {
            "description": "从速记/转录创建会议纪要。自动识别意图并生成 DAG 工作流。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "transcript": {"type": "string", "description": "速记/转录内容"},
                    "submitter": {"type": "string", "description": "提交者", "default": ""},
                },
                "required": ["transcript"],
            },
            "handler": self._create_minutes,
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
            elif method == "resources/list":
                result = await self._handle_list_resources(params)
            elif method == "resources/read":
                result = await self._handle_read_resource(params)
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
                "resources": {"listChanged": False},
            },
            "serverInfo": {
                "name": "mdh-tools",
                "version": "1.1.0",
            },
        }

    async def _handle_list_tools(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """处理工具列表请求（含安全过滤）"""
        tools = []
        for name, tool in self._tools.items():
            tools.append({
                "name": name,
                "description": _sanitize_description(tool["description"]),
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

    # ── Phase 3 T3.1: 资源暴露 ──

    async def _handle_list_resources(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """列出可用资源（文件 + prompt）"""
        resources = []

        # 暴露工作区中的关键文件
        import os
        workspace = self._workspace
        for name in ["AGENTS.md", "README.md", "CHANGELOG.md", "PROGRESS.md"]:
            path = os.path.join(workspace, name)
            if os.path.exists(path):
                resources.append({
                    "uri": f"file:///{name}",
                    "name": name,
                    "description": f"项目文档: {name}",
                    "mimeType": "text/markdown",
                })

        # 暴露 skill_packs 目录
        skill_dir = os.path.join(workspace, "skill_packs")
        if os.path.isdir(skill_dir):
            for entry in sorted(os.listdir(skill_dir))[:10]:  # 限制数量
                skill_md = os.path.join(skill_dir, entry, "SKILL.md")
                if os.path.exists(skill_md):
                    resources.append({
                        "uri": f"skill:///{entry}",
                        "name": f"skill:{entry}",
                        "description": f"技能包: {entry}",
                        "mimeType": "text/markdown",
                    })

        # 暴露 prompt 模板
        resources.append({
            "uri": "prompt://system/default",
            "name": "system_prompt",
            "description": "默认系统提示词",
            "mimeType": "text/plain",
        })

        return {"resources": resources}

    async def _handle_read_resource(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """读取资源内容"""
        uri = params.get("uri", "")

        if uri.startswith("file:///"):
            # 读取文件资源
            filename = uri[len("file:///"):]
            import os
            path = os.path.join(self._workspace, filename)
            if os.path.exists(path):
                content = _read_file_safe(path)
                return {
                    "contents": [{
                        "uri": uri,
                        "mimeType": "text/markdown",
                        "text": content,
                    }]
                }
            return {"contents": [{"uri": uri, "text": f"File not found: {filename}"}]}

        elif uri.startswith("skill:///"):
            # 读取技能包
            skill_name = uri[len("skill:///"):]
            import os
            skill_md = os.path.join(self._workspace, "skill_packs", skill_name, "SKILL.md")
            if os.path.exists(skill_md):
                content = _read_file_safe(skill_md)
                return {
                    "contents": [{
                        "uri": uri,
                        "mimeType": "text/markdown",
                        "text": content,
                    }]
                }
            return {"contents": [{"uri": uri, "text": f"Skill not found: {skill_name}"}]}

        elif uri.startswith("prompt://"):
            # 返回 prompt 模板
            return {
                "contents": [{
                    "uri": uri,
                    "mimeType": "text/plain",
                    "text": "You are a helpful AI assistant for the MDH multi-agent system.",
                }]
            }

        return {"contents": [{"uri": uri, "text": f"Unknown resource: {uri}"}]}

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

    # ── Phase 2 P1: 资产 + 市场工具实现 ──

    async def _search_assets(self, keywords: str = "", asset_type: str = "", team_id: str = "") -> str:
        """搜索资产"""
        params = {}
        if keywords:
            params["keywords"] = keywords
        if asset_type:
            params["asset_type"] = asset_type
        if team_id:
            params["team_id"] = team_id
        result = _proxy_rest("GET", "/api/assets/search", params=params)
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _create_artifact(self, name: str, content: str, description: str = "", team_id: str = "") -> str:
        """创建产出物"""
        result = _proxy_rest("POST", "/api/assets/artifacts", json_data={
            "name": name,
            "content": content,
            "description": description,
            "team_id": team_id,
        })
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _list_assets(self, asset_type: str = "", team_id: str = "") -> str:
        """列出资产"""
        params = {}
        if asset_type:
            params["asset_type"] = asset_type
        if team_id:
            params["team_id"] = team_id
        result = _proxy_rest("GET", "/api/assets", params=params)
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _search_shared_experience(self, keywords: str = "", task_type: str = "") -> str:
        """搜索共享经验"""
        params = {}
        if keywords:
            params["keywords"] = keywords
        if task_type:
            params["task_type"] = task_type
        result = _proxy_rest("GET", "/api/marketplace/experience/search", params=params)
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _publish_experience(self, trigger_condition: str, action: str,
                                  keywords: str = "", rule_type: str = "success_pattern") -> str:
        """发布经验到共享池"""
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        result = _proxy_rest("POST", "/api/marketplace/experience/publish", json_data={
            "rule": {
                "trigger_condition": trigger_condition,
                "action": action,
                "keywords": kw_list,
                "rule_type": rule_type,
            },
            "source_project": "mcp",
        })
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _fork_skill_from_marketplace(self, skill_name: str, project_id: str = "current") -> str:
        """从市场 Fork 技能"""
        result = _proxy_rest("POST", "/api/marketplace/skills/fork", json_data={
            "skill_name": skill_name,
            "project_id": project_id,
        })
        return json.dumps(result, ensure_ascii=False, indent=2)

    # ── Phase 2 P2: 角色 + 会议工具实现 ──

    async def _get_roles_config(self) -> str:
        """获取角色配置"""
        result = _proxy_rest("GET", "/api/roles/config")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _get_role(self, role_id: str) -> str:
        """获取角色详情"""
        result = _proxy_rest("GET", f"/api/roles/{role_id}")
        return json.dumps(result, ensure_ascii=False, indent=2)

    async def _create_minutes(self, transcript: str, submitter: str = "") -> str:
        """创建会议纪要"""
        result = _proxy_rest("POST", "/api/minutes", json_data={
            "transcript": transcript,
            "submitter": submitter,
        })
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
