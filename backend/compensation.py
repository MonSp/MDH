import json
import logging
import os
import time
import uuid
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field

logger = logging.getLogger("compensation")


@dataclass
class CompensateAction:
    description: str
    action_type: str = ""
    params: dict = field(default_factory=dict)


@dataclass
class CompensationResult:
    task_id: str
    success: bool
    action: str
    details: str
    timestamp: float


@dataclass
class FailureEvent:
    task_id: str
    agent_id: str
    error: str
    impact: str
    timestamp: float


@dataclass
class Checkpoint:
    id: str
    task_id: str
    step_index: int
    state_snapshot: dict = field(default_factory=dict)
    created_at: float = 0.0


class CompensationEngine:
    def __init__(self):
        self._compensation_log: list[CompensationResult] = []
        self._failure_history: list[FailureEvent] = []
        self._listeners: list[Callable[[FailureEvent], None]] = []
        self._handlers: dict[str, Callable] = {}

    def record_failure(
        self, task_id: str, agent_id: str, error: str, impact: str
    ) -> FailureEvent:
        event = FailureEvent(
            task_id=task_id,
            agent_id=agent_id,
            error=error,
            impact=impact,
            timestamp=time.time(),
        )
        self._failure_history.append(event)
        for listener in self._listeners:
            listener(event)
        return event

    def find_compensatable_tasks(
        self,
        failed_task_id: str,
        sub_tasks: list,
        dependencies: list,
    ) -> list:
        graph: dict[str, list[str]] = defaultdict(list)
        for dep in dependencies:
            graph[dep.get("from", dep.get("from_task_id", ""))].append(
                dep.get("to", dep.get("to_task_id", ""))
            )

        task_map = {}
        for task in sub_tasks:
            task_id = task.get("id", "") if isinstance(task, dict) else getattr(task, "id", "")
            task_map[task_id] = task

        compensatable = []
        visited: set = set()

        def walk(task_id: str):
            if task_id in visited:
                return
            visited.add(task_id)
            for dependent_id in graph.get(task_id, []):
                if dependent_id in visited:
                    continue
                task = task_map.get(dependent_id)
                if not task:
                    continue
                has_compensate = False
                if isinstance(task, dict):
                    has_compensate = task.get("compensate_action") is not None
                else:
                    has_compensate = getattr(task, "compensate_action", None) is not None
                if has_compensate:
                    compensatable.append(task)
                walk(dependent_id)

        walk(failed_task_id)
        return compensatable

    def register_handler(self, action_type: str, handler: Callable) -> None:
        """注册补偿动作处理器。

        Args:
            action_type: 动作类型（如 retry、rollback、skip）
            handler: 处理函数，签名 handler(params) -> bool，返回是否成功
        """
        self._handlers[action_type] = handler

    def execute_compensation(
        self, task_id: str, action: CompensateAction
    ) -> CompensationResult:
        """执行补偿动作。

        按 action_type 查找注册的处理器并执行。
        无处理器时记录警告并返回失败。
        """
        handler = self._handlers.get(action.action_type)
        success = False
        details = ""

        if handler:
            try:
                success = bool(handler(action.params))
                details = f"补偿 '{action.action_type}' 执行{'成功' if success else '失败'}: {action.description}"
            except Exception as e:
                success = False
                details = f"补偿 '{action.action_type}' 执行异常: {e}"
        else:
            details = f"未注册的补偿类型 '{action.action_type}': {action.description}"

        result = CompensationResult(
            task_id=task_id,
            success=success,
            action=action.action_type,
            details=details,
            timestamp=time.time(),
        )
        self._compensation_log.append(result)
        return result

    def get_compensation_log(self) -> list[CompensationResult]:
        return list(self._compensation_log)

    def get_failure_history(self) -> list[FailureEvent]:
        return list(self._failure_history)

    def add_listener(self, listener: Callable[[FailureEvent], None]) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: Callable[[FailureEvent], None]) -> None:
        self._listeners = [l for l in self._listeners if l is not listener]

    def clear(self) -> None:
        self._compensation_log.clear()
        self._failure_history.clear()


