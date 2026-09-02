"""Tests for OnboardingManager and onboarding tasks."""
import pytest

from onboarding_manager import OnboardingManager
from onboarding_tasks import ONBOARDING_TASKS, get_onboarding_tasks


@pytest.fixture
def mgr(tmp_path):
    return OnboardingManager(str(tmp_path))


class TestOnboardingManager:
    def test_initial_state_not_completed(self, mgr):
        """新创建的 OnboardingManager 初始状态为未完成"""
        state = mgr.get_state()
        assert state["completed"] is False
        assert state["current_step"] == 0
        assert state["api_key_configured"] is False
        assert state["model_selected"] == ""
        assert state["tasks_completed"] == 0
        assert state["started_at"] == ""
        assert state["completed_at"] == ""

    def test_update_step_forward(self, mgr):
        """update_step 可以推进 current_step"""
        mgr.update_step(1)
        assert mgr.get_state()["current_step"] == 1
        mgr.update_step(3)
        assert mgr.get_state()["current_step"] == 3

    def test_update_step_backward_ignored(self, mgr):
        """update_step 不会倒退 current_step"""
        mgr.update_step(5)
        mgr.update_step(2)
        assert mgr.get_state()["current_step"] == 5

    def test_mark_api_key_configured(self, mgr):
        """mark_api_key_configured 设置 api_key_configured=True 并推进到 step 2"""
        mgr.mark_api_key_configured()
        state = mgr.get_state()
        assert state["api_key_configured"] is True
        assert state["current_step"] == 2

    def test_mark_model_selected(self, mgr):
        """mark_model_selected 设置模型名并推进到 step 3"""
        mgr.mark_model_selected("deepseek-chat")
        state = mgr.get_state()
        assert state["model_selected"] == "deepseek-chat"
        assert state["current_step"] == 3

    def test_mark_task_completed(self, mgr):
        """mark_task_completed 更新 tasks_completed 和 current_step"""
        mgr.mark_task_completed(0)
        state = mgr.get_state()
        assert state["tasks_completed"] == 1
        assert state["current_step"] == 4

        mgr.mark_task_completed(2)
        state = mgr.get_state()
        assert state["tasks_completed"] == 3
        assert state["current_step"] == 6

    def test_complete_sets_completed(self, mgr):
        """complete() 设置 completed=True, current_step=6, 和 completed_at"""
        mgr.complete()
        state = mgr.get_state()
        assert state["completed"] is True
        assert state["current_step"] == 6
        assert state["completed_at"] != ""

    def test_reset_clears_state(self, mgr):
        """reset() 将状态恢复到初始值"""
        mgr.mark_api_key_configured()
        mgr.mark_model_selected("gpt-4")
        mgr.mark_task_completed(0)
        mgr.complete()

        mgr.reset()
        state = mgr.get_state()
        assert state["completed"] is False
        assert state["current_step"] == 0
        assert state["api_key_configured"] is False
        assert state["model_selected"] == ""
        assert state["tasks_completed"] == 0
        assert state["started_at"] == ""
        assert state["completed_at"] == ""

    def test_persistence(self, tmp_path):
        """状态写入磁盘后重新加载可以恢复"""
        mgr1 = OnboardingManager(str(tmp_path))
        mgr1.mark_api_key_configured()
        mgr1.mark_model_selected("deepseek-chat")
        mgr1.mark_task_completed(1)

        # 创建新实例从同一目录加载
        mgr2 = OnboardingManager(str(tmp_path))
        state = mgr2.get_state()
        assert state["api_key_configured"] is True
        assert state["model_selected"] == "deepseek-chat"
        assert state["tasks_completed"] == 2
        assert state["current_step"] == 5


class TestOnboardingTasks:
    def test_tasks_endpoint_returns_3(self):
        """get_onboarding_tasks 返回恰好 3 个任务"""
        tasks = get_onboarding_tasks()
        assert len(tasks) == 3
        assert len(ONBOARDING_TASKS) == 3

    def test_tasks_have_required_fields(self):
        """每个任务都包含必需的字段"""
        for task in ONBOARDING_TASKS:
            assert "index" in task
            assert "title" in task
            assert "description" in task
            assert "difficulty" in task
            assert "xp_reward" in task
            assert "skill_hint" in task
            assert isinstance(task["index"], int)
            assert isinstance(task["xp_reward"], int)
