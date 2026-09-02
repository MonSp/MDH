"""
RoutingStatsManager — 路由统计管理

从 MeetingCoordinator 提取的路由统计更新逻辑。
负责消费 _task_routing 映射，更新部门成功率。
"""

import logging
from typing import Any

logger = logging.getLogger("routing_stats")


class RoutingStatsManager:
    """路由统计管理器

    职责：
    - 消费 _task_routing 映射（task_id → dept_id）
    - 根据任务完成状态更新部门成功率
    - 消费即删：每条消息只统计一次，避免重复计数
    """

    def __init__(self, router):
        """
        Args:
            router: DynamicRouter 实例（用于 update_stats）
        """
        self._router = router
        self._task_routing: dict[str, str] = {}  # task_id → dept_id

    def track_task(self, task_id: str, dept_id: str) -> None:
        """记录任务的路由映射"""
        self._task_routing[task_id] = dept_id

    def update_stats(self, tasks: list[Any]) -> None:
        """消费 _task_routing，更新路由统计

        Args:
            tasks: 任务列表（需有 id 和 status 属性）
        """
        for task_id in list(self._task_routing.keys()):
            dept_id = self._task_routing[task_id]
            task = next((t for t in tasks if getattr(t, "id", None) == task_id), None)
            if task is None:
                del self._task_routing[task_id]
                continue
            self._router.update_stats(dept_id, success=task.status == "completed")
            del self._task_routing[task_id]

    def update_stats_safe(self, tasks: list[Any]) -> None:
        """安全包装：异常不中断后续流程"""
        try:
            self.update_stats(tasks)
        except Exception as e:
            logger.warning("更新路由统计失败: %s", e)
        finally:
            # 无论统计是否成功，都清理剩余跟踪条目
            self._task_routing.clear()

    @property
    def tracked_tasks(self) -> dict[str, str]:
        """当前跟踪的任务路由映射"""
        return dict(self._task_routing)

    def clear(self) -> None:
        """清理所有跟踪条目"""
        self._task_routing.clear()
