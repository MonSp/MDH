"""v1.6 端到端集成测试 — SQLite + 缓存 + RBAC + Webhook 全链路"""

import os
import pytest
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def data_dir(tmp_path):
    d = tmp_path / "data"
    (d / "agent_profiles").mkdir(parents=True)
    (d / "experience" / "rules").mkdir(parents=True)
    (d / "agent_memory").mkdir(parents=True)
    return str(d)


class TestSQLiteCacheIntegration:
    """SQLite + 缓存集成"""

    def test_profile_cached_after_read(self, data_dir):
        """读取 profile 后缓存生效"""
        from agent_profile_manager import AgentProfileManager
        from cache import get_cache

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        mgr.get_or_create("a1", "Agent-1", department="dept-software")

        # 第一次读取（缓存 miss）
        p1 = mgr.get_profile("a1")
        assert p1 is not None

        # 第二次读取（缓存 hit）
        cache = get_cache()
        cached = cache.get("profile:a1")
        assert cached is not None
        assert cached.agent_id == "a1"

    def test_cache_invalidated_on_save(self, data_dir):
        """写入后缓存失效"""
        from agent_profile_manager import AgentProfileManager
        from cache import get_cache

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        mgr.get_or_create("a1", "Agent-1")

        # 读取（缓存）
        mgr.get_profile("a1")
        assert get_cache().get("profile:a1") is not None

        # 写入（缓存失效）
        p = mgr.get_profile("a1")
        p.total_xp = 100
        mgr.save_profile(p)
        assert get_cache().get("profile:a1") is None


class TestSQLiteConcurrency:
    """SQLite 并发安全"""

    def test_concurrent_xp_grant(self, data_dir):
        """多线程 XP 授予不崩溃"""
        import threading
        from agent_profile_manager import AgentProfileManager

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        mgr.get_or_create("a1", "Agent-1")

        def grant():
            mgr.grant_xp("a1", "backend_dev", True, 8.0, 3, {"xp_thresholds": [100, 300, 600]})

        threads = [threading.Thread(target=grant) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        p = mgr.get_profile("a1")
        assert p.total_xp > 0


class TestMultiModelRouting:
    """多模型路由"""

    def test_model_for_complex_task(self):
        """复杂任务选大模型"""
        from model_registry import ModelRegistry
        registry = ModelRegistry()
        model = registry.get_model_for_task(5)
        assert model.tier == "big"

    def test_model_for_simple_task(self):
        """简单任务选小模型"""
        from model_registry import ModelRegistry
        registry = ModelRegistry()
        model = registry.get_model_for_task(1)
        assert model.tier == "small"

    def test_fallback_chain(self):
        """降级链存在"""
        from model_registry import ModelRegistry
        registry = ModelRegistry()
        chain = registry.get_fallback_chain("gpt-4o")
        assert len(chain) >= 2


class TestWebhookIntegration:
    """Webhook 集成"""

    def test_subscribe_and_trigger(self, data_dir):
        """订阅+触发"""
        from webhook_manager import WebhookManager

        mgr = WebhookManager(data_dir)
        sub = mgr.subscribe("https://example.com/hook", ["task.completed"])
        assert sub.sub_id.startswith("wh-")

        # 触发（URL 不存在会失败，但日志记录）
        mgr.trigger("task.completed", {"task_id": "t1"})
        log = mgr.get_delivery_log()
        assert len(log) == 1

    def test_stats_after_trigger(self, data_dir):
        """触发后统计更新"""
        from webhook_manager import WebhookManager

        mgr = WebhookManager(data_dir)
        mgr.subscribe("https://example.com/hook", ["task.completed"])
        mgr.trigger("task.completed", {"task_id": "t1"})

        stats = mgr.get_stats()
        assert stats["total_deliveries"] >= 1
        assert stats["active_subscriptions"] == 1


class TestTenantIntegration:
    """多租户集成"""

    def test_tenant_lifecycle(self, data_dir):
        """租户完整生命周期"""
        from tenant_manager import TenantManager

        mgr = TenantManager(data_dir)
        tenant = mgr.create_tenant("测试团队", "测试用")
        assert tenant.tenant_id.startswith("t-")

        # 通过 API key 获取
        found = mgr.get_tenant_by_api_key(tenant.api_key)
        assert found.tenant_id == tenant.tenant_id

        # 停用
        mgr.deactivate_tenant(tenant.tenant_id)
        assert mgr.get_tenant_by_api_key(tenant.api_key) is None


class TestEvolutionChainIntegration:
    """进化链集成：创建→有效性→自进化→联动"""

    def test_rule_evolution_end_to_end(self, data_dir):
        """规则从创建到进化的端到端流程"""
        from experience_extractor import ExperienceExtractor, ExperienceRule

        ext = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))

        # 创建规则
        rule = ExperienceRule(
            rule_id="e2e-1", trigger_condition="frontend task", action="use React hooks",
            note="", source_task_id="t1", source_task_type="frontend",
            rule_type="success_pattern", status="approved",
            keywords=["react", "frontend"], created_at="now",
            effectiveness_score=0.8, usage_count=5, success_count=4,
        )
        ext._save_rule(rule)

        # 检索
        retrieved = ext.retrieve_relevant_rules("frontend", ["react"])
        assert any(r.rule_id == "e2e-1" for r in retrieved)

        # 多次失败触发进化
        for _ in range(15):
            ext.update_rule_effectiveness("e2e-1", False)

        loaded = ext._load_rule("e2e-1")
        assert loaded.status in ("evolved", "pending_review")

        # 进化链追踪
        chain = ext.get_evolution_chain("e2e-1")
        assert len(chain) >= 2
