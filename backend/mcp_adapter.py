"""
MCP Adapter — MCP 协议集成适配器（MCP 集成 Phase 1）

实现 MCP 客户端，连接外部 MCP 服务器并获取工具能力。

支持：
- Stdio 传输（本地进程）
- 工具发现和调用
- 与现有 ToolRegistry 集成
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mcp_adapter")


@dataclass
class MCPServerConfig:
    """MCP 服务器配置"""
    name: str
    transport: str = "stdio"  # "stdio" | "streamable-http"
    command: str = ""
    args: List[str] = field(default_factory=list)
    url: str = ""
    env: Dict[str, str] = field(default_factory=dict)


@dataclass
class MCPTool:
    """MCP 工具定义"""
    name: str
    description: str
    input_schema: Dict[str, Any] = field(default_factory=dict)
    server_name: str = ""


class MCPConnection:
    """MCP 服务器连接基类"""

    async def list_tools(self) -> List[MCPTool]:
        raise NotImplementedError

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        raise NotImplementedError

    async def close(self) -> None:
        pass


class StdioMCPConnection(MCPConnection):
    """Stdio 传输的 MCP 连接"""

    def __init__(self, config: MCPServerConfig):
        self._config = config
        self._process: Optional[asyncio.subprocess.Process] = None
        self._request_id = 0

    async def connect(self) -> None:
        """启动 MCP 服务器进程"""
        env = {**self._config.env} if self._config.env else None
        self._process = await asyncio.create_subprocess_exec(
            self._config.command,
            *self._config.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        # 发送 initialize 请求
        await self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "mdh", "version": "1.0.0"},
        })
        # 发送 initialized 通知
        await self._send_notification("notifications/initialized", {})
        logger.info("已连接 MCP 服务器: %s", self._config.name)

    async def list_tools(self) -> List[MCPTool]:
        """列出服务器提供的工具"""
        result = await self._send_request("tools/list", {})
        tools = []
        for item in result.get("tools", []):
            tools.append(MCPTool(
                name=item.get("name", ""),
                description=item.get("description", ""),
                input_schema=item.get("inputSchema", {}),
                server_name=self._config.name,
            ))
        return tools

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        """调用服务器工具"""
        result = await self._send_request("tools/call", {
            "name": name,
            "arguments": arguments,
        })
        # 提取文本内容
        content = result.get("content", [])
        texts = [item.get("text", "") for item in content if item.get("type") == "text"]
        return "\n".join(texts) if texts else result

    async def close(self) -> None:
        """关闭连接"""
        if self._process:
            self._process.terminate()
            await self._process.wait()
            self._process = None

    async def _send_request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """发送 JSON-RPC 请求"""
        self._request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }

        message = json.dumps(request) + "\n"
        self._process.stdin.write(message.encode())
        await self._process.stdin.drain()

        # 读取响应
        line = await asyncio.wait_for(self._process.stdout.readline(), timeout=30)
        response = json.loads(line.decode())

        if "error" in response:
            raise RuntimeError(f"MCP error: {response['error']}")

        return response.get("result", {})

    async def _send_notification(self, method: str, params: Dict[str, Any]) -> None:
        """发送 JSON-RPC 通知（无响应）"""
        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        message = json.dumps(notification) + "\n"
        self._process.stdin.write(message.encode())
        await self._process.stdin.drain()


class MCPAdapter:
    """MCP 适配器 — 管理多个 MCP 服务器连接

    用法：
        adapter = MCPAdapter([
            MCPServerConfig(name="filesystem", command="npx", args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]),
        ])
        await adapter.initialize()

        # 列出所有工具
        tools = adapter.get_all_tools()

        # 调用工具
        result = await adapter.call_tool("filesystem__read_file", {"path": "/tmp/test.txt"})
    """

    def __init__(self, configs: List[MCPServerConfig]):
        self._configs = configs
        self._connections: Dict[str, MCPConnection] = {}
        self._tools: Dict[str, MCPTool] = {}

    async def initialize(self) -> None:
        """初始化所有 MCP 服务器连接"""
        for config in self._configs:
            try:
                conn = StdioMCPConnection(config)
                await conn.connect()
                self._connections[config.name] = conn

                # 发现工具
                tools = await conn.list_tools()
                for tool in tools:
                    tool_key = f"{config.name}__{tool.name}"
                    self._tools[tool_key] = tool
                    logger.info("发现 MCP 工具: %s (来自 %s)", tool_key, config.name)

            except Exception as e:
                logger.warning("连接 MCP 服务器 %s 失败: %s", config.name, e)

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """调用 MCP 工具"""
        tool = self._tools.get(tool_name)
        if not tool:
            raise ValueError(f"MCP 工具不存在: {tool_name}")

        conn = self._connections.get(tool.server_name)
        if not conn:
            raise RuntimeError(f"MCP 服务器未连接: {tool.server_name}")

        return await conn.call_tool(tool.name, arguments)

    def get_all_tools(self) -> List[MCPTool]:
        """获取所有可用的 MCP 工具"""
        return list(self._tools.values())

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """获取工具定义（用于注入 LLM context）"""
        return [
            {
                "name": key,
                "description": tool.description,
                "parameters": tool.input_schema,
            }
            for key, tool in self._tools.items()
        ]

    def has_tool(self, tool_name: str) -> bool:
        """检查工具是否存在"""
        return tool_name in self._tools

    async def close(self) -> None:
        """关闭所有连接"""
        for conn in self._connections.values():
            await conn.close()
        self._connections.clear()
        self._tools.clear()


def load_mcp_configs(config_path: str) -> List[MCPServerConfig]:
    """从 JSON 文件加载 MCP 服务器配置

    配置文件格式：
    {
        "mcpServers": {
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                "transport": "stdio"
            }
        }
    }
    """
    import os
    if not os.path.exists(config_path):
        return []

    with open(config_path, 'r') as f:
        data = json.load(f)

    configs = []
    for name, server_config in data.get("mcpServers", {}).items():
        configs.append(MCPServerConfig(
            name=name,
            transport=server_config.get("transport", "stdio"),
            command=server_config.get("command", ""),
            args=server_config.get("args", []),
            url=server_config.get("url", ""),
            env=server_config.get("env", {}),
        ))

    return configs
