"""Tests for routing_stats_manager — routing statistics management"""
import pytest
from unittest.mock import MagicMock


class TestRoutingStatsManager:
    @pytest.fixture
    def manager(self):
        from routing_stats_manager import RoutingStatsManager
        router = MagicMock()
        return RoutingStatsManager(router)

    def test_init(self, manager):
        assert manager._task_routing == {}

    def test_track_task(self, manager):
        manager.track_task("task-1", "dept-frontend")
        assert manager._task_routing["task-1"] == "dept-frontend"

    def test_update_stats_consumes_routing(self, manager):
        """update_stats 消费 _task_routing"""
        task = MagicMock()
        task.id = "task-1"
        task.status = "completed"
        manager.track_task("task-1", "dept-frontend")
        manager.update_stats([task])
        manager._router.update_stats.assert_called_once_with("dept-frontend", success=True)
        assert manager._task_routing == {}

    def test_update_stats_failed_task(self, manager):
        """失败任务报告 failure"""
        task = MagicMock()
        task.id = "task-1"
        task.status = "failed"
        manager.track_task("task-1", "dept-frontend")
        manager.update_stats([task])
        manager._router.update_stats.assert_called_once_with("dept-frontend", success=False)

    def test_update_stats_skips_unknown_task(self, manager):
        """未知任务被跳过"""
        manager.track_task("unknown-id", "dept-frontend")
        manager.update_stats([])
        assert manager._task_routing == {}

    def test_update_stats_safe_clears_on_exception(self, manager):
        """update_stats_safe 异常时仍清理 _task_routing"""
        manager._router.update_stats.side_effect = RuntimeError("disk full")
        manager.track_task("task-1", "dept-frontend")
        manager.update_stats_safe([])
        assert manager._task_routing == {}

    def test_tracked_tasks(self, manager):
        manager.track_task("task-1", "dept-frontend")
        manager.track_task("task-2", "dept-backend")
        assert manager.tracked_tasks == {"task-1": "dept-frontend", "task-2": "dept-backend"}

    def test_clear(self, manager):
        manager.track_task("task-1", "dept-frontend")
        manager.clear()
        assert manager._task_routing == {}

    def test_auto_assign_then_update_stats_closed_loop(self, manager):
        """auto_assign 写入 → update_stats 消费 → 路由统计闭环"""
        # 模拟 auto_assign_task 写入路由
        manager.track_task("task-100", "dept-frontend")
        manager.track_task("task-200", "dept-backend")

        # 模拟任务执行完成
        t1 = MagicMock(); t1.id = "task-100"; t1.status = "completed"
        t2 = MagicMock(); t2.id = "task-200"; t2.status = "failed"

        manager.update_stats([t1, t2])

        # 验证两次 update_stats 调用
        calls = manager._router.update_stats.call_args_list
        assert len(calls) == 2
        assert calls[0] == (("dept-frontend",), {"success": True})
        assert calls[1] == (("dept-backend",), {"success": False})
        # 验证消费即删
        assert manager._task_routing == {}

    def test_execute_sequential_no_direct_stats_call(self):
        """_execute_sequential 不再直接调用 router.update_stats（由 _update_routing_stats_safe 统一处理）"""
        from task_orchestrator import TaskOrchestrator
        router = MagicMock()
        meeting = MagicMock()
        orch = TaskOrchestrator(
            get_model_fn=MagicMock(),
            meeting=meeting,
            router=router,
        )
        # 确认 _task_routing 为空（assign() 未被调用）
        assert orch._task_routing == {}
        # router.update_stats 不应被调用
        router.update_stats.assert_not_called()


class TestSkillLevelRouting:
    """DynamicRouter 技能等级加权测试"""

    def test_compute_skill_level_no_manager(self, tmp_path):
        """无 profile_manager 时技能等级得分为 0"""
        from dynamic_router import DynamicRouter
        router = DynamicRouter(str(tmp_path / "routing.json"))
        assert router._compute_skill_level_score("dept-software", "写代码") == 0.0

    def test_compute_skill_level_with_profiles(self, tmp_path):
        """有 profile_manager 时按最高等级返回得分"""
        from dynamic_router import DynamicRouter
        from agent_profile_manager import AgentProfileManager
        import json

        # 创建路由表
        routing_path = str(tmp_path / "routing.json")
        with open(routing_path, "w") as f:
            json.dump({"entries": {}}, f)

        # 创建 profile manager 和 agent 档案
        mgr = AgentProfileManager(str(tmp_path / "profiles"))
        profile = mgr.get_or_create("agent-001", "Alpha", department="dept-software")
        profile.skill_progress = {"backend_dev": {"level": 2, "xp": 300}}
        mgr.save_profile(profile)

        router = DynamicRouter(routing_path, profile_manager=mgr)
        score = router._compute_skill_level_score("dept-software", "写代码")
        # level 2 / 3 = 0.667
        assert 0.66 <= score <= 0.67

    def test_compute_skill_level_max_level(self, tmp_path):
        """最高技能等级返回 1.0"""
        from dynamic_router import DynamicRouter
        from agent_profile_manager import AgentProfileManager
        import json

        routing_path = str(tmp_path / "routing.json")
        with open(routing_path, "w") as f:
            json.dump({"entries": {}}, f)

        mgr = AgentProfileManager(str(tmp_path / "profiles"))
        profile = mgr.get_or_create("agent-001", "Alpha", department="dept-software")
        profile.skill_progress = {"backend_dev": {"level": 3, "xp": 600}}
        mgr.save_profile(profile)

        router = DynamicRouter(routing_path, profile_manager=mgr)
        assert router._compute_skill_level_score("dept-software", "写代码") == 1.0

    def test_set_profile_manager(self, tmp_path):
        """set_profile_manager 运行时注入"""
        from dynamic_router import DynamicRouter
        router = DynamicRouter(str(tmp_path / "routing.json"))
        assert router._profile_manager is None
        router.set_profile_manager("mock_mgr")
        assert router._profile_manager == "mock_mgr"


