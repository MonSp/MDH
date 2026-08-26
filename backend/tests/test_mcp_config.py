"""Tests for MCP Config Manager"""
import pytest

from mcp_config import MCPConfigManager, MCPServerEntry


@pytest.fixture
def config_path(tmp_path):
    return str(tmp_path / "mcp_servers.json")


@pytest.fixture
def manager(config_path):
    return MCPConfigManager(config_path)


class TestMCPConfigManager:
    def test_add_server(self, manager):
        """添加服务器"""
        entry = MCPServerEntry(name="test", command="echo", args=["hello"])
        result = manager.add_server(entry)
        assert result.name == "test"
        assert result.command == "echo"

    def test_add_duplicate_raises(self, manager):
        """添加重复名称抛异常"""
        entry = MCPServerEntry(name="test", command="echo")
        manager.add_server(entry)
        with pytest.raises(ValueError, match="已存在"):
            manager.add_server(entry)

    def test_list_servers(self, manager):
        """列出服务器"""
        manager.add_server(MCPServerEntry(name="a", command="echo"))
        manager.add_server(MCPServerEntry(name="b", command="echo"))
        servers = manager.list_servers()
        assert len(servers) == 2

    def test_get_server(self, manager):
        """获取单个服务器"""
        manager.add_server(MCPServerEntry(name="test", command="echo"))
        entry = manager.get_server("test")
        assert entry is not None
        assert entry.name == "test"

    def test_get_nonexistent(self, manager):
        """获取不存在的服务器返回 None"""
        assert manager.get_server("nonexistent") is None

    def test_update_server(self, manager):
        """更新服务器配置"""
        manager.add_server(MCPServerEntry(name="test", command="echo"))
        result = manager.update_server("test", {"command": "ls", "args": ["-la"]})
        assert result is not None
        assert result.command == "ls"
        assert result.args == ["-la"]

    def test_update_nonexistent(self, manager):
        """更新不存在的服务器返回 None"""
        assert manager.update_server("nonexistent", {}) is None

    def test_update_cannot_change_name(self, manager):
        """不能通过 update 修改 name"""
        manager.add_server(MCPServerEntry(name="test", command="echo"))
        result = manager.update_server("test", {"name": "new_name"})
        assert result.name == "test"  # name 不变

    def test_delete_server(self, manager):
        """删除服务器"""
        manager.add_server(MCPServerEntry(name="test", command="echo"))
        assert manager.delete_server("test") is True
        assert manager.get_server("test") is None

    def test_delete_nonexistent(self, manager):
        """删除不存在的服务器返回 False"""
        assert manager.delete_server("nonexistent") is False

    def test_persistence(self, config_path):
        """配置持久化"""
        manager1 = MCPConfigManager(config_path)
        manager1.add_server(MCPServerEntry(name="test", command="echo"))

        manager2 = MCPConfigManager(config_path)
        entry = manager2.get_server("test")
        assert entry is not None
        assert entry.command == "echo"

    def test_update_status(self, manager):
        """更新连接状态"""
        manager.add_server(MCPServerEntry(name="test", command="echo"))
        manager.update_status("test", "connected", tools_count=5)
        entry = manager.get_server("test")
        assert entry.status == "connected"
        assert entry.tools_count == 5
        assert entry.last_connected != ""

    def test_update_status_error(self, manager):
        """更新错误状态"""
        manager.add_server(MCPServerEntry(name="test", command="echo"))
        manager.update_status("test", "error", error="连接失败")
        entry = manager.get_server("test")
        assert entry.status == "error"
        assert entry.error_message == "连接失败"


class TestMCPServerEntry:
    def test_to_dict(self):
        entry = MCPServerEntry(name="test", command="echo")
        d = entry.to_dict()
        assert d["name"] == "test"
        assert d["command"] == "echo"
        assert d["enabled"] is True

    def test_from_dict(self):
        data = {"name": "test", "command": "echo", "args": ["-n"], "extra": "ignored"}
        entry = MCPServerEntry.from_dict(data)
        assert entry.name == "test"
        assert entry.args == ["-n"]
        assert not hasattr(entry, "extra")

    @pytest.mark.asyncio
    async def test_test_connection_invalid_command(self, manager):
        """测试连接不存在的命令"""
        manager.add_server(MCPServerEntry(name="test", command="/nonexistent/command"))
        result = await manager.test_connection("test")
        assert result["success"] is False
        assert "不存在" in result["error"]

    @pytest.mark.asyncio
    async def test_test_connection_nonexistent_server(self, manager):
        """测试不存在的服务器"""
        result = await manager.test_connection("nonexistent")
        assert result["success"] is False
