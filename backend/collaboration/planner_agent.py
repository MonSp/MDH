import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from .communication import (
    CommunicationInterface,
    CommunicationManager,
    Message,
    MessageType,
)

try:
    from ..skill_registry import SkillRegistry
except ImportError:
    SkillRegistry = None


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
    assigned_to: str | None = None
    dependencies: list[str] = field(default_factory=list)
    result: Any = None
    error: str | None = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    acceptance_criteria: list[str] = field(default_factory=list)
    required_skills: list[str] = field(default_factory=list)
    input_spec: dict[str, str] = field(default_factory=dict)
    output_spec: dict[str, str] = field(default_factory=dict)


@dataclass
class TaskPlan:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    title: str = ""
    description: str = ""
    subtasks: list[SubTask] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PLANNING
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: datetime | None = None


class PlannerAgent:
    def __init__(
        self,
        name: str = "planner",
        communication: CommunicationInterface = None,
        communication_manager: CommunicationManager = None,
        skill_registry: "SkillRegistry" = None,
    ):
        self.name = name
        self.communication = communication
        self.communication_manager = communication_manager
        self.current_plan: TaskPlan | None = None
        self._child_agents: dict[str, Any] = {}
        self.skill_registry = skill_registry

    @property
    def agent_id(self) -> str:
        return self.name

    async def plan_task(self, task_description: str, context: dict[str, Any] = None) -> TaskPlan:
        subtasks = self._decompose_task(task_description, context)
        self.current_plan = TaskPlan(
            title=task_description[:100],
            description=task_description,
            subtasks=subtasks,
            status=TaskStatus.PLANNING,
        )
        return self.current_plan

    def _decompose_task(self, task_description: str, context: dict[str, Any] = None) -> list[SubTask]:
        subtasks = []
        keywords = task_description.lower()

        if "网站" in keywords or "web" in keywords or "前端" in keywords:
            subtasks.append(SubTask(
                name="前端开发",
                description="负责前端界面和交互开发",
                priority=TaskPriority.HIGH,
                acceptance_criteria=[
                    "页面布局符合设计稿",
                    "交互功能正常响应",
                    "兼容主流浏览器",
                ],
                required_skills=["frontend", "html", "css", "javascript"],
                input_spec={"name": "设计稿", "type": "dict", "description": "UI设计稿和交互规格"},
                output_spec={"name": "前端代码", "type": "str", "description": "前端页面代码和静态资源"},
            ))
            subtasks.append(SubTask(
                name="后端开发",
                description="负责后端API和数据处理",
                priority=TaskPriority.HIGH,
                acceptance_criteria=[
                    "API接口返回格式正确",
                    "数据校验和错误处理完善",
                    "接口响应时间符合要求",
                ],
                required_skills=["backend", "python", "database", "api"],
                input_spec={"name": "API规格", "type": "dict", "description": "接口定义和数据模型"},
                output_spec={"name": "后端代码", "type": "str", "description": "后端API服务代码"},
            ))
            subtasks.append(SubTask(
                name="测试",
                description="负责功能测试和集成测试",
                priority=TaskPriority.MEDIUM,
                dependencies=[subtasks[0].id, subtasks[1].id],
                acceptance_criteria=[
                    "所有功能测试用例通过",
                    "无严重级别缺陷",
                    "集成测试覆盖核心流程",
                ],
                required_skills=["testing", "qa"],
                input_spec={"name": "测试需求", "type": "dict", "description": "前端和后端代码及测试需求"},
                output_spec={"name": "测试报告", "type": "str", "description": "测试结果和缺陷报告"},
            ))
        elif "数据分析" in keywords or "data" in keywords:
            subtasks.append(SubTask(
                name="数据收集",
                description="收集和整理数据",
                priority=TaskPriority.HIGH,
                acceptance_criteria=[
                    "数据来源明确且可追溯",
                    "数据格式统一规范",
                    "数据量满足分析需求",
                ],
                required_skills=["data", "python", "etl"],
                input_spec={"name": "数据需求", "type": "dict", "description": "数据来源和采集范围"},
                output_spec={"name": "原始数据", "type": "str", "description": "整理后的结构化数据集"},
            ))
            subtasks.append(SubTask(
                name="数据处理",
                description="清洗和处理数据",
                priority=TaskPriority.HIGH,
                dependencies=[subtasks[0].id],
                acceptance_criteria=[
                    "缺失值已合理填充或剔除",
                    "异常值已识别并处理",
                    "数据质量报告已生成",
                ],
                required_skills=["data", "python", "pandas"],
                input_spec={"name": "原始数据", "type": "str", "description": "收集到的原始数据集"},
                output_spec={"name": "清洗数据", "type": "str", "description": "清洗处理后的数据集"},
            ))
            subtasks.append(SubTask(
                name="数据分析",
                description="分析数据并生成报告",
                priority=TaskPriority.MEDIUM,
                dependencies=[subtasks[1].id],
                acceptance_criteria=[
                    "分析结论有数据支撑",
                    "可视化图表清晰准确",
                    "报告结构完整",
                ],
                required_skills=["data", "python", "statistics", "visualization"],
                input_spec={"name": "清洗数据", "type": "str", "description": "清洗后的数据集"},
                output_spec={"name": "分析报告", "type": "str", "description": "数据分析报告和可视化图表"},
            ))
        else:
            subtasks.append(SubTask(
                name="任务分析",
                description="分析任务需求和目标",
                priority=TaskPriority.HIGH,
                acceptance_criteria=[
                    "需求清单完整无遗漏",
                    "技术方案可行",
                    "任务拆分合理",
                ],
                required_skills=["analysis"],
                input_spec={"name": "任务描述", "type": "str", "description": "原始任务描述和上下文"},
                output_spec={"name": "分析文档", "type": "str", "description": "需求分析和技术方案"},
            ))
            subtasks.append(SubTask(
                name="任务执行",
                description="执行具体任务",
                priority=TaskPriority.HIGH,
                dependencies=[subtasks[0].id],
                acceptance_criteria=[
                    "功能实现符合需求",
                    "代码质量达标",
                    "无阻塞性问题",
                ],
                required_skills=["coding"],
                input_spec={"name": "分析文档", "type": "str", "description": "需求分析和技术方案"},
                output_spec={"name": "实现代码", "type": "str", "description": "任务实现的代码和产出物"},
            ))
            subtasks.append(SubTask(
                name="结果验证",
                description="验证任务结果",
                priority=TaskPriority.MEDIUM,
                dependencies=[subtasks[1].id],
                acceptance_criteria=[
                    "所有验收标准通过",
                    "无遗留缺陷",
                    "文档齐全",
                ],
                required_skills=["testing", "qa"],
                input_spec={"name": "实现代码", "type": "str", "description": "任务实现的代码和产出物"},
                output_spec={"name": "验证报告", "type": "str", "description": "验证结果和通过/不通过结论"},
            ))

        return subtasks

    def register_child_agent(self, agent_id: str, agent: Any) -> None:
        self._child_agents[agent_id] = agent

    def get_available_agents(self) -> list[str]:
        return list(self._child_agents.keys())

    async def assign_tasks(self) -> dict[str, list[str]]:
        if not self.current_plan:
            raise ValueError("No current plan to assign tasks")

        assignments: dict[str, list[str]] = {}
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

            matched_skills = self._query_matching_skills(subtask.required_skills)

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
                        "acceptance_criteria": subtask.acceptance_criteria,
                        "required_skills": subtask.required_skills,
                        "input_spec": subtask.input_spec,
                        "output_spec": subtask.output_spec,
                        "matched_skills": matched_skills,
                    },
                    task_id=self.current_plan.id,
                )
                await self.communication_manager.send_message(message)

        return assignments

    def _query_matching_skills(self, required_skills: list[str]) -> list[dict[str, str]]:
        if not self.skill_registry or SkillRegistry is None:
            return []

        matched = []
        for skill in self.skill_registry.list_skills():
            name_lower = skill.get("name", "").lower()
            desc_lower = skill.get("description", "").lower()
            for tag in required_skills:
                if tag.lower() in name_lower or tag.lower() in desc_lower:
                    matched.append(skill)
                    break
        return matched

    def _select_agent_for_task(self, subtask: SubTask, available_agents: list[str]) -> str:
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

    def _get_subtask(self, subtask_id: str) -> SubTask | None:
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

    def get_plan_status(self) -> dict[str, Any] | None:
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

    async def execute_plan(self) -> dict[str, Any]:
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

    def generate_review_feedback(
        self,
        task: SubTask,
        output: str,
        context: dict[str, Any] = None,
    ) -> dict[str, Any]:
        """生成结构化验收反馈

        根据任务的验收标准对产出进行检查，返回结构化的反馈结果。

        Args:
            task: 原始任务
            output: 员工提交的产出
            context: 额外上下文

        Returns:
            结构化验收反馈字典
        """
        context = context or {}
        issues: list[dict[str, str]] = []

        output_lower = output.lower() if output else ""

        for criterion in task.acceptance_criteria:
            criterion_lower = criterion.lower()
            keywords = [
                kw.strip()
                for kw in criterion_lower.replace("，", ",").replace("。", "").replace("和", ",").replace("与", ",").replace("以及", ",").split(",")
                if kw.strip()
            ]
            criterion_met = False

            if not output or not output.strip():
                issues.append({
                    "type": "missing_feature",
                    "location": task.name,
                    "detail": f"产出为空，无法验证: {criterion}",
                    "suggestion": "请提供完整的产出内容",
                })
                continue

            matched_keywords = sum(1 for kw in keywords if kw in output_lower)
            if keywords and matched_keywords >= len(keywords) * 0.5:
                criterion_met = True

            if not criterion_met and "错误" not in criterion_lower and "缺陷" not in criterion_lower:
                if len(output.strip()) > 50:
                    criterion_met = True

            if not criterion_met:
                issue_type = "missing_feature"
                if "性能" in criterion_lower or "响应时间" in criterion_lower:
                    issue_type = "performance"
                elif "格式" in criterion_lower or "规范" in criterion_lower:
                    issue_type = "style_issue"
                elif "逻辑" in criterion_lower or "正确" in criterion_lower:
                    issue_type = "logic_error"

                issues.append({
                    "type": issue_type,
                    "location": task.name,
                    "detail": f"未满足验收标准: {criterion}",
                    "suggestion": f"请确保产出满足: {criterion}",
                })

        if not task.acceptance_criteria:
            if not output or not output.strip():
                issues.append({
                    "type": "missing_feature",
                    "location": task.name,
                    "detail": "产出为空",
                    "suggestion": "请提供完整的产出内容",
                })

        has_critical = any(
            issue["type"] in ("logic_error", "missing_feature") for issue in issues
        )

        status = "revision_required" if (issues and has_critical) else "approved"

        if not issues:
            overall_comment = f"任务「{task.name}」验收通过，产出符合所有验收标准。"
        elif status == "approved":
            overall_comment = f"任务「{task.name}」基本达标，存在 {len(issues)} 个非关键问题，建议后续优化。"
        else:
            overall_comment = f"任务「{task.name}」需要修改，发现 {len(issues)} 个问题需要解决。"

        current_iteration = context.get("current_iteration", 1)

        return {
            "status": status,
            "issues": issues,
            "max_iterations": 3,
            "current_iteration": current_iteration,
            "overall_comment": overall_comment,
        }
