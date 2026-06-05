"""AgentscopeTaskBridge - agentscope Task系统集成桥接

将工作流引擎与agentscope的Task系统集成，复用其依赖关系机制。
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

# 导入agentscope的Task类
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'third_party', 'agentscope', 'src'))

from agentscope.state._task import Task

from protocol import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowExecution,
    WorkflowNode,
    WorkflowNodeStatus,
    workflow_node_to_dict,
    dict_to_workflow_node,
)

logger = logging.getLogger("agentscope_task_bridge")


class AgentscopeTaskBridge:
    """agentscope Task系统集成桥接

    负责将工作流节点与agentscope Task进行双向转换和同步。
    """

    def __init__(self):
        # 工作流节点ID到Task ID的映射
        self._node_to_task_map: Dict[str, str] = {}
        # Task ID到工作流节点ID的映射
        self._task_to_node_map: Dict[str, str] = {}
        # 工作流执行实例ID到Task列表的映射
        self._workflow_tasks: Dict[str, List[Task]] = {}

    def workflow_node_to_task(self, node: WorkflowNode) -> Task:
        """将工作流节点转换为agentscope Task

        Args:
            node: 工作流节点

        Returns:
            agentscope Task实例
        """
        task_id = str(uuid.uuid4())[:8]

        # 映射状态
        state_map = {
            WorkflowNodeStatus.PENDING: "pending",
            WorkflowNodeStatus.RUNNING: "in_progress",
            WorkflowNodeStatus.COMPLETED: "completed",
            WorkflowNodeStatus.FAILED: "pending",  # 失败状态映射为pending，等待重试
            WorkflowNodeStatus.SKIPPED: "completed",  # 跳过状态映射为completed
        }

        task = Task(
            subject=node.task_description[:50],  # 截取前50个字符作为主题
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

        # 保存映射关系
        self._node_to_task_map[node.node_id] = task_id
        self._task_to_node_map[task_id] = node.node_id

        logger.info("将工作流节点 %s 转换为Task %s", node.node_id, task_id)
        return task

    def task_to_workflow_node(self, task: Task) -> WorkflowNode:
        """将agentscope Task转换为工作流节点

        Args:
            task: agentscope Task实例

        Returns:
            工作流节点
        """
        # 从metadata中获取节点信息
        metadata = task.metadata
        node_id = metadata.get("node_id", task.id)
        dept_id = metadata.get("dept_id", "unknown")
        input_spec = metadata.get("input_spec", {})
        output_spec = metadata.get("output_spec", {})

        # 映射状态
        state_map = {
            "pending": WorkflowNodeStatus.PENDING,
            "in_progress": WorkflowNodeStatus.RUNNING,
            "completed": WorkflowNodeStatus.COMPLETED,
        }

        node = WorkflowNode(
            node_id=node_id,
            task_description=task.description,
            dept_id=dept_id,
            input_spec=input_spec,
            output_spec=output_spec,
            status=state_map.get(task.state, WorkflowNodeStatus.PENDING),
        )

        # 保存映射关系
        self._node_to_task_map[node_id] = task.id
        self._task_to_node_map[task.id] = node_id

        logger.info("将Task %s 转换为工作流节点 %s", task.id, node_id)
        return node

    def sync_workflow_to_tasks(self, workflow: WorkflowExecution) -> List[Task]:
        """同步工作流状态到Task列表

        Args:
            workflow: 工作流执行实例

        Returns:
            Task列表
        """
        tasks = []

        # 获取或创建Task列表
        if workflow.execution_id not in self._workflow_tasks:
            self._workflow_tasks[workflow.execution_id] = []

        existing_tasks = self._workflow_tasks[workflow.execution_id]
        existing_task_map = {t.metadata.get("node_id"): t for t in existing_tasks}

        # 状态映射
        state_map = {
            WorkflowNodeStatus.PENDING: "pending",
            WorkflowNodeStatus.RUNNING: "in_progress",
            WorkflowNodeStatus.COMPLETED: "completed",
            WorkflowNodeStatus.FAILED: "pending",
            WorkflowNodeStatus.SKIPPED: "completed",
        }

        # 同步每个节点的状态
        for node_id, node_status in workflow.node_states.items():
            if node_id in existing_task_map:
                # 更新现有Task
                task = existing_task_map[node_id]
                task.state = state_map.get(node_status, "pending")
                task.metadata["workflow_node_status"] = node_status.value
                tasks.append(task)
            else:
                # 创建新Task（需要节点信息，这里简化处理）
                task_id = self._node_to_task_map.get(node_id, str(uuid.uuid4())[:8])
                task = Task(
                    subject=f"工作流节点 {node_id}",
                    description=f"工作流节点 {node_id} 的任务",
                    metadata={
                        "node_id": node_id,
                        "workflow_node_status": node_status.value,
                    },
                    state=state_map.get(node_status, "pending"),
                    id=task_id,
                )
                tasks.append(task)
                self._node_to_task_map[node_id] = task_id
                self._task_to_node_map[task_id] = node_id

        # 更新工作流的Task列表
        self._workflow_tasks[workflow.execution_id] = tasks

        logger.info("同步工作流 %s 的状态到 %d 个Task", workflow.execution_id, len(tasks))
        return tasks

    def update_task_dependencies(self, tasks: List[Task], edges: List[WorkflowEdge]):
        """更新Task的blocks/blocked_by字段

        Args:
            tasks: Task列表
            edges: 工作流边列表
        """
        # 创建节点ID到Task的映射
        node_id_to_task = {}
        for task in tasks:
            node_id = task.metadata.get("node_id")
            if node_id:
                node_id_to_task[node_id] = task

        # 更新依赖关系
        for edge in edges:
            source_task = node_id_to_task.get(edge.source_node_id)
            target_task = node_id_to_task.get(edge.target_node_id)

            if source_task and target_task:
                # source_task blocks target_task
                if target_task.id not in source_task.blocks:
                    source_task.blocks.append(target_task.id)

                # target_task is blocked_by source_task
                if source_task.id not in target_task.blocked_by:
                    target_task.blocked_by.append(source_task.id)

                logger.debug("更新依赖关系: %s -> %s", edge.source_node_id, edge.target_node_id)

    def get_task_for_node(self, node_id: str) -> Optional[Task]:
        """获取节点对应的Task

        Args:
            node_id: 节点ID

        Returns:
            Task实例，如果不存在则返回None
        """
        task_id = self._node_to_task_map.get(node_id)
        if not task_id:
            return None

        # 在所有工作流中查找Task
        for tasks in self._workflow_tasks.values():
            for task in tasks:
                if task.id == task_id:
                    return task

        return None

    def get_node_for_task(self, task_id: str) -> Optional[str]:
        """获取Task对应的节点ID

        Args:
            task_id: Task ID

        Returns:
            节点ID，如果不存在则返回None
        """
        return self._task_to_node_map.get(task_id)

    def get_workflow_tasks(self, execution_id: str) -> List[Task]:
        """获取工作流的所有Task

        Args:
            execution_id: 工作流执行实例ID

        Returns:
            Task列表
        """
        return self._workflow_tasks.get(execution_id, [])

    def clear_workflow_tasks(self, execution_id: str):
        """清除工作流的所有Task

        Args:
            execution_id: 工作流执行实例ID
        """
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
            logger.info("清除工作流 %s 的所有Task", execution_id)

    def update_node_status(self, node_id: str, status: WorkflowNodeStatus):
        """更新节点状态

        Args:
            node_id: 节点ID
            status: 新状态
        """
        task = self.get_task_for_node(node_id)
        if not task:
            logger.warning("未找到节点 %s 对应的Task", node_id)
            return

        # 状态映射
        state_map = {
            WorkflowNodeStatus.PENDING: "pending",
            WorkflowNodeStatus.RUNNING: "in_progress",
            WorkflowNodeStatus.COMPLETED: "completed",
            WorkflowNodeStatus.FAILED: "pending",
            WorkflowNodeStatus.SKIPPED: "completed",
        }

        task.state = state_map.get(status, "pending")
        task.metadata["workflow_node_status"] = status.value

        logger.info("更新节点 %s 的状态为 %s", node_id, status.value)