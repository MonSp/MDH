import asyncio
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid
from datetime import datetime

from .communication import CommunicationInterface, CommunicationManager, Message, MessageType


class TaskStatus(str, Enum):
    PENDING = "pending"
    PLANNING = "planning"
    ASSIGNED = "assigned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskPriority(int, Enum):
    LOW = 0
    MEDIUM = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class SubTask:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    name: str = ""
    description: str = ""
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.MEDIUM
    assigned_to: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)
    result: Any = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


@dataclass
class TaskPlan:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    title: str = ""
    description: str = ""
    subtasks: List[SubTask] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PLANNING
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None


class PlannerAgent:
    def __init__(
        self,
        name: str = "planner",
        communication: CommunicationInterface = None,
        communication_manager: CommunicationManager = None,
    ):
        self.name = name
        self.communication = communication
        self.communication_manager = communication_manager
        self.current_plan: Optional[TaskPlan] = None
        self._child_agents: Dict[str, Any] = {}

    @property
    def agent_id(self) -> str:
        return self.name

    async def plan_task(self, task_description: str, context: Dict[str, Any] = None) -> TaskPlan:
        subtasks = self._decompose_task(task_description, context)
        self.current_plan = TaskPlan(
            title=task_description[:100],
            description=task_description,
            subtasks=subtasks,
            status=TaskStatus.PLANNING,
        )
        return self.current_plan

    def _decompose_task(self, task_description: str, context: Dict[str, Any] = None) -> List[SubTask]:
        subtasks = []
        keywords = task_description.lower()

        if "网站" in keywords or "web" in keywords or "前端" in keywords:
            subtasks.append(SubTask(
                name="前端开发",
                description="负责前端界面和交互开发",
                priority=TaskPriority.HIGH,
            ))
            subtasks.append(SubTask(
                name="后端开发",
                description="负责后端API和数据处理",
                priority=TaskPriority.HIGH,
            ))
            subtasks.append(SubTask(
                name="测试",
                description="负责功能测试和集成测试",
                priority=TaskPriority.MEDIUM,
                dependencies=[subtasks[0].id, subtasks[1].id],
            ))
        elif "数据分析" in keywords or "data" in keywords:
            subtasks.append(SubTask(
                name="数据收集",
                description="收集和整理数据",
                priority=TaskPriority.HIGH,
            ))
            subtasks.append(SubTask(
                name="数据处理",
                description="清洗和处理数据",
                priority=TaskPriority.HIGH,
                dependencies=[subtasks[0].id],
            ))
            subtasks.append(SubTask(
                name="数据分析",
                description="分析数据并生成报告",
                priority=TaskPriority.MEDIUM,
                dependencies=[subtasks[1].id],
            ))
        else:
            subtasks.append(SubTask(
                name="任务分析",
                description="分析任务需求和目标",
                priority=TaskPriority.HIGH,
            ))
            subtasks.append(SubTask(
                name="任务执行",
                description="执行具体任务",
                priority=TaskPriority.HIGH,
                dependencies=[subtasks[0].id],
            ))
            subtasks.append(SubTask(
                name="结果验证",
                description="验证任务结果",
                priority=TaskPriority.MEDIUM,
                dependencies=[subtasks[1].id],
            ))

        return subtasks

    def register_child_agent(self, agent_id: str, agent: Any) -> None:
        self._child_agents[agent_id] = agent

    def get_available_agents(self) -> List[str]:
        return list(self._child_agents.keys())

    async def assign_tasks(self) -> Dict[str, List[str]]:
        if not self.current_plan:
            raise ValueError("No current plan to assign tasks")

        assignments: Dict[str, List[str]] = {}
        available_agents = self.get_available_agents()

        if not available_agents:
            raise ValueError("No child agents available for task assignment")

        for subtask in self.current_plan.subtasks:
            if subtask.status != TaskStatus.PENDING:
                continue

            if subtask.dependencies:
                deps_completed = all(
                    self._get_subtask(dep_id).status == TaskStatus.COMPLETED
                    for dep_id in subtask.dependencies
                    if self._get_subtask(dep_id)
                )
                if not deps_completed:
                    continue

            agent_id = self._select_agent_for_task(subtask, available_agents)
            subtask.assigned_to = agent_id
            subtask.status = TaskStatus.ASSIGNED

            if agent_id not in assignments:
                assignments[agent_id] = []
            assignments[agent_id].append(subtask.id)

            if self.communication_manager:
                message = Message(
                    type=MessageType.TASK_DELEGATION,
                    sender=self.name,
                    receiver=agent_id,
                    content={
                        "task_id": subtask.id,
                        "task_name": subtask.name,
                        "description": subtask.description,
                        "priority": subtask.priority.value,
                    },
                    task_id=self.current_plan.id,
                )
                await self.communication_manager.send_message(message)

        return assignments

    def _select_agent_for_task(self, subtask: SubTask, available_agents: List[str]) -> str:
        if not available_agents:
            raise ValueError("No available agents")

        task_keywords = subtask.name.lower() + " " + subtask.description.lower()

        if "前端" in task_keywords or "frontend" in task_keywords:
            for agent_id in available_agents:
                if "frontend" in agent_id.lower() or "前端" in agent_id:
                    return agent_id

        if "后端" in task_keywords or "backend" in task_keywords:
            for agent_id in available_agents:
                if "backend" in agent_id.lower() or "后端" in agent_id:
                    return agent_id

        if "测试" in task_keywords or "test" in task_keywords:
            for agent_id in available_agents:
                if "test" in agent_id.lower() or "测试" in agent_id:
                    return agent_id

        return available_agents[0]

    def _get_subtask(self, subtask_id: str) -> Optional[SubTask]:
        if not self.current_plan:
            return None
        for subtask in self.current_plan.subtasks:
            if subtask.id == subtask_id:
                return subtask
        return None

    async def update_subtask_status(
        self,
        subtask_id: str,
        status: TaskStatus,
        result: Any = None,
        error: str = None,
    ) -> None:
        subtask = self._get_subtask(subtask_id)
        if not subtask:
            raise ValueError(f"Subtask {subtask_id} not found")

        subtask.status = status
        if result is not None:
            subtask.result = result
        if error:
            subtask.error = error

        if status == TaskStatus.RUNNING:
            subtask.started_at = datetime.now()
        elif status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
            subtask.completed_at = datetime.now()

        if self.current_plan:
            all_completed = all(
                s.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)
                for s in self.current_plan.subtasks
            )
            if all_completed:
                self.current_plan.status = TaskStatus.COMPLETED
                self.current_plan.completed_at = datetime.now()

    def get_plan_status(self) -> Optional[Dict[str, Any]]:
        if not self.current_plan:
            return None

        total = len(self.current_plan.subtasks)
        completed = sum(1 for s in self.current_plan.subtasks if s.status == TaskStatus.COMPLETED)
        failed = sum(1 for s in self.current_plan.subtasks if s.status == TaskStatus.FAILED)
        running = sum(1 for s in self.current_plan.subtasks if s.status == TaskStatus.RUNNING)
        pending = sum(1 for s in self.current_plan.subtasks if s.status == TaskStatus.PENDING)

        return {
            "plan_id": self.current_plan.id,
            "title": self.current_plan.title,
            "status": self.current_plan.status.value,
            "total_subtasks": total,
            "completed": completed,
            "failed": failed,
            "running": running,
            "pending": pending,
            "progress": completed / total if total > 0 else 0,
        }

    async def execute_plan(self) -> Dict[str, Any]:
        if not self.current_plan:
            raise ValueError("No current plan to execute")

        self.current_plan.status = TaskStatus.RUNNING
        results = {}

        while True:
            assignments = await self.assign_tasks()

            if not assignments:
                all_done = all(
                    s.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)
                    for s in self.current_plan.subtasks
                )
                if all_done:
                    break
                await asyncio.sleep(0.1)
                continue

            await asyncio.sleep(0.1)

        for subtask in self.current_plan.subtasks:
            results[subtask.id] = {
                "name": subtask.name,
                "status": subtask.status.value,
                "result": subtask.result,
                "error": subtask.error,
            }

        return results