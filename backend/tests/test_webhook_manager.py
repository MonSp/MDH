"""Tests for WebhookManager — Webhook 集成"""
import pytest

from webhook_manager import SUPPORTED_EVENTS, WebhookManager


@pytest.fixture
def mgr(tmp_path):
    return WebhookManager(str(tmp_path))


class TestWebhookManager:
    def test_subscribe(self, mgr):
        """注册 webhook"""
        sub = mgr.subscribe("https://example.com/hook", ["task.completed"])
        assert sub.sub_id.startswith("wh-")
        assert sub.url == "https://example.com/hook"
        assert "task.completed" in sub.events
        assert sub.secret

    def test_list_subscriptions(self, mgr):
        """列出订阅"""
        mgr.subscribe("https://a.com/hook", ["task.completed"])
        mgr.subscribe("https://b.com/hook", ["agent.promoted"])
        subs = mgr.list_subscriptions()
        assert len(subs) == 2

    def test_unsubscribe(self, mgr):
        """取消订阅"""
        sub = mgr.subscribe("https://a.com/hook", ["task.completed"])
        assert mgr.unsubscribe(sub.sub_id) is True
        assert len(mgr.list_subscriptions()) == 0

    def test_unsubscribe_nonexistent(self, mgr):
        """取消不存在的订阅"""
        assert mgr.unsubscribe("nonexistent") is False

    def test_trigger_no_subscribers(self, mgr):
        """无订阅者时触发返回 0"""
        assert mgr.trigger("task.completed", {"task_id": "t1"}) == 0

    def test_trigger_matching_event(self, mgr):
        """匹配事件类型"""
        mgr.subscribe("https://example.com/hook", ["task.completed", "agent.promoted"])
        # 触发不匹配的事件
        assert mgr.trigger("rule.demoted", {}) == 0

    def test_delivery_log(self, mgr):
        """投递日志记录"""
        sub = mgr.subscribe("https://example.com/hook", ["task.completed"])
        # 触发事件（URL 不存在会失败，但日志应该记录）
        mgr.trigger("task.completed", {"task_id": "t1"})
        log = mgr.get_delivery_log(sub.sub_id)
        assert len(log) == 1
        assert log[0]["event_type"] == "task.completed"

    def test_stats(self, mgr):
        """投递统计"""
        mgr.subscribe("https://a.com/hook", ["task.completed"])
        mgr.trigger("task.completed", {})
        stats = mgr.get_stats()
        assert stats["total_deliveries"] >= 1
        assert stats["active_subscriptions"] == 1
        assert "task.completed" in stats["supported_events"]

    def test_persistence(self, mgr, tmp_path):
        """持久化"""
        mgr.subscribe("https://a.com/hook", ["task.completed"])
        mgr2 = WebhookManager(str(tmp_path))
        assert len(mgr2.list_subscriptions()) == 1

    def test_supported_events(self):
        """支持的事件类型"""
        assert len(SUPPORTED_EVENTS) >= 5
        assert "task.completed" in SUPPORTED_EVENTS
