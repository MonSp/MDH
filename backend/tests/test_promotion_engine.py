# backend/tests/test_promotion_engine.py
import pytest
from promotion_engine import PromotionEngine
from agent_profile_manager import AgentProfile

@pytest.fixture
def engine():
    return PromotionEngine()

@pytest.fixture
def roles_config():
    return {
        "promotion_requirements": {
            "reviewer": {
                "min_mid_skills": 2,
                "required_skills": {"code_review": 1},
            },
            "coordinator": {
                "min_mid_skills": 3,
                "required_skills": {"task_decomposition": 1},
            },
            "planner": {
                "min_senior_skills": 2,
                "required_skills": {"architecture": 2},
            },
        }
    }

class TestPromotionEngine:
    def test_no_promotion_junior(self, engine, roles_config):
        """初级 agent 无晋升"""
        profile = AgentProfile(agent_id="a1", name="Alpha", career_stage="junior")
        assert engine.check_promotion(profile, roles_config) is None

    def test_promote_to_reviewer(self, engine, roles_config):
        """满足 Reviewer 条件"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior",
            skill_progress={
                "backend_dev": {"level": 2, "xp": 300},
                "frontend_dev": {"level": 2, "xp": 300},
                "code_review": {"level": 1, "xp": 100},
            },
        )
        assert engine.check_promotion(profile, roles_config) == "reviewer"

    def test_no_promote_missing_required_skill(self, engine, roles_config):
        """缺少必要技能不晋升"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior",
            skill_progress={
                "backend_dev": {"level": 2, "xp": 300},
                "frontend_dev": {"level": 2, "xp": 300},
                # 缺少 code_review
            },
        )
        assert engine.check_promotion(profile, roles_config) is None

    def test_promote_to_coordinator(self, engine, roles_config):
        """满足 Coordinator 条件"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="reviewer",
            skill_progress={
                "backend_dev": {"level": 2},
                "frontend_dev": {"level": 2},
                "testing": {"level": 2},
                "task_decomposition": {"level": 1},
            },
        )
        assert engine.check_promotion(profile, roles_config) == "coordinator"

    def test_apply_promotion(self, engine):
        """晋升更新 career_stage"""
        profile = AgentProfile(agent_id="a1", name="Alpha", career_stage="junior")
        updated = engine.apply_promotion(profile, "reviewer")
        assert updated.career_stage == "reviewer"

    def test_no_demotion(self, engine, roles_config):
        """已晋升的不会再次检查同级"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="reviewer",
            skill_progress={
                "backend_dev": {"level": 2},
                "frontend_dev": {"level": 2},
                "code_review": {"level": 1},
            },
        )
        # 不会再次晋升为 reviewer
        result = engine.check_promotion(profile, roles_config)
        assert result != "reviewer"
