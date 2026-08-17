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
