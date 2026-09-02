"""Tests for Prometheus metrics (T2)

Verifies:
- /metrics endpoint returns Prometheus text format
- LLM call counter increments
- Task success counter increments
- Evolution event counter increments
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── 清理 prometheus_client registry 避免重复注册 ──
from prometheus_client import CollectorRegistry, generate_latest

# 使用独立 registry 避免测试间互相污染
_test_registry = CollectorRegistry()


def _reset_prometheus_metrics():
    """重置所有自定义 Prometheus 计数器（使用独立 registry 隔离）"""

    # 重新创建指标对象使用默认 registry（测试间通过 clear 重置）
    # prometheus_client 不支持 unregister 后重新 register 同名指标，
    # 所以我们直接测试默认 registry 的行为


class TestMetricsEndpoint:
    """测试 /metrics 端点"""

    def test_metrics_endpoint_returns_prometheus_format(self):
        """验证 /metrics 返回 Prometheus text format"""
        from fastapi.testclient import TestClient

        from server import app

        client = TestClient(app)
        resp = client.get("/metrics")
        assert resp.status_code == 200
        # Prometheus text format 包含 # HELP 和 # TYPE 行
        body = resp.text
        assert "# HELP" in body
        assert "# TYPE" in body
        # 应包含我们定义的指标
        assert "mdh_llm_calls_total" in body or "mdh_llm_cache_hits_total" in body
        # 应包含 CONTENT_TYPE
        ct = resp.headers.get("content-type", "")
        assert "text/plain" in ct


class TestLLMMetrics:
    """测试 LLM 相关指标"""

    def test_llm_call_counter_increments(self):
        """验证 LLM_CALLS 计数器可以正确递增"""
        from prometheus_metrics import LLM_CALLS

        # 获取当前值
        before = _get_counter_value(LLM_CALLS, {"provider": "test", "model": "test-model", "status": "success"})
        LLM_CALLS.labels(provider="test", model="test-model", status="success").inc()
        after = _get_counter_value(LLM_CALLS, {"provider": "test", "model": "test-model", "status": "success"})
        assert after == before + 1

    def test_llm_cache_hits_increments(self):
        """验证 LLM_CACHE_HITS 计数器可以正确递增"""
        from prometheus_metrics import LLM_CACHE_HITS

        before = _get_simple_counter_value(LLM_CACHE_HITS)
        LLM_CACHE_HITS.inc()
        after = _get_simple_counter_value(LLM_CACHE_HITS)
        assert after == before + 1

    def test_llm_cache_misses_increments(self):
        """验证 LLM_CACHE_MISSES 计数器可以正确递增"""
        from prometheus_metrics import LLM_CACHE_MISSES

        before = _get_simple_counter_value(LLM_CACHE_MISSES)
        LLM_CACHE_MISSES.inc()
        after = _get_simple_counter_value(LLM_CACHE_MISSES)
        assert after == before + 1


class TestTaskMetrics:
    """测试任务相关指标"""

    def test_task_success_counter_increments(self):
        """验证 TASK_SUCCESS 计数器可以正确递增"""
        from prometheus_metrics import TASK_SUCCESS

        before = _get_counter_value(TASK_SUCCESS, {"task_type": "software-dev"})
        TASK_SUCCESS.labels(task_type="software-dev").inc()
        after = _get_counter_value(TASK_SUCCESS, {"task_type": "software-dev"})
        assert after == before + 1

    def test_task_failure_counter_increments(self):
        """验证 TASK_FAILURE 计数器可以正确递增"""
        from prometheus_metrics import TASK_FAILURE

        before = _get_counter_value(TASK_FAILURE, {"task_type": "data-analysis"})
        TASK_FAILURE.labels(task_type="data-analysis").inc()
        after = _get_counter_value(TASK_FAILURE, {"task_type": "data-analysis"})
        assert after == before + 1


class TestEvolutionMetrics:
    """测试进化相关指标"""

    def test_evolution_event_counter_increments(self):
        """验证 EVOLUTION_EVENTS 计数器可以正确递增"""
        from prometheus_metrics import EVOLUTION_EVENTS

        before = _get_counter_value(EVOLUTION_EVENTS, {"event_type": "rule_created"})
        EVOLUTION_EVENTS.labels(event_type="rule_created").inc()
        after = _get_counter_value(EVOLUTION_EVENTS, {"event_type": "rule_created"})
        assert after == before + 1

    def test_xp_granted_increments(self):
        """验证 XP_GRANTED 计数器可以正确递增"""
        from prometheus_metrics import XP_GRANTED

        before = _get_simple_counter_value(XP_GRANTED)
        XP_GRANTED.inc(50)
        after = _get_simple_counter_value(XP_GRANTED)
        assert after == before + 50

    def test_skill_level_ups_increments(self):
        """验证 SKILL_LEVEL_UPS 计数器可以正确递增"""
        from prometheus_metrics import SKILL_LEVEL_UPS

        before = _get_simple_counter_value(SKILL_LEVEL_UPS)
        SKILL_LEVEL_UPS.inc()
        after = _get_simple_counter_value(SKILL_LEVEL_UPS)
        assert after == before + 1


class TestWebSocketMetrics:
    """测试 WebSocket 相关指标"""

    def test_ws_connections_gauge(self):
        """验证 WS_CONNECTIONS 仪表可以设置值"""
        from prometheus_metrics import WS_CONNECTIONS

        WS_CONNECTIONS.set(5)
        # 通过 generate_latest 检查
        output = generate_latest().decode("utf-8")
        assert "mdh_ws_connections_active" in output

    def test_ws_messages_counter_increments(self):
        """验证 WS_MESSAGES 计数器可以正确递增"""
        from prometheus_metrics import WS_MESSAGES

        before = _get_counter_value(WS_MESSAGES, {"direction": "receive"})
        WS_MESSAGES.labels(direction="receive").inc()
        after = _get_counter_value(WS_MESSAGES, {"direction": "receive"})
        assert after == before + 1


class TestCacheIntegration:
    """测试 LLM 缓存与 Prometheus 指标的集成"""

    def test_cache_hit_increments_prometheus_counter(self):
        """验证 LLM 缓存命中时 Prometheus 计数器递增"""
        from llm_cache import LLMCache
        from prometheus_metrics import LLM_CACHE_HITS

        cache = LLMCache(max_size=10)
        cache.put("test prompt", "test response", role="test", model="test")

        before = _get_simple_counter_value(LLM_CACHE_HITS)
        result = cache.get("test prompt", role="test", model="test")
        assert result == "test response"
        after = _get_simple_counter_value(LLM_CACHE_HITS)
        assert after == before + 1

    def test_cache_miss_increments_prometheus_counter(self):
        """验证 LLM 缓存未命中时 Prometheus 计数器递增"""
        from llm_cache import LLMCache
        from prometheus_metrics import LLM_CACHE_MISSES

        cache = LLMCache(max_size=10)

        before = _get_simple_counter_value(LLM_CACHE_MISSES)
        result = cache.get("nonexistent prompt", role="test", model="test")
        assert result is None
        after = _get_simple_counter_value(LLM_CACHE_MISSES)
        assert after == before + 1


class TestA2APostProcessorIntegration:
    """测试 A2A 后处理器与 Prometheus 指标的集成"""

    def test_process_success_increments_task_success(self):
        """验证 A2A 任务成功时 TASK_SUCCESS 计数器递增"""
        import asyncio

        from a2a_post_processor import A2APostProcessor
        from prometheus_metrics import TASK_SUCCESS

        processor = A2APostProcessor()  # 无依赖，纯测指标

        before = _get_counter_value(TASK_SUCCESS, {"task_type": "general"})
        asyncio.run(processor.process(
            task_description="read config file",
            result_text="done",
            success=True,
        ))
        after = _get_counter_value(TASK_SUCCESS, {"task_type": "general"})
        assert after == before + 1

    def test_process_failure_increments_task_failure(self):
        """验证 A2A 任务失败时 TASK_FAILURE 计数器递增"""
        import asyncio

        from a2a_post_processor import A2APostProcessor
        from prometheus_metrics import TASK_FAILURE

        processor = A2APostProcessor()

        before = _get_counter_value(TASK_FAILURE, {"task_type": "general"})
        asyncio.run(processor.process(
            task_description="read config file",
            result_text="error",
            success=False,
        ))
        after = _get_counter_value(TASK_FAILURE, {"task_type": "general"})
        assert after == before + 1


# ── 辅助函数 ──

def _get_counter_value(counter, label_values: dict) -> float:
    """获取带标签的 Counter 当前值"""
    # 通过检查 samples 获取值
    for metric in counter.collect():
        for sample in metric.samples:
            if sample.name == counter._name + "_total" and all(
                sample.labels.get(k) == v for k, v in label_values.items()
            ):
                return sample.value
    return 0.0


def _get_simple_counter_value(counter) -> float:
    """获取无标签的 Counter 当前值"""
    for metric in counter.collect():
        for sample in metric.samples:
            if sample.name == counter._name + "_total":
                return sample.value
    return 0.0
