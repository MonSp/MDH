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
