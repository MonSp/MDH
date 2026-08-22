"""Tests for HumanFeedbackManager — 人机协作反馈回路"""
import pytest
from human_feedback import HumanFeedbackManager


@pytest.fixture
def manager(tmp_path):
    return HumanFeedbackManager(str(tmp_path))


class TestHumanFeedback:
    def test_submit_feedback(self, manager):
        """提交反馈"""
        result = manager.submit_feedback({
            "agent_id": "agent-1",
            "task_id": "task-1",
            "task_description": "实现登录API",
            "rating": "good",
            "strengths": ["代码清晰"],
            "improvements": ["缺少错误处理"],
            "specific_suggestions": ["所有API端点必须有try-except包裹"],
            "reviewer": "张三",
        })
        assert "feedback_id" in result

    def test_suggestions_converted_to_rules(self, manager):
        """具体建议转化为经验规则"""
        result = manager.submit_feedback({
            "agent_id": "agent-1",
            "task_id": "task-1",
            "task_description": "实现API",
            "rating": "needs_improvement",
            "specific_suggestions": ["所有API必须有输入验证", "错误响应要统一格式"],
            "reviewer": "张三",
        })
        assert result["rules_created"] == 2

    def test_skill_guidance_updated(self, manager):
        """技能方向指导更新"""
        manager.submit_feedback({
            "agent_id": "agent-1",
            "task_id": "task-1",
            "task_description": "安全审计",
            "rating": "good",
            "skill_directions": ["security_audit", "code_review"],
            "reviewer": "张三",
        })
        guidance = manager.get_skill_guidance("agent-1")
        assert "security_audit" in guidance
        assert "code_review" in guidance

    def test_feedback_summary(self, manager):
        """反馈汇总"""
        manager.submit_feedback({"agent_id": "a1", "rating": "excellent", "strengths": ["快"], "reviewer": "x"})
        manager.submit_feedback({"agent_id": "a2", "rating": "poor", "improvements": ["慢"], "reviewer": "y"})
        summary = manager.get_feedback_summary()
        assert summary["total"] == 2
        assert summary["by_rating"]["excellent"] == 1
        assert summary["by_rating"]["poor"] == 1

    def test_recent_feedback(self, manager):
        """获取最近反馈"""
        for i in range(5):
            manager.submit_feedback({"agent_id": f"a{i}", "rating": "good", "reviewer": "x"})
        recent = manager.get_recent_feedback(limit=3)
        assert len(recent) == 3

    def test_persistence(self, manager, tmp_path):
        """反馈持久化"""
        manager.submit_feedback({"agent_id": "a1", "rating": "good", "reviewer": "x"})
        mgr2 = HumanFeedbackManager(str(tmp_path))
        assert len(mgr2._feedbacks) == 1

    def test_skill_guidance_persistence(self, manager, tmp_path):
        """技能指导持久化"""
        manager.submit_feedback({"agent_id": "a1", "skill_directions": ["testing"], "reviewer": "x"})
        mgr2 = HumanFeedbackManager(str(tmp_path))
        assert "testing" in mgr2.get_skill_guidance("a1")
