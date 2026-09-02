"""Tests for LLM cost tracker"""
import pytest

from llm_cost_tracker import LLMCostTracker


@pytest.fixture
def tracker(tmp_path):
    return LLMCostTracker(str(tmp_path))


class TestLLMCostTracker:
    def test_record_call(self, tracker):
        record = tracker.record_call(
            model="deepseek-chat", role="agent_turn",
            agent_id="agent-1", input_tokens=1000, output_tokens=500,
        )
        assert record.input_tokens == 1000
        assert record.output_tokens == 500
        assert record.cost_usd > 0
        assert record.success is True

    def test_cost_estimation_deepseek(self, tracker):
        record = tracker.record_call(
            model="deepseek-chat", role="test",
            input_tokens=1_000_000, output_tokens=1_000_000,
        )
        # deepseek-chat: input=0.14, output=0.28 per 1M tokens
        expected = (0.14 + 0.28)
        assert abs(record.cost_usd - expected) < 0.01

    def test_cost_estimation_unknown_model(self, tracker):
        record = tracker.record_call(
            model="unknown-model", role="test",
            input_tokens=1_000_000, output_tokens=1_000_000,
        )
        # default pricing: input=1.0, output=2.0 per 1M tokens
        expected = 3.0
        assert abs(record.cost_usd - expected) < 0.01

    def test_summary_empty(self, tracker):
        summary = tracker.get_summary()
        assert summary["total_calls"] == 0
        assert summary["total_cost_usd"] == 0

    def test_summary_by_role(self, tracker):
        tracker.record_call(model="deepseek-chat", role="agent_turn", input_tokens=100, output_tokens=50)
        tracker.record_call(model="deepseek-chat", role="triage", input_tokens=50, output_tokens=20)
        tracker.record_call(model="deepseek-chat", role="agent_turn", input_tokens=200, output_tokens=100)

        summary = tracker.get_summary()
        assert summary["total_calls"] == 3
        assert summary["by_role"]["agent_turn"]["calls"] == 2
        assert summary["by_role"]["triage"]["calls"] == 1

    def test_summary_by_model(self, tracker):
        tracker.record_call(model="deepseek-chat", role="test", input_tokens=100, output_tokens=50)
        tracker.record_call(model="gpt-4o", role="test", input_tokens=100, output_tokens=50)

        summary = tracker.get_summary()
        assert "deepseek-chat" in summary["by_model"]
        assert "gpt-4o" in summary["by_model"]

    def test_summary_by_agent(self, tracker):
        tracker.record_call(model="deepseek-chat", role="test", agent_id="agent-1", input_tokens=100, output_tokens=50)
        tracker.record_call(model="deepseek-chat", role="test", agent_id="agent-2", input_tokens=100, output_tokens=50)

        summary = tracker.get_summary()
        assert "agent-1" in summary["by_agent"]
        assert "agent-2" in summary["by_agent"]

    def test_persistence(self, tracker, tmp_path):
        tracker.record_call(model="deepseek-chat", role="test", input_tokens=100, output_tokens=50)

        tracker2 = LLMCostTracker(str(tmp_path))
        assert tracker2.get_summary()["total_calls"] == 1

    def test_get_records(self, tracker):
        for i in range(5):
            tracker.record_call(model="deepseek-chat", role="test", input_tokens=100, output_tokens=50)
        records = tracker.get_records(limit=3)
        assert len(records) == 3
        # 最近的在前
        assert records[0]["timestamp"] >= records[1]["timestamp"]

    def test_record_failure(self, tracker):
        record = tracker.record_call(
            model="deepseek-chat", role="test",
            input_tokens=0, output_tokens=0, success=False,
        )
        assert record.success is False
        assert record.cost_usd == 0