class TestTaskComplexityEstimation:
    """任务复杂度估算测试"""

    def test_simple_task(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        assert mc._estimate_task_complexity("帮我写一个 hello world") <= 2

    def test_complex_task(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        assert mc._estimate_task_complexity("首先设计前端架构，然后实现后端API，最后部署数据库") >= 4

    def test_medium_task(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        score = mc._estimate_task_complexity("重构登录模块并优化数据库查询")
        assert 2 <= score <= 4

    def test_complexity_clamped(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        # 即使关键词很多也不会超过 5
        huge = "首先然后最后前端后端数据库部署架构设计重构优化" * 10
        assert mc._estimate_task_complexity(huge) == 5


class TestTaskTriageGate:
    """任务分流门测试"""

    def test_simple_task(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        result = mc._triage_task("帮我写一个 hello world 函数")
        assert result["level"] == "simple"
        assert result["confidence"] >= 0.8

    def test_simple_short_description(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        result = mc._triage_task("列出当前目录文件")
        assert result["level"] == "simple"

    def test_complex_task(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        result = mc._triage_task("首先设计前端架构，然后实现后端API，最后部署数据库到分布式环境")
        assert result["level"] == "complex"
        assert result["confidence"] < 0.5

    def test_standard_task(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        result = mc._triage_task("重构登录模块优化数据库查询")
        assert result["level"] in ("standard", "complex")

    def test_simple_read_operation(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        result = mc._triage_task("读取配置文件内容")
        assert result["level"] == "simple"

    def test_confidence_clamped(self):
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)
        result = mc._triage_task("x")
        assert 0.0 <= result["confidence"] <= 1.0


class TestSkillLevelBoost:
    """技能升级路由加成测试"""

    def test_update_skill_boost(self, tmp_path):
        """升级后部门加成增加"""
        from dynamic_router import DynamicRouter, RouteEntry
        import json
        routing_path = str(tmp_path / "routing.json")
        with open(routing_path, "w") as f:
            json.dump({"departments": [{"dept_id": "dept-software", "dept_name": "研发部",
                                         "capability_desc": "", "capability_keywords": [],
                                         "tools": [], "success_rate": 0.5, "total_tasks": 10,
                                         "successful_tasks": 5, "last_active": "", "priority": 1}]}, f)
        router = DynamicRouter(routing_path)
        assert router.update_skill_boost("dept-software") is True
        assert router._table["dept-software"].skill_level_boost == 0.05
        # 再升一次
        router.update_skill_boost("dept-software")
        assert router._table["dept-software"].skill_level_boost == 0.10

    def test_skill_boost_capped_at_03(self, tmp_path):
        """加成上限 0.3"""
        from dynamic_router import DynamicRouter
        import json
        routing_path = str(tmp_path / "routing.json")
        with open(routing_path, "w") as f:
            json.dump({"departments": [{"dept_id": "dept-software", "dept_name": "研发部",
                                         "capability_desc": "", "capability_keywords": [],
                                         "tools": [], "success_rate": 0.5, "total_tasks": 10,
                                         "successful_tasks": 5, "last_active": "", "priority": 1}]}, f)
        router = DynamicRouter(routing_path)
        for _ in range(10):
            router.update_skill_boost("dept-software")
        assert router._table["dept-software"].skill_level_boost == 0.3

    def test_skill_boost_persists(self, tmp_path):
        """加成持久化到路由表"""
        from dynamic_router import DynamicRouter
        import json
        routing_path = str(tmp_path / "routing.json")
        with open(routing_path, "w") as f:
            json.dump({"departments": [{"dept_id": "dept-software", "dept_name": "研发部",
                                         "capability_desc": "", "capability_keywords": [],
                                         "tools": [], "success_rate": 0.5, "total_tasks": 10,
                                         "successful_tasks": 5, "last_active": "", "priority": 1}]}, f)
        router = DynamicRouter(routing_path)
        router.update_skill_boost("dept-software")

        # 新实例重新加载
        router2 = DynamicRouter(routing_path)
        assert router2._table["dept-software"].skill_level_boost == 0.05

    def test_skill_boost_unknown_dept(self, tmp_path):
        """未知部门返回 False"""
        from dynamic_router import DynamicRouter
        router = DynamicRouter(str(tmp_path / "routing.json"))
        assert router.update_skill_boost("dept-unknown") is False
