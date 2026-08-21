# backend/tests/test_agent_profile_manager.py
import pytest
from agent_profile_manager import AgentProfileManager, AgentProfile, SkillProgress

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
