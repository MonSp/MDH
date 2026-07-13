"""Tests for review_pipeline.py — structured feedback integration with LLM review"""
import pytest
from unittest.mock import MagicMock, AsyncMock
from review_pipeline import ReviewPipeline
from collaboration.planner_agent import PlannerAgent, SubTask


class _FakeMsg:
    def __init__(self, text):
        self.content = [{"type": "text", "text": text}]


@pytest.fixture
def pipeline():
    """Create a ReviewPipeline with mocked LLM models"""
    meeting = MagicMock()
    meeting.agents = []

    def get_model(role):
        m = MagicMock()
        m.reply = AsyncMock(return_value=_FakeMsg("审查通过，没有问题。"))
        return m

    return ReviewPipeline(
        get_model_fn=get_model,
        meeting=meeting,
        planner=PlannerAgent(name="test_planner"),
    )


class TestStructuredFeedbackIntegration:
    """验证 LLM 审查意见整合到结构化反馈"""

    def test_normal_review_approves(self, pipeline):
        """普通审查结果 → approved"""
        result = pipeline._generate_structured_feedback(
            "开发登录页面", "<html>login</html>",
            reviewer_feedback="实现正确，符合需求",
        )
        assert result["status"] == "approved"

    def test_critical_reviewer_feedback_overrides(self, pipeline):
        """审查者发现严重问题 → revision_required 即使 planner 关键词匹配通过"""
        result = pipeline._generate_structured_feedback(
            "开发登录页面", "<html>login</html>",
            reviewer_feedback="严重安全漏洞：SQL注入风险，必须修复",
        )
        assert result["status"] == "revision_required"
        issue_types = [i["type"] for i in result["issues"]]
        assert "logic_error" in issue_types

    def test_critical_keyword_variants(self, pipeline):
        """测试各种严重问题关键词"""
        critical_feedbacks = [
            "这是一个 critical 的 bug",
            "fatal error in authentication",
            "功能存在阻塞问题",
            "不能发布到生产环境",
        ]
        for feedback in critical_feedbacks:
            result = pipeline._generate_structured_feedback(
                "task", "output", reviewer_feedback=feedback,
            )
            assert result["status"] == "revision_required", f"应标记为 revision_required: {feedback}"

    def test_monitor_feedback_does_not_override(self, pipeline):
        """monitor 反馈中的关键词不应触发覆盖（只有 reviewer 的才覆盖）"""
        result = pipeline._generate_structured_feedback(
            "task", "<html>ok</html>",
            reviewer_feedback="实现正确",
            monitor_feedback="严重风险需要关注",
        )
        # monitor_feedback 不触发覆盖逻辑
        assert result["status"] == "approved"

    def test_empty_feedback_no_change(self, pipeline):
        """无审查反馈时行为不变"""
        result = pipeline._generate_structured_feedback(
            "开发登录页面", "<html>login</html>",
        )
        assert result["status"] == "approved"

    def test_non_critical_reviewer_preserves_approved(self, pipeline):
        """审查无严重关键词时保持 approved"""
        result = pipeline._generate_structured_feedback(
            "task", "<html>ok</html>", reviewer_feedback="小问题，建议优化样式",
        )
        assert result["status"] == "approved"
