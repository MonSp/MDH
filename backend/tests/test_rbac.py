"""Tests for RBAC — API key 角色分级"""
import pytest

from rbac import RBACManager


@pytest.fixture
def rbac(tmp_path):
    return RBACManager(str(tmp_path))


class TestRBAC:
    def test_create_key(self, rbac):
        """创建 API key"""
        key = rbac.create_api_key("test-key", "agent")
        assert key.startswith("mdh_")

    def test_verify_key(self, rbac):
        """验证 API key"""
        key = rbac.create_api_key("test-key", "agent")
        info = rbac.verify_key(key)
        assert info is not None
        assert info["name"] == "test-key"
        assert info["role"] == "agent"

    def test_verify_invalid_key(self, rbac):
        """无效 key 返回 None"""
        assert rbac.verify_key("invalid-key") is None

    def test_check_permission_admin(self, rbac):
        """admin 角色有全部权限"""
        assert rbac.check_permission("admin", "DELETE", "/api/anything") is True

    def test_check_permission_agent(self, rbac):
        """agent 角色有执行权限，无管理权限"""
        assert rbac.check_permission("agent", "POST", "/api/tasks") is True
        assert rbac.check_permission("agent", "GET", "/api/tasks") is True

    def test_check_permission_viewer(self, rbac):
        """viewer 角色只有读权限"""
        assert rbac.check_permission("viewer", "GET", "/api/tasks") is True
        assert rbac.check_permission("viewer", "POST", "/api/tasks") is False

    def test_check_permission_invalid_role(self, rbac):
        """无效角色无权限"""
        assert rbac.check_permission("hacker", "GET", "/api/tasks") is False

    def test_list_keys(self, rbac):
        """列出 API key"""
        rbac.create_api_key("key-1", "agent")
        rbac.create_api_key("key-2", "admin")
        keys = rbac.list_keys()
        assert len(keys) == 2

    def test_delete_key(self, rbac):
        """删除 API key"""
        key = rbac.create_api_key("test-key", "agent")
        key_hash = __import__("hashlib").sha256(key.encode()).hexdigest()
        assert rbac.delete_key(key_hash) is True
        assert rbac.verify_key(key) is None

    def test_persistence(self, rbac, tmp_path):
        """持久化"""
        key = rbac.create_api_key("test-key", "agent")
        rbac2 = RBACManager(str(tmp_path))
        assert rbac2.verify_key(key) is not None

    def test_invalid_role_rejected(self, rbac):
        """无效角色被拒绝"""
        with pytest.raises(ValueError):
            rbac.create_api_key("test", "hacker")
