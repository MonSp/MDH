import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional


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
        self._compensation_log: List[CompensationResult] = []
        self._failure_history: List[FailureEvent] = []
        self._listeners: List[Callable[[FailureEvent], None]] = []

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
        graph: Dict[str, List[str]] = defaultdict(list)
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

    def execute_compensation(
        self, task_id: str, action: CompensateAction
    ) -> CompensationResult:
        result = CompensationResult(
            task_id=task_id,
            success=True,
            action=action.action_type,
            details=f"Executed compensation: {action.description}",
            timestamp=time.time(),
        )
        self._compensation_log.append(result)
        return result

    def get_compensation_log(self) -> List[CompensationResult]:
        return list(self._compensation_log)

    def get_failure_history(self) -> List[FailureEvent]:
        return list(self._failure_history)

    def add_listener(self, listener: Callable[[FailureEvent], None]) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: Callable[[FailureEvent], None]) -> None:
        self._listeners = [l for l in self._listeners if l is not listener]

    def clear(self) -> None:
        self._compensation_log.clear()
        self._failure_history.clear()


class CheckpointManager:
    def __init__(self, max_per_task: int = 10):
        self._checkpoints: Dict[str, List[Checkpoint]] = {}
        self._max_per_task = max_per_task

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

        return checkpoint

    def get_latest_checkpoint(self, task_id: str) -> Optional[Checkpoint]:
        task_checkpoints = self._checkpoints.get(task_id)
        if not task_checkpoints:
            return None
        return max(task_checkpoints, key=lambda cp: cp.step_index)

    def get_checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:
        for task_checkpoints in self._checkpoints.values():
            for cp in task_checkpoints:
                if cp.id == checkpoint_id:
                    return cp
        return None

    def get_checkpoints_for_task(self, task_id: str) -> List[Checkpoint]:
        task_checkpoints = self._checkpoints.get(task_id, [])
        return sorted(task_checkpoints, key=lambda cp: cp.step_index)

    def restore_checkpoint(self, checkpoint_id: str) -> Optional[dict]:
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
                    return True
        return False

    def delete_checkpoints_for_task(self, task_id: str) -> int:
        task_checkpoints = self._checkpoints.pop(task_id, [])
        return len(task_checkpoints)

    def clear(self) -> None:
        self._checkpoints.clear()
