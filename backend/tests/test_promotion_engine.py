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
        "career_paths": {
            "dept-software": {
                "name": "研发部",
                "stages": [
                    {"stage": "junior", "title": "初级工程师"},
                    {"stage": "mid", "title": "中级工程师", "requirements": {
                        "min_mid_skills": 2,
                        "required_skills": {"backend_dev": 1, "testing": 1},
                    }},
                    {"stage": "senior", "title": "高级工程师", "requirements": {
                        "min_mid_skills": 3,
                        "min_senior_skills": 1,
                        "required_skills": {"code_review": 2},
                    }},
                    {"stage": "lead", "title": "技术负责人", "requirements": {
                        "min_senior_skills": 2,
                        "required_skills": {"architecture": 2},
                    }},
                ],
            },
            "dept-video": {
                "name": "视频部",
                "stages": [
                    {"stage": "junior", "title": "初级剪辑师"},
                    {"stage": "mid", "title": "剪辑师", "requirements": {
                        "min_mid_skills": 2,
                        "required_skills": {"video_editing": 1},
                    }},
                ],
            },
        }
    }


class TestPromotionEngine:
    def test_no_promotion_without_department(self, engine, roles_config):
        """无部门的 agent 不晋升"""
        profile = AgentProfile(agent_id="a1", name="Alpha", career_stage="junior", department="")
        assert engine.check_promotion(profile, roles_config) is None

    def test_promote_to_mid(self, engine, roles_config):
        """满足中级条件晋升"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior", department="dept-software",
            skill_progress={
                "backend_dev": {"level": 2, "xp": 300},
                "frontend_dev": {"level": 2, "xp": 300},
                "testing": {"level": 1, "xp": 100},
            },
        )
        result = engine.check_promotion(profile, roles_config)
        assert result is not None
        assert result["stage"] == "mid"
        assert result["title"] == "中级工程师"
        assert result["department"] == "dept-software"

    def test_no_promote_missing_required_skill(self, engine, roles_config):
        """缺少必要技能不晋升"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior", department="dept-software",
            skill_progress={
                "backend_dev": {"level": 2, "xp": 300},
                "frontend_dev": {"level": 2, "xp": 300},
                # 缺少 testing
            },
        )
        assert engine.check_promotion(profile, roles_config) is None

    def test_different_departments_different_requirements(self, engine, roles_config):
        """不同部门有不同晋升标准"""
        # 视频部只需要 video_editing
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior", department="dept-video",
            skill_progress={
                "video_editing": {"level": 2},
                "script_writing": {"level": 2},
            },
        )
        result = engine.check_promotion(profile, roles_config)
        assert result is not None
        assert result["stage"] == "mid"
        assert result["title"] == "剪辑师"
        assert result["department"] == "dept-video"

    def test_unknown_department_no_promotion(self, engine, roles_config):
        """未知部门不晋升"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior", department="dept-unknown",
            skill_progress={"some_skill": {"level": 3}},
        )
        assert engine.check_promotion(profile, roles_config) is None

    def test_apply_promotion(self, engine):
        """晋升更新 career_stage"""
        profile = AgentProfile(agent_id="a1", name="Alpha", career_stage="junior", department="dept-software")
        promotion = {"stage": "mid", "title": "中级工程师", "department": "dept-software"}
        updated = engine.apply_promotion(profile, promotion)
        assert updated.career_stage == "mid"

    def test_no_re_promote_same_stage(self, engine, roles_config):
        """已在中级的不会再次晋升为中级"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="mid", department="dept-software",
            skill_progress={
                "backend_dev": {"level": 2},
                "testing": {"level": 2},
            },
        )
        result = engine.check_promotion(profile, roles_config)
        # 应该检查 senior，不是 mid
        if result:
            assert result["stage"] != "mid"

    def test_get_career_path(self, engine, roles_config):
        """获取部门职业路径"""
        profile = AgentProfile(agent_id="a1", name="Alpha", department="dept-software")
        path = engine.get_career_path(profile, roles_config)
        assert path is not None
        assert path["name"] == "研发部"
        assert len(path["stages"]) == 4

    def test_list_departments(self, engine, roles_config):
        """列出所有部门"""
        depts = engine.list_departments(roles_config)
        assert len(depts) == 2
        dept_ids = [d["department"] for d in depts]
        assert "dept-software" in dept_ids
        assert "dept-video" in dept_ids
