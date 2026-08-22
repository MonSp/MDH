"""Tests for AgentOptimizer — Agent 自省优化"""
import json
import os
import pytest
from agent_optimizer import AgentOptimizer


@pytest.fixture
def optimizer(tmp_path):
    # 创建模拟的 agent profiles
    profiles_dir = tmp_path / "agent_profiles"
    profiles_dir.mkdir()

    # 高表现 agent
    (profiles_dir / "agent-1.json").write_text(json.dumps({
        "agent_id": "agent-1", "career_stage": "mid", "total_xp": 500, "department": "dept-software",
        "skill_progress": {
            "backend_dev": {"level": 2, "xp": 200, "usage_count": 10, "success_count": 8, "avg_review_score": 8.0},
            "frontend_dev": {"level": 1, "xp": 100, "usage_count": 5, "success_count": 3, "avg_review_score": 7.0},
        }
    }), encoding="utf-8")

    # 弱表现 agent
    (profiles_dir / "agent-2.json").write_text(json.dumps({
        "agent_id": "agent-2", "career_stage": "junior", "total_xp": 50, "department": "dept-software",
        "skill_progress": {
            "backend_dev": {"level": 0, "xp": 20, "usage_count": 5, "success_count": 1, "avg_review_score": 4.0},
        }
    }), encoding="utf-8")

    return AgentOptimizer(str(tmp_path))


class TestAgentOptimizer:
    def test_analyze_agent_performance(self, optimizer):
        """分析 agent 表现"""
        result = optimizer.analyze_agent("agent-1")
        assert result["agent_id"] == "agent-1"
        assert result["performance"]["total_tasks"] == 15
        assert result["performance"]["overall_success_rate"] > 0.7

    def test_analyze_strong_skills(self, optimizer):
        """识别强项技能"""
        result = optimizer.analyze_agent("agent-1")
        assert len(result["strong_skills"]) >= 1
        assert result["strong_skills"][0]["skill_id"] == "backend_dev"

    def test_analyze_weak_skills(self, optimizer):
        """识别弱项技能"""
        result = optimizer.analyze_agent("agent-2")
        assert len(result["weak_skills"]) >= 1
        assert result["weak_skills"][0]["skill_id"] == "backend_dev"

    def test_recommendations(self, optimizer):
        """生成优化建议"""
        result = optimizer.analyze_agent("agent-2")
        recs = result["recommendations"]
        assert len(recs) > 0
        weak_recs = [r for r in recs if r["type"] == "weak_skill"]
        assert len(weak_recs) >= 1

    def test_promotion_recommendation(self, optimizer):
        """晋升建议"""
        result = optimizer.analyze_agent("agent-1")
        recs = result["recommendations"]
        # agent-1 有 2 个中级技能，但 stage 是 mid，不需要晋升建议
        # 但应该有强项巩固建议
        strong_recs = [r for r in recs if r["type"] == "strong_skill"]
        assert len(strong_recs) >= 1

    def test_all_agents_summary(self, optimizer):
        """所有 agent 汇总"""
        summary = optimizer.get_all_agents_summary()
        assert summary["total_agents"] == 2
        assert summary["top_performer"]["agent_id"] == "agent-1"
        assert len(summary["needs_attention"]) >= 1

    def test_analyze_nonexistent(self, optimizer):
        """不存在的 agent"""
        result = optimizer.analyze_agent("nonexistent")
        assert "error" in result

    def test_optimization_persistence(self, optimizer, tmp_path):
        """优化记录持久化"""
        optimizer.analyze_agent("agent-1")
        optimizer2 = AgentOptimizer(str(tmp_path))
        assert "agent-1" in optimizer2._optimizations
