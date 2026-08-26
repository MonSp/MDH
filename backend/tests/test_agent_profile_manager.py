# backend/tests/test_agent_profile_manager.py
import pytest
from agent_profile_manager import AgentProfileManager

@pytest.fixture
def manager(tmp_path):
    return AgentProfileManager(str(tmp_path / "profiles"))

class TestAgentProfileCRUD:
    def test_get_or_create_new(self, manager):
        """创建新 agent 档案"""
        profile = manager.get_or_create("agent-001", "Executor Alpha")
        assert profile.agent_id == "agent-001"
        assert profile.name == "Executor Alpha"
        assert profile.career_stage == "junior"
        assert profile.total_xp == 0
        assert profile.skill_progress == {}

    def test_get_or_create_existing(self, manager):
        """获取已有档案不覆盖"""
        manager.get_or_create("agent-001", "Alpha")
        profile = manager.get_or_create("agent-001", "Beta")
        assert profile.name == "Alpha"  # 不覆盖

    def test_get_profile(self, manager):
        """获取已有档案"""
        manager.get_or_create("agent-001", "Alpha")
        profile = manager.get_profile("agent-001")
        assert profile is not None
        assert profile.agent_id == "agent-001"

    def test_get_profile_nonexistent(self, manager):
        """获取不存在的档案返回 None"""
        assert manager.get_profile("nonexistent") is None

    def test_save_and_reload(self, manager, tmp_path):
        """持久化后重新加载"""
        profile = manager.get_or_create("agent-001", "Alpha")
        profile.total_xp = 500
        manager.save_profile(profile)

        # 新实例重新加载
        manager2 = AgentProfileManager(str(tmp_path / "profiles"))
        loaded = manager2.get_profile("agent-001")
        assert loaded.total_xp == 500

    def test_list_profiles(self, manager):
        """列出所有档案"""
        manager.get_or_create("agent-001", "Alpha")
        manager.get_or_create("agent-002", "Beta")
        profiles = manager.list_profiles()
        assert len(profiles) == 2


class TestXPSystem:
    @pytest.fixture
    def skill_config(self):
        return {"xp_thresholds": [100, 300, 600]}

    def test_grant_xp_success(self, manager, skill_config):
        """任务成功获得基础 XP + 成功奖励"""
        manager.get_or_create("a1", "Alpha")
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=7.0, task_complexity=3, skill_config=skill_config)
        assert result["xp_gained"] > 0
        assert result["skill_id"] == "backend_dev"

    def test_grant_xp_failure_gives_zero(self, manager, skill_config):
        """任务失败获得 0 XP"""
        manager.get_or_create("a1", "Alpha")
        result = manager.grant_xp("a1", "backend_dev", task_success=False,
                                   review_score=3.0, task_complexity=3, skill_config=skill_config)
        assert result["xp_gained"] == 0

    def test_level_up(self, manager, skill_config):
        """XP 超过阈值自动升级"""
        manager.get_or_create("a1", "Alpha")
        # 直接给足够 XP 升级
        profile = manager.get_profile("a1")
        profile.skill_progress["backend_dev"] = {"xp": 90, "level": 0, "task_count": 5,
                                                   "success_count": 4, "avg_review_score": 7.0, "last_used_at": ""}
        manager.save_profile(profile)
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=8.0, task_complexity=3, skill_config=skill_config)
        assert result["leveled_up"] is True
        assert result["new_level"] == 1

    def test_xp_decay_high_level_low_task(self, manager, skill_config):
        """高级 agent 做低级任务 XP 衰减"""
        manager.get_or_create("a1", "Alpha")
        profile = manager.get_profile("a1")
        # agent 已是中级 (level=2)
        profile.skill_progress["backend_dev"] = {"xp": 400, "level": 2, "task_count": 20,
                                                   "success_count": 18, "avg_review_score": 8.0, "last_used_at": ""}
        manager.save_profile(profile)
        # 做简单任务 (complexity=1 → 难度约 1)
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=8.0, task_complexity=1, skill_config=skill_config)
        # 应该有 XP 但被衰减
        assert 0 < result["xp_gained"] < 30  # 正常应该是 ~25，衰减后更少

    def test_review_bonus(self, manager, skill_config):
        """高审查评分获得额外 XP"""
        manager.get_or_create("a1", "Alpha")
        result_low = manager.grant_xp("a1", "backend_dev", task_success=True,
                                       review_score=5.0, task_complexity=3, skill_config=skill_config)
        # 新 agent 做同样任务
        manager.get_or_create("a2", "Beta")
        result_high = manager.grant_xp("a2", "backend_dev", task_success=True,
                                        review_score=9.0, task_complexity=3, skill_config=skill_config)
        assert result_high["xp_gained"] > result_low["xp_gained"]

    def test_first_use_bonus(self, manager, skill_config):
        """首次使用技能获得额外 XP"""
        manager.get_or_create("a1", "Alpha")
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=7.0, task_complexity=3, skill_config=skill_config)
        assert result["xp_gained"] >= 20  # 首次使用 +20

    def test_total_xp_accumulated(self, manager, skill_config):
        """total_xp 累加"""
        manager.get_or_create("a1", "Alpha")
        manager.grant_xp("a1", "backend_dev", task_success=True,
                          review_score=7.0, task_complexity=3, skill_config=skill_config)
        manager.grant_xp("a1", "frontend_dev", task_success=True,
                          review_score=7.0, task_complexity=2, skill_config=skill_config)
        profile = manager.get_profile("a1")
        assert profile.total_xp > 0


