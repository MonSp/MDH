"""Tests for agent_pool.py — AgentPool management"""
import pytest
from unittest.mock import MagicMock, patch
from key_manager import KeyManager


@pytest.fixture
def key_manager():
    km = KeyManager()
    return km


@pytest.fixture
def pool(key_manager):
    from agent_pool import AgentPool
    return AgentPool(key_manager=key_manager, max_instances_per_role=2)


class TestAgentPool:
    def test_create_team(self, pool):
        """create_team 应创建所有成员"""
        template = [
            {"id": "a1", "name": "Agent-1", "role": "executor", "capabilities": ["code_gen"]},
            {"id": "a2", "name": "Agent-2", "role": "reviewer", "capabilities": ["testing"]},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            ids = pool.create_team(template)

        assert len(ids) == 2
        assert "a1" in ids
        assert "a2" in ids
        assert pool.get_agent_by_id("a1") is not None
        assert pool.get_agent_by_id("a2") is not None

    def test_get_agent_by_role_round_robin(self, pool):
        """get_agent_by_role 应轮询返回不同实例"""
        template = [
            {"id": "e1", "name": "Exec-1", "role": "executor"},
            {"id": "e2", "name": "Exec-2", "role": "executor"},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        a1 = pool.get_agent_by_role("executor")
        a2 = pool.get_agent_by_role("executor")
        assert a1 is not None
        assert a2 is not None
        assert a1.id != a2.id, "轮询应返回不同实例"

    def test_get_agent_by_role_returns_none_for_missing(self, pool):
        """不存在的角色应返回 None"""
        assert pool.get_agent_by_role("nonexistent") is None

    def test_get_agent_by_role_resets_unhealthy(self, pool):
        """所有实例不健康时应自动重置"""
        template = [{"id": "e1", "name": "Exec-1", "role": "executor"}]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        # 标记为不健康
        instance = pool.get_agent_by_id("e1")
        instance.healthy = False

        # 应自动重置并返回
        result = pool.get_agent_by_role("executor")
        assert result is not None
        assert result.healthy is True

    def test_get_agents_by_capability(self, pool):
        """get_agents_by_capability 应返回匹配的实例"""
        template = [
            {"id": "e1", "name": "Exec-1", "role": "executor", "capabilities": ["code_gen", "testing"]},
            {"id": "e2", "name": "Exec-2", "role": "executor", "capabilities": ["code_gen"]},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        code_gen_agents = pool.get_agents_by_capability("code_gen")
        assert len(code_gen_agents) == 2

        testing_agents = pool.get_agents_by_capability("testing")
        assert len(testing_agents) == 1
        assert testing_agents[0].id == "e1"

    def test_mark_unhealthy(self, pool):
        """mark_unhealthy 应标记实例为不健康"""
        template = [{"id": "e1", "name": "Exec-1", "role": "executor"}]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        assert pool.mark_unhealthy("e1") is True
        assert pool.get_agent_by_id("e1").healthy is False
        assert pool.get_agent_by_id("e1").error_count == 1
        assert pool.mark_unhealthy("nonexistent") is False

    def test_remove_agent(self, pool):
        """remove_agent 应移除指定实例"""
        template = [
            {"id": "e1", "name": "Exec-1", "role": "executor"},
            {"id": "e2", "name": "Exec-2", "role": "executor"},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        assert pool.remove_agent("e1") is True
        assert pool.get_agent_by_id("e1") is None
        assert pool.get_agent_by_id("e2") is not None
        assert pool.remove_agent("nonexistent") is False

    def test_get_pool_status(self, pool):
        """get_pool_status 应返回正确的统计"""
        template = [
            {"id": "e1", "name": "Exec-1", "role": "executor", "capabilities": ["code_gen"]},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        status = pool.get_pool_status()
        assert status["total_instances"] == 1
        assert status["healthy_instances"] == 1
        assert status["unhealthy_instances"] == 0
        assert "executor" in status["roles"]
        assert status["roles"]["executor"]["total"] == 1

    def test_clear(self, pool):
        """clear 应清空所有实例"""
        template = [{"id": "e1", "name": "Exec-1", "role": "executor"}]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        pool.clear()
        assert pool.get_all_agents() == []
        assert pool.get_pool_status()["total_instances"] == 0

    def test_scale_up(self, pool):
        """scale_up 应创建新实例"""
        template = [{"id": "e1", "name": "Exec-1", "role": "executor"}]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        new_ids = pool.scale_up("executor", 1)
        assert len(new_ids) == 1
        assert pool.get_pool_status()["roles"]["executor"]["total"] == 2

    def test_scale_up_respects_max(self, pool):
        """scale_up 不应超过最大实例数"""
        template = [{"id": "e1", "name": "Exec-1", "role": "executor"}]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        # max_instances_per_role=2, already have 1
        new_ids = pool.scale_up("executor", 5)
        assert len(new_ids) == 1  # only 1 more allowed
        assert pool.get_pool_status()["roles"]["executor"]["total"] == 2

    def test_scale_down(self, pool):
        """scale_down 应移除实例"""
        template = [
            {"id": "e1", "name": "Exec-1", "role": "executor"},
            {"id": "e2", "name": "Exec-2", "role": "executor"},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        removed = pool.scale_down("executor", 1)
        assert len(removed) == 1
        assert pool.get_pool_status()["roles"]["executor"]["total"] == 1

    def test_get_agent_by_id_nonexistent(self, pool):
        """不存在的 ID 应返回 None"""
        assert pool.get_agent_by_id("nonexistent") is None

    def test_get_all_agents(self, pool):
        """get_all_agents 应返回所有实例"""
        template = [
            {"id": "e1", "name": "Exec-1", "role": "executor"},
            {"id": "e2", "name": "Rev-1", "role": "reviewer"},
        ]
        with patch("agent_pool.PROVIDER_REGISTRY", {"deepseek": {
            "credential_cls": MagicMock,
            "credential_kwargs": lambda s: {},
            "formatter_cls": MagicMock,
            "model_cls": MagicMock,
            "default_model": "deepseek-chat",
        }}):
            pool.create_team(template)

        all_agents = pool.get_all_agents()
        assert len(all_agents) == 2
        assert all(a.id in ("e1", "e2") for a in all_agents)

    def test_update_role_prompt(self, pool):
        """update_role_prompt 应更新角色提示词"""
        pool.update_role_prompt("executor", "新的执行者提示词")
        assert pool._role_prompts["executor"] == "新的执行者提示词"

    def test_scale_down_nonexistent_role(self, pool):
        """缩容不存在的角色应返回空列表"""
        removed = pool.scale_down("nonexistent", 1)
        assert removed == []

    def test_scale_up_nonexistent_role(self, pool):
        """扩容不存在的角色应返回空列表"""
        new_ids = pool.scale_up("nonexistent", 1)
        assert new_ids == []

    @pytest.mark.asyncio
    async def test_health_check_with_no_agents(self, pool):
        """无 agent 时健康检查应返回空结果"""
        results = await pool.health_check()
        assert results == {}
