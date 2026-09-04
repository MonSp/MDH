"""TaskBridge — 工作流节点与 Task 的双向转换桥接

自建轻量 Task 类替代 agentscope.state._task.Task。
"""

import logging
import uuid
from dataclasses import dataclass, field

from protocol import (
    WorkflowEdge,
    WorkflowExecution,
    WorkflowNode,
    WorkflowNodeStatus,
)

logger = logging.getLogger("task_bridge")


@dataclass
class Task:
    """轻量 Task — 替代 agentscope.state._task.Task"""
    id: str = ""
    subject: str = ""
    description: str = ""
    state: str = "pending"  # pending / in_progress / completed
    metadata: dict = field(default_factory=dict)
    blocks: list[str] = field(default_factory=list)
    blocked_by: list[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())[:8]


# 兼容旧代码引用
AgentscopeTaskBridge = None  # 将在下方定义后赋值


class TaskBridge:
    """工作流节点与 Task 的双向转换桥接

    负责将工作流节点与 Task 进行双向转换和同步。
    """

    def __init__(self):
        self._node_to_task_map: dict[str, str] = {}
        self._task_to_node_map: dict[str, str] = {}
        self._workflow_tasks: dict[str, list[Task]] = {}

    def workflow_node_to_task(self, node: WorkflowNode) -> Task:
        task_id = str(uuid.uuid4())[:8]
        state_map = {
            WorkflowNodeStatus.PENDING: "pending",
            WorkflowNodeStatus.RUNNING: "in_progress",
            WorkflowNodeStatus.COMPLETED: "completed",
            WorkflowNodeStatus.FAILED: "pending",
            WorkflowNodeStatus.SKIPPED: "completed",
        }
        task = Task(
            subject=node.task_description[:50],
            description=node.task_description,
            metadata={
                "node_id": node.node_id,
                "dept_id": node.dept_id,
                "input_spec": node.input_spec,
                "output_spec": node.output_spec,
                "workflow_node_status": node.status.value,
            },
            state=state_map.get(node.status, "pending"),
            id=task_id,
        )
        self._node_to_task_map[node.node_id] = task_id
        self._task_to_node_map[task_id] = node.node_id
        return task

    def task_to_workflow_node(self, task: Task) -> WorkflowNode:
        metadata = task.metadata
        node_id = metadata.get("node_id", task.id)
        dept_id = metadata.get("dept_id", "unknown")
        state_map = {
            "pending": WorkflowNodeStatus.PENDING,
            "in_progress": WorkflowNodeStatus.RUNNING,
            "completed": WorkflowNodeStatus.COMPLETED,
        }
        node = WorkflowNode(
            node_id=node_id,
            task_description=task.description,
            dept_id=dept_id,
            input_spec=metadata.get("input_spec", {}),
            output_spec=metadata.get("output_spec", {}),
            status=state_map.get(task.state, WorkflowNodeStatus.PENDING),
        )
        self._node_to_task_map[node_id] = task.id
        self._task_to_node_map[task.id] = node_id
        return node

    def sync_workflow_to_tasks(self, workflow: WorkflowExecution) -> list[Task]:
        tasks = []
        if workflow.execution_id not in self._workflow_tasks:
            self._workflow_tasks[workflow.execution_id] = []
        existing_tasks = self._workflow_tasks[workflow.execution_id]
        existing_task_map = {t.metadata.get("node_id"): t for t in existing_tasks}
        state_map = {
            WorkflowNodeStatus.PENDING: "pending",
            WorkflowNodeStatus.RUNNING: "in_progress",
            WorkflowNodeStatus.COMPLETED: "completed",
            WorkflowNodeStatus.FAILED: "pending",
            WorkflowNodeStatus.SKIPPED: "completed",
        }
        for node_id, node_status in workflow.node_states.items():
            if node_id in existing_task_map:
                task = existing_task_map[node_id]
                task.state = state_map.get(node_status, "pending")
                task.metadata["workflow_node_status"] = node_status.value
                tasks.append(task)
            else:
                task_id = self._node_to_task_map.get(node_id, str(uuid.uuid4())[:8])
                task = Task(
                    subject=f"工作流节点 {node_id}",
                    description=f"工作流节点 {node_id} 的任务",
                    metadata={"node_id": node_id, "workflow_node_status": node_status.value},
                    state=state_map.get(node_status, "pending"),
                    id=task_id,
                )
                tasks.append(task)
                self._node_to_task_map[node_id] = task_id
                self._task_to_node_map[task_id] = node_id
        self._workflow_tasks[workflow.execution_id] = tasks
        return tasks

    def update_task_dependencies(self, tasks: list[Task], edges: list[WorkflowEdge]):
        node_id_to_task = {}
        for task in tasks:
            node_id = task.metadata.get("node_id")
            if node_id:
                node_id_to_task[node_id] = task
        for edge in edges:
            source_task = node_id_to_task.get(edge.source_node_id)
            target_task = node_id_to_task.get(edge.target_node_id)
            if source_task and target_task:
                if target_task.id not in source_task.blocks:
                    source_task.blocks.append(target_task.id)
                if source_task.id not in target_task.blocked_by:
                    target_task.blocked_by.append(source_task.id)

    def get_task_for_node(self, node_id: str) -> Task | None:
        task_id = self._node_to_task_map.get(node_id)
        if not task_id:
            return None
        for tasks in self._workflow_tasks.values():
            for task in tasks:
                if task.id == task_id:
                    return task
        return None

    def get_node_for_task(self, task_id: str) -> str | None:
        return self._task_to_node_map.get(task_id)

    def get_workflow_tasks(self, execution_id: str) -> list[Task]:
        return self._workflow_tasks.get(execution_id, [])

    def clear_workflow_tasks(self, execution_id: str):
        if execution_id in self._workflow_tasks:
            tasks = self._workflow_tasks[execution_id]
            for task in tasks:
                node_id = task.metadata.get("node_id")
                if node_id and node_id in self._node_to_task_map:
                    task_id = self._node_to_task_map[node_id]
                    if task_id in self._task_to_node_map:
                        del self._task_to_node_map[task_id]
                    del self._node_to_task_map[node_id]
            del self._workflow_tasks[execution_id]

    def update_node_status(self, node_id: str, status: WorkflowNodeStatus):
        task = self.get_task_for_node(node_id)
        if not task:
            return
        state_map = {
            WorkflowNodeStatus.PENDING: "pending",
            WorkflowNodeStatus.RUNNING: "in_progress",
            WorkflowNodeStatus.COMPLETED: "completed",
            WorkflowNodeStatus.FAILED: "pending",
            WorkflowNodeStatus.SKIPPED: "completed",
        }
        task.state = state_map.get(status, "pending")
        task.metadata["workflow_node_status"] = status.value


# 兼容旧代码引用
AgentscopeTaskBridge = TaskBridge
