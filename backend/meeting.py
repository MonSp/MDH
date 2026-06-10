import time
import uuid
from typing import Optional

from protocol import (
    AgentRole,
    MeetingAgentInfo,
    MeetingAgentStatus,
    MeetingSummary,
    MeetingTaskInfo,
    meeting_agent_to_dict,
    meeting_summary_to_dict,
    meeting_task_to_dict,
)

DEFAULT_MEETING_AGENTS = [
    {
        "id": "agent-ceo",
        "name": "CTO-技术总监",
        "role": AgentRole.CEO,
        "capabilities": ["semantic_analysis", "task_delegation", "meeting_coordination", "tech_architecture"],
    },
    {
        "id": "agent-planner",
        "name": "架构师-Alpha",
        "role": AgentRole.PLANNER,
        "capabilities": ["task_decomposition", "data_analysis", "system_design", "tech_spec"],
    },
    {
        "id": "agent-executor",
        "name": "全栈开发-Beta",
        "role": AgentRole.EXECUTOR,
        "capabilities": ["code_generation", "file_operation", "browser_automation", "frontend_dev", "backend_dev"],
    },
    {
        "id": "agent-monitor",
        "name": "DevOps-Gamma",
        "role": AgentRole.MONITOR,
        "capabilities": ["monitoring", "data_analysis", "deployment", "performance_tuning"],
    },
    {
        "id": "agent-reviewer",
        "name": "QA工程师-Delta",
        "role": AgentRole.REVIEWER,
        "capabilities": ["code_review", "testing", "bug_analysis", "quality_assurance"],
    },
    {
        "id": "agent-coordinator",
        "name": "项目经理-Epsilon",
        "role": AgentRole.COORDINATOR,
        "capabilities": ["task_decomposition", "monitoring", "progress_tracking", "risk_management"],
    },
]

# 简单任务的单人助理模板
PERSONAL_ASSISTANT_TEMPLATE = [
    {
        "id": "agent-assistant",
        "name": "私人助理",
        "role": AgentRole.EXECUTOR,
        "capabilities": ["browser_automation", "file_operation", "code_generation", "frontend_dev", "backend_dev"],
    },
]


class MeetingSession:
    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self.agents: list[MeetingAgentInfo] = []
        self.tasks: list[MeetingTaskInfo] = []
        self.messages: list[dict] = []
        self._running: bool = False
        self._created_at: float = time.time()

    def start(self, team_template: list = None) -> None:
        """启动会议，初始化团队成员。

        Args:
            team_template: 团队模板列表，默认为 DEFAULT_MEETING_AGENTS。
                          可传入 PERSONAL_ASSISTANT_TEMPLATE 创建单人助理团队。
        """
        template = team_template or DEFAULT_MEETING_AGENTS
        self.agents = []
        for agent_def in template:
            agent = MeetingAgentInfo(
                id=agent_def["id"],
                name=agent_def["name"],
                role=agent_def["role"],
                status=MeetingAgentStatus.MEETING,
                capabilities=agent_def["capabilities"],
            )
            self.agents.append(agent)
        self._running = True

    def stop(self) -> None:
        for agent in self.agents:
            agent.status = MeetingAgentStatus.IDLE
        self._running = False

    def get_agent(self, agent_id: str) -> Optional[MeetingAgentInfo]:
        for agent in self.agents:
            if agent.id == agent_id:
                return agent
        return None

    def update_agent_status(self, agent_id: str, status: MeetingAgentStatus, current_task: str = None) -> None:
        agent = self.get_agent(agent_id)
        if agent:
            agent.status = status

    def add_task(self, agent_id: str, description: str) -> MeetingTaskInfo:
        task = MeetingTaskInfo(
            id=str(uuid.uuid4())[:8],
            agent_id=agent_id,
            description=description,
            status="pending",
            created_at=time.time(),
        )
        self.tasks.append(task)
        return task

    def update_task_status(self, task_id: str, status: str) -> None:
        for task in self.tasks:
            if task.id == task_id:
                task.status = status
                break

    def add_message(self, role: str, content: str, agent_id: str = None) -> dict:
        message = {
            "id": str(uuid.uuid4())[:8],
            "role": role,
            "content": content,
            "agent_id": agent_id,
            "timestamp": time.time(),
        }
        self.messages.append(message)
        return message

    def get_agents_dict(self) -> list[dict]:
        return [meeting_agent_to_dict(agent) for agent in self.agents]

    def get_tasks_dict(self) -> list[dict]:
        return [meeting_task_to_dict(task) for task in self.tasks]

    def get_summary(self) -> dict:
        completed_tasks = sum(1 for t in self.tasks if t.status == "completed")
        failed_tasks = sum(1 for t in self.tasks if t.status == "failed")
        pending_tasks = sum(1 for t in self.tasks if t.status == "pending")
        summary = MeetingSummary(
            total_agents=len(self.agents),
            total_tasks=len(self.tasks),
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            pending_tasks=pending_tasks,
            messages_count=len(self.messages),
        )
        return meeting_summary_to_dict(summary)

    def is_running(self) -> bool:
        return self._running

    def cleanup(self) -> None:
        self.agents.clear()
        self.tasks.clear()
        self.messages.clear()