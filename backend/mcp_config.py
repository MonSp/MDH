"""
MCP Config Manager — MCP 服务器配置管理

管理 MCP 服务器的增删改查和连接测试。
配置持久化到 data/mcp_servers.json。
"""

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

logger = logging.getLogger("mcp_config")


@dataclass
class MCPServerEntry:
    """MCP 服务器配置条目"""
    name: str
    transport: str = "stdio"  # "stdio" | "streamable-http"
    command: str = ""
    args: list[str] = field(default_factory=list)
    url: str = ""
    env: dict[str, str] = field(default_factory=dict)
    enabled: bool = True
    status: str = "disconnected"  # "connected" | "disconnected" | "error"
    tools_count: int = 0
    last_connected: str = ""
    error_message: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "MCPServerEntry":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class MCPConfigManager:
    """MCP 服务器配置管理器

    用法：
        manager = MCPConfigManager("data/mcp_servers.json")

        # 添加服务器
        manager.add_server(MCPServerEntry(name="filesystem", command="npx", args=["-y", "@modelcontextprotocol/server-fs"]))

        # 列出服务器
        servers = manager.list_servers()

        # 测试连接
        result = await manager.test_connection("filesystem")
    """

    def __init__(self, config_path: str):
        self._config_path = Path(config_path)
        self._servers: dict[str, MCPServerEntry] = {}
        self._load()

    def _load(self) -> None:
        """从 JSON 文件加载配置"""
        if not self._config_path.exists():
            self._servers = {}
            return

        try:
            data = json.loads(self._config_path.read_text(encoding="utf-8"))
            self._servers = {
                name: MCPServerEntry.from_dict(entry)
                for name, entry in data.get("mcpServers", {}).items()
            }
        except Exception as e:
            logger.warning("加载 MCP 配置失败: %s", e)
            self._servers = {}

    def _save(self) -> None:
        """保存配置到 JSON 文件"""
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "mcpServers": {
                name: entry.to_dict()
                for name, entry in self._servers.items()
            }
        }
        self._config_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def list_servers(self) -> list[MCPServerEntry]:
        """列出所有配置的服务器"""
        return list(self._servers.values())

    def get_server(self, name: str) -> MCPServerEntry | None:
        """获取单个服务器配置"""
        return self._servers.get(name)

    def add_server(self, entry: MCPServerEntry) -> MCPServerEntry:
        """添加服务器配置"""
        if entry.name in self._servers:
            raise ValueError(f"服务器已存在: {entry.name}")

        self._servers[entry.name] = entry
        self._save()
        logger.info("添加 MCP 服务器: %s", entry.name)
        return entry

    def update_server(self, name: str, updates: dict) -> MCPServerEntry | None:
        """更新服务器配置"""
        entry = self._servers.get(name)
        if not entry:
            return None

        for key, value in updates.items():
            if hasattr(entry, key) and key != "name":
                setattr(entry, key, value)

        self._save()
        logger.info("更新 MCP 服务器: %s", name)
        return entry

    def delete_server(self, name: str) -> bool:
        """删除服务器配置"""
        if name not in self._servers:
            return False

        del self._servers[name]
        self._save()
        logger.info("删除 MCP 服务器: %s", name)
        return True

    def update_status(self, name: str, status: str, tools_count: int = 0, error: str = "") -> None:
        """更新服务器连接状态"""
        entry = self._servers.get(name)
        if not entry:
            return

        entry.status = status
        entry.tools_count = tools_count
        entry.error_message = error
        if status == "connected":
            entry.last_connected = time.strftime("%Y-%m-%d %H:%M:%S")
        self._save()

    async def test_connection(self, name: str) -> dict:
        """测试服务器连接

        Returns:
            {"success": bool, "tools_count": int, "error": str}
        """
        entry = self._servers.get(name)
        if not entry:
            return {"success": False, "tools_count": 0, "error": "服务器不存在"}

        if entry.transport == "stdio":
            return await self._test_stdio_connection(entry)
        elif entry.transport == "streamable-http":
            return await self._test_http_connection(entry)
        else:
            return {"success": False, "tools_count": 0, "error": f"不支持的传输: {entry.transport}"}

    async def _test_stdio_connection(self, entry: MCPServerEntry) -> dict:
        """测试 Stdio 连接"""
        import asyncio
        import json as json_mod

        if not entry.command:
            return {"success": False, "tools_count": 0, "error": "未配置命令"}

        try:
            env = {**os.environ, **entry.env} if entry.env else None
            proc = await asyncio.create_subprocess_exec(
                entry.command,
                *entry.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )

            # 发送 initialize 请求
            init_request = json_mod.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "mdh-test", "version": "1.0.0"},
                },
            }) + "\n"

            proc.stdin.write(init_request.encode())
            await proc.stdin.drain()

            # 读取响应
            response_line = await asyncio.wait_for(proc.stdout.readline(), timeout=10)

            # 发送 initialized 通知
            initialized = json_mod.dumps({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
            }) + "\n"
            proc.stdin.write(initialized.encode())
            await proc.stdin.drain()

            # 发送 tools/list 请求
            tools_request = json_mod.dumps({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {},
            }) + "\n"
            proc.stdin.write(tools_request.encode())
            await proc.stdin.drain()

            tools_response = await asyncio.wait_for(proc.stdout.readline(), timeout=10)
            tools_data = json_mod.loads(tools_response.decode())
            tools_count = len(tools_data.get("result", {}).get("tools", []))

            # 关闭进程
            proc.terminate()
            await proc.wait()

            self.update_status(entry.name, "connected", tools_count)
            return {"success": True, "tools_count": tools_count, "error": ""}

        except asyncio.TimeoutError:
            self.update_status(entry.name, "error", error="连接超时")
            return {"success": False, "tools_count": 0, "error": "连接超时"}
        except FileNotFoundError:
            self.update_status(entry.name, "error", error=f"命令不存在: {entry.command}")
            return {"success": False, "tools_count": 0, "error": f"命令不存在: {entry.command}"}
        except Exception as e:
            self.update_status(entry.name, "error", error=str(e))
            return {"success": False, "tools_count": 0, "error": str(e)}

    async def _test_http_connection(self, entry: MCPServerEntry) -> dict:
        """测试 HTTP 连接"""
        import aiohttp

        if not entry.url:
            return {"success": False, "tools_count": 0, "error": "未配置 URL"}

        try:
            async with aiohttp.ClientSession() as session:
                # 发送 initialize 请求
                payload = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "mdh-test", "version": "1.0.0"},
                    },
                }
                async with session.post(entry.url, json=payload, timeout=10) as resp:
                    if resp.status != 200:
                        return {"success": False, "tools_count": 0, "error": f"HTTP {resp.status}"}

                # 发送 tools/list 请求
                tools_payload = {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/list",
                    "params": {},
                }
                async with session.post(entry.url, json=tools_payload, timeout=10) as resp:
                    data = await resp.json()
                    tools_count = len(data.get("result", {}).get("tools", []))

            self.update_status(entry.name, "connected", tools_count)
            return {"success": True, "tools_count": tools_count, "error": ""}

        except Exception as e:
            self.update_status(entry.name, "error", error=str(e))
            return {"success": False, "tools_count": 0, "error": str(e)}