class CheckpointManager:
    def __init__(self, max_per_task: int = 10, persistence_dir: str | None = None):
        self._checkpoints: dict[str, list[Checkpoint]] = {}
        self._max_per_task = max_per_task
        self._persistence_dir = persistence_dir
        if persistence_dir:
            os.makedirs(persistence_dir, exist_ok=True)
            self._load_from_disk()

    def _persist(self) -> None:
        """将全部检查点落盘为 JSON（persistence_dir 未配置时跳过）

        写入采用"临时文件 + 原子替换（os.replace）"，防止崩溃导致 JSON 截断。
        """
        if not self._persistence_dir:
            return
        data = {
            task_id: [
                {
                    "id": cp.id,
                    "task_id": cp.task_id,
                    "step_index": cp.step_index,
                    "state_snapshot": cp.state_snapshot,
                    "created_at": cp.created_at,
                }
                for cp in cps
            ]
            for task_id, cps in self._checkpoints.items()
        }
        path = os.path.join(self._persistence_dir, "checkpoints.json")
        tmp_path = f"{path}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, path)
        except OSError as e:
            logger.warning("持久化检查点失败: %s", e)

    def _load_from_disk(self) -> None:
        """从磁盘加载检查点（文件不存在或损坏时静默跳过，不崩溃）"""
        if not self._persistence_dir:
            return
        path = os.path.join(self._persistence_dir, "checkpoints.json")
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("加载检查点失败（%s），跳过磁盘恢复", e)
            return
        for task_id, cp_list in data.items():
            self._checkpoints[task_id] = [
                Checkpoint(
                    id=cp["id"],
                    task_id=cp["task_id"],
                    step_index=cp["step_index"],
                    state_snapshot=cp.get("state_snapshot", {}),
                    created_at=cp.get("created_at", 0.0),
                )
                for cp in cp_list
            ]

    def save_checkpoint(
        self, task_id: str, step_index: int, state: dict
    ) -> Checkpoint:
        checkpoint = Checkpoint(
            id=uuid.uuid4().hex,
            task_id=task_id,
            step_index=step_index,
            state_snapshot=state.copy(),
            created_at=time.time(),
        )

        if task_id not in self._checkpoints:
            self._checkpoints[task_id] = []

        self._checkpoints[task_id].append(checkpoint)

        if len(self._checkpoints[task_id]) > self._max_per_task:
            sorted_cps = sorted(
                self._checkpoints[task_id], key=lambda cp: cp.step_index
            )
            self._checkpoints[task_id] = sorted_cps[-self._max_per_task :]

        self._persist()
        return checkpoint

    def get_latest_checkpoint(self, task_id: str) -> Checkpoint | None:
        task_checkpoints = self._checkpoints.get(task_id)
        if not task_checkpoints:
            return None
        return max(task_checkpoints, key=lambda cp: cp.step_index)

    def get_checkpoint(self, checkpoint_id: str) -> Checkpoint | None:
        for task_checkpoints in self._checkpoints.values():
            for cp in task_checkpoints:
                if cp.id == checkpoint_id:
                    return cp
        return None

    def get_checkpoints_for_task(self, task_id: str) -> list[Checkpoint]:
        task_checkpoints = self._checkpoints.get(task_id, [])
        return sorted(task_checkpoints, key=lambda cp: cp.step_index)

    def restore_checkpoint(self, checkpoint_id: str) -> dict | None:
        checkpoint = self.get_checkpoint(checkpoint_id)
        if not checkpoint:
            return None
        return checkpoint.state_snapshot.copy()

    def delete_checkpoint(self, checkpoint_id: str) -> bool:
        for task_id, task_checkpoints in self._checkpoints.items():
            for i, cp in enumerate(task_checkpoints):
                if cp.id == checkpoint_id:
                    task_checkpoints.pop(i)
                    if not task_checkpoints:
                        del self._checkpoints[task_id]
                    self._persist()
                    return True
        return False

    def delete_checkpoints_for_task(self, task_id: str) -> int:
        task_checkpoints = self._checkpoints.pop(task_id, [])
        if task_checkpoints:
            self._persist()
        return len(task_checkpoints)

    def clear(self) -> None:
        self._checkpoints.clear()
        self._persist()