# ──────────────────── Mentor 匹配 ────────────────────


class TestMentorMatching:
    def test_find_mentor_same_department(self, manager):
        """同部门高级 agent 成为 mentor"""
        manager.get_or_create("a1", "Junior", department="dept-software")
        p2 = manager.get_or_create("a2", "Senior", department="dept-software")
        p2.career_stage = "senior"
        p2.total_xp = 500
        manager.save_profile(p2)

        mentor = manager.find_mentor("a1")
        assert mentor is not None
        assert mentor.agent_id == "a2"

    def test_find_mentor_different_department(self, manager):
        """不同部门不匹配"""
        manager.get_or_create("a1", "Junior", department="dept-software")
        p2 = manager.get_or_create("a2", "Senior", department="dept-content")
        p2.career_stage = "senior"
        manager.save_profile(p2)

        assert manager.find_mentor("a1") is None

    def test_find_mentor_excludes_self(self, manager):
        """不匹配自己"""
        p1 = manager.get_or_create("a1", "Solo", department="dept-software")
        p1.career_stage = "senior"
        manager.save_profile(p1)

        assert manager.find_mentor("a1") is None

    def test_find_mentor_only_higher_level(self, manager):
        """只匹配更高级别的 agent"""
        p1 = manager.get_or_create("a1", "Mid", department="dept-software")
        p1.career_stage = "mid"
        manager.save_profile(p1)
        p2 = manager.get_or_create("a2", "Junior", department="dept-software")
        p2.career_stage = "junior"
        manager.save_profile(p2)

        # a2 不配当 a1 的 mentor（级别更低）
        assert manager.find_mentor("a1") is None

    def test_find_mentor_no_department(self, manager):
        """无部门不匹配"""
        manager.get_or_create("a1", "NoDept")
        assert manager.find_mentor("a1") is None

    def test_get_department_peers(self, manager):
        """获取同部门所有 agent"""
        manager.get_or_create("a1", "A", department="dept-software")
        manager.get_or_create("a2", "B", department="dept-software")
        manager.get_or_create("a3", "C", department="dept-content")

        peers = manager.get_department_peers("a1")
        assert len(peers) == 2
        ids = {p.agent_id for p in peers}
        assert "a1" in ids and "a2" in ids
