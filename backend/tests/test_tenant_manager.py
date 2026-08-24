"""Tests for TenantManager — 多租户基础"""
import pytest
from tenant_manager import TenantManager


@pytest.fixture
def mgr(tmp_path):
    return TenantManager(str(tmp_path))


class TestTenantManager:
    def test_create_tenant(self, mgr):
        """创建租户"""
        tenant = mgr.create_tenant("研发部", "软件开发团队")
        assert tenant.name == "研发部"
        assert tenant.tenant_id.startswith("t-")
        assert tenant.api_key.startswith("mdh_tenant_")
        assert tenant.is_active is True

    def test_get_tenant(self, mgr):
        """获取租户"""
        tenant = mgr.create_tenant("测试部")
        loaded = mgr.get_tenant(tenant.tenant_id)
        assert loaded is not None
        assert loaded.name == "测试部"

    def test_get_tenant_by_api_key(self, mgr):
        """通过 API key 获取租户"""
        tenant = mgr.create_tenant("设计部")
        found = mgr.get_tenant_by_api_key(tenant.api_key)
        assert found is not None
        assert found.tenant_id == tenant.tenant_id

    def test_list_tenants(self, mgr):
        """列出所有租户"""
        mgr.create_tenant("A部")
        mgr.create_tenant("B部")
        tenants = mgr.list_tenants()
        assert len(tenants) == 2

    def test_deactivate_tenant(self, mgr):
        """停用租户"""
        tenant = mgr.create_tenant("临时团队")
        assert mgr.deactivate_tenant(tenant.tenant_id) is True
        loaded = mgr.get_tenant(tenant.tenant_id)
        assert loaded.is_active is False

    def test_deactivated_tenant_not_found_by_api_key(self, mgr):
        """停用的租户无法通过 API key 获取"""
        tenant = mgr.create_tenant("临时团队")
        mgr.deactivate_tenant(tenant.tenant_id)
        assert mgr.get_tenant_by_api_key(tenant.api_key) is None

    def test_regenerate_api_key(self, mgr):
        """重新生成 API key（旧 key 宽限期内仍可用）"""
        tenant = mgr.create_tenant("测试")
        old_key = tenant.api_key
        new_key = mgr.regenerate_api_key(tenant.tenant_id)
        assert new_key is not None
        assert new_key != old_key
        assert mgr.get_tenant_by_api_key(new_key) is not None
        # 旧 key 在 5 分钟宽限期内仍可用
        assert mgr.get_tenant_by_api_key(old_key) is not None

    def test_persistence(self, mgr, tmp_path):
        """持久化"""
        tenant = mgr.create_tenant("持久化测试")
        mgr2 = TenantManager(str(tmp_path))
        loaded = mgr2.get_tenant(tenant.tenant_id)
        assert loaded is not None
        assert loaded.name == "持久化测试"

    def test_nonexistent_tenant(self, mgr):
        """不存在的租户返回 None"""
        assert mgr.get_tenant("nonexistent") is None
        assert mgr.get_tenant_by_api_key("fake-key") is None
