"""Tests for MCP Adapter and MCP Server"""
import pytest
import asyncio
import json
import tempfile
from pathlib import Path

from mcp_adapter import MCPAdapter, MCPServerConfig, MCPTool, load_mcp_configs
from mcp_server import MDHMCPServer


@pytest.fixture
def workspace(tmp_path):
    """创建测试工作区"""
    (tmp_path / "test.txt").write_text("Hello, MCP!", encoding="utf-8")
    (tmp_path / "subdir").mkdir()
    (tmp_path / "subdir" / "nested.txt").write_text("Nested content", encoding="utf-8")
    return tmp_path


@pytest.fixture
def mcp_server(workspace):
    """创建测试 MCP 服务器"""
    return MDHMCPServer(str(workspace))


class TestMDHMCPServer:
    @pytest.mark.asyncio
    async def test_initialize(self, mcp_server):
        """测试初始化"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {},
        })
        assert response["result"]["protocolVersion"] == "2024-11-05"
        assert response["result"]["serverInfo"]["name"] == "mdh-tools"

    @pytest.mark.asyncio
    async def test_list_tools(self, mcp_server):
        """测试工具列表"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {},
        })
        tools = response["result"]["tools"]
        assert len(tools) >= 8  # 至少 8 个内置工具
        tool_names = {t["name"] for t in tools}
        assert "read_file" in tool_names
        assert "write_file" in tool_names
        assert "git_status" in tool_names

    @pytest.mark.asyncio
    async def test_call_tool_read_file(self, mcp_server, workspace):
        """测试读取文件"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "read_file", "arguments": {"path": "test.txt"}},
        })
        content = response["result"]["content"][0]["text"]
        assert content == "Hello, MCP!"

    @pytest.mark.asyncio
    async def test_call_tool_write_file(self, mcp_server, workspace):
        """测试写入文件"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "write_file", "arguments": {"path": "new.txt", "content": "New content"}},
        })
        assert "Written" in response["result"]["content"][0]["text"]
        assert (workspace / "new.txt").read_text() == "New content"

    @pytest.mark.asyncio
    async def test_call_tool_list_directory(self, mcp_server):
        """测试列出目录"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "list_directory", "arguments": {"path": "."}},
        })
        content = response["result"]["content"][0]["text"]
        assert "test.txt" in content
        assert "subdir" in content

    @pytest.mark.asyncio
    async def test_call_tool_not_found(self, mcp_server):
        """测试不存在的工具"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {"name": "nonexistent", "arguments": {}},
        })
        assert response["result"]["isError"] is True

    @pytest.mark.asyncio
    async def test_unknown_method(self, mcp_server):
        """测试未知方法"""
        response = await mcp_server.handle_request({
            "jsonrpc": "2.0",
            "id": 7,
            "method": "unknown/method",
            "params": {},
        })
        assert "error" in response
        assert response["error"]["code"] == -32601


class TestMCPAdapter:
    def test_get_all_tools_empty(self):
        """无配置时工具列表为空"""
        adapter = MCPAdapter([])
        assert adapter.get_all_tools() == []

    def test_get_tool_definitions_empty(self):
        """无配置时工具定义为空"""
        adapter = MCPAdapter([])
        assert adapter.get_tool_definitions() == []

    def test_has_tool_false(self):
        """不存在的工具返回 False"""
        adapter = MCPAdapter([])
        assert adapter.has_tool("nonexistent") is False


class TestLoadMCPConfigs:
    def test_load_nonexistent_file(self):
        """不存在的文件返回空列表"""
        configs = load_mcp_configs("/nonexistent/path.json")
        assert configs == []

    def test_load_valid_config(self, tmp_path):
        """加载有效配置"""
        config_path = tmp_path / "mcp_servers.json"
        config_path.write_text(json.dumps({
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                    "transport": "stdio",
                }
            }
        }), encoding="utf-8")

        configs = load_mcp_configs(str(config_path))
        assert len(configs) == 1
        assert configs[0].name == "filesystem"
        assert configs[0].command == "npx"
        assert configs[0].transport == "stdio"


class TestMCPTool:
    def test_tool_creation(self):
        """测试工具创建"""
        tool = MCPTool(
            name="test_tool",
            description="A test tool",
            input_schema={"type": "object", "properties": {}},
            server_name="test_server",
        )
        assert tool.name == "test_tool"
        assert tool.server_name == "test_server"
