"""
Critic Agent 测试
"""

import json
import os
import tempfile

import pytest

from collaboration.critic_agent import CriticAgent, CriticResult


class TestCriticAgent:
    """CriticAgent测试类"""

    def setup_method(self):
        self.temp_dir = tempfile.mkdtemp()
        self.log_path = os.path.join(self.temp_dir, "companion_log.json")
        self.agent = CriticAgent(companion_log_path=self.log_path)

    def teardown_method(self):
        if os.path.exists(self.log_path):
            os.unlink(self.log_path)
        os.rmdir(self.temp_dir)

    # ============ 基本功能测试 ============

    def test_review_returns_result(self):
        """review应返回CriticResult"""
        result = self.agent.review({
            "task_description": "测试任务",
            "requirements": [{"title": "需求1", "acceptance": "WHEN 操作 SHALL 响应"}],
        })
        assert isinstance(result, CriticResult)
        assert result.timestamp
        assert result.stage

    def test_review_with_empty_context(self):
        """空上下文应产生findings"""
        result = self.agent.review({})
        assert len(result.findings) > 0

    # ============ 需求完整性检查 ============

    def test_missing_requirements(self):
        """缺少需求列表"""
        result = self.agent.review({
            "task_description": "测试任务",
        })
        assert any("需求" in f for f in result.findings)

    def test_missing_success_criteria(self):
        """缺少成功标准"""
        result = self.agent.review({
            "task_description": "测试任务",
            "requirements": [{"title": "需求1"}],
        })
        assert any("成功标准" in f for f in result.findings)

    def test_requirement_missing_acceptance(self):
        """需求缺少验收标准"""
        result = self.agent.review({
            "task_description": "测试任务",
            "requirements": [{"title": "需求1"}],
            "success_criteria": ["sc1"],
        })
        assert any("验收标准" in f for f in result.findings)

    # ============ 约束一致性检查 ============

    def test_too_many_constraints(self):
        """约束过多"""
        result = self.agent.review({
            "task_description": "测试任务",
            "requirements": [{"title": "需求1", "acceptance": "WHEN 操作 SHALL 响应"}],
            "success_criteria": ["sc1"],
            "constraints": ["c1", "c2", "c3", "c4", "c5", "c6"],
        })
        assert any("约束" in f for f in result.findings)

    def test_time_and_resource_conflict(self):
        """时间和资源约束冲突"""
        result = self.agent.review({
            "task_description": "测试任务",
            "requirements": [{"title": "需求1", "acceptance": "WHEN 操作 SHALL 响应"}],
            "success_criteria": ["sc1"],
            "constraints": ["时间紧迫", "预算有限"],
        })
        assert any("可行性" in f for f in result.findings)

    # ============ 风险检查 ============

    def test_high_risk_keyword(self):
        """高风险关键词"""
        result = self.agent.review({
            "task_description": "重构登录模块",
            "requirements": [{"title": "需求1", "acceptance": "WHEN 操作 SHALL 响应"}],
            "success_criteria": ["sc1"],
        })
        assert any("高风险" in f or "回滚" in f for f in result.findings)

    def test_too_many_dependencies(self):
        """依赖过多"""
        result = self.agent.review({
            "task_description": "测试任务",
            "requirements": [{"title": "需求1", "acceptance": "WHEN 操作 SHALL 响应"}],
            "success_criteria": ["sc1"],
            "dependencies": ["d1", "d2", "d3", "d4"],
        })
        assert any("级联" in f for f in result.findings)

    # ============ 严重程度测试 ============

    def test_severity_low(self):
        """低严重程度"""
        result = self.agent.review({
            "task_description": "添加新功能",
            "requirements": [{"title": "需求1", "acceptance": "WHEN 操作 SHALL 响应"}],
            "success_criteria": ["sc1"],
        })
        # 可能有findings，但severity应该是low或medium
        assert result.severity in ["low", "medium", "high"]

    def test_severity_critical(self):
        """高严重程度"""
        result = self.agent.review({
            "task_description": "重构核心模块",
            "requirements": [],
            "constraints": ["时间紧迫", "预算有限"],
        })
        assert result.severity in ["high", "critical"]

    # ============ 日志写入测试 ============

    def test_log_written(self):
        """审查结果应写入日志"""
        self.agent.review({
            "task_description": "测试任务",
        })

        assert os.path.exists(self.log_path)

        with open(self.log_path, 'r', encoding='utf-8') as f:
            log = json.load(f)

        assert len(log) == 1
        assert log[0]["role"] == "critic"
        assert "findings" in log[0]
        assert "ts" in log[0]

    def test_multiple_reviews_logged(self):
        """多次审查应追加日志"""
        self.agent.review({"task_description": "任务1"})
        self.agent.review({"task_description": "任务2"})

        with open(self.log_path, 'r', encoding='utf-8') as f:
            log = json.load(f)

        assert len(log) == 2

    def test_get_log_entries(self):
        """get_log_entries应返回内存中的日志"""
        self.agent.review({"task_description": "测试任务"})
        entries = self.agent.get_log_entries()
        assert len(entries) == 1

    # ============ 阶段测试 ============

    def test_stage_parameter(self):
        """阶段参数应正确记录"""
        self.agent.review({"task_description": "测试"}, stage="planning")

        with open(self.log_path, 'r', encoding='utf-8') as f:
            log = json.load(f)

        assert log[0]["stage"] == "planning"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
