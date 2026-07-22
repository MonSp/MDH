import logging
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

logger = logging.getLogger(__name__)

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

# 角色ID到AgentRole的映射
ROLE_TO_AGENT_ROLE = {
    "executor": AgentRole.EXECUTOR,
    "planner": AgentRole.PLANNER,
    "reviewer": AgentRole.REVIEWER,
    "monitor": AgentRole.MONITOR,
    "coordinator": AgentRole.COORDINATOR,
    "ceo": AgentRole.CEO,
    "director": AgentRole.COORDINATOR,
    "screenwriter": AgentRole.PLANNER,
    "image_artist": AgentRole.EXECUTOR,
    "video_artist": AgentRole.EXECUTOR,
    "video_editor": AgentRole.EXECUTOR,
    "sound_designer": AgentRole.REVIEWER,
    "data_lead": AgentRole.COORDINATOR,
    "data_engineer": AgentRole.EXECUTOR,
    "data_analyst": AgentRole.EXECUTOR,
    "ml_engineer": AgentRole.EXECUTOR,
    "data_visualizer": AgentRole.REVIEWER,
    "content_director": AgentRole.COORDINATOR,
    "content_writer": AgentRole.EXECUTOR,
    "content_editor": AgentRole.REVIEWER,
    "graphic_designer": AgentRole.EXECUTOR,
    "ppt_lead": AgentRole.COORDINATOR,
    "content_architect": AgentRole.PLANNER,
    "slide_designer": AgentRole.EXECUTOR,
    "animation_engineer": AgentRole.EXECUTOR,
}


def create_team_from_roles(selected_role_ids: list[str], roles_config: dict) -> list[dict]:
    """根据选中的角色ID创建团队模板
    
    Args:
        selected_role_ids: 选中的角色ID列表，如 ["planner", "executor", "reviewer"]
        roles_config: roles_config.yaml 解析后的配置
        
    Returns:
        团队模板列表，格式同 DEFAULT_MEETING_AGENTS
    """
    base_roles = roles_config.get("base_roles", {})
    custom_roles = roles_config.get("custom_roles", {})
    all_roles = {**base_roles, **custom_roles}
    
    team = []
    for i, role_id in enumerate(selected_role_ids):
        role_config = all_roles.get(role_id)
        if not role_config:
            logger.warning("角色不存在: %s，跳过", role_id)
            continue
        
        # 获取角色名称
        role_name = role_config.get("name", role_id)
        
        # 获取AgentRole
        agent_role = ROLE_TO_AGENT_ROLE.get(role_id, AgentRole.EXECUTOR)
        
        # 获取技能作为capabilities
        skills = role_config.get("skills", [])
        
        agent_def = {
            "id": f"agent-{role_id}",
            "name": role_name,
            "role": agent_role,
            "capabilities": skills,
            "role_config_id": role_id,  # 保存角色配置ID，用于后续加载工具和提示词
        }
        team.append(agent_def)
    
    # 确保有CEO/coordinator角色
    has_coordinator = any(
        t["role"] in (AgentRole.CEO, AgentRole.COORDINATOR) 
        for t in team
    )
    if not has_coordinator and team:
        # 将第一个角色标记为coordinator
        team[0]["role"] = AgentRole.COORDINATOR
    
    return team


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

    def add_agent(self, agent_id: str, name: str, role: AgentRole, capabilities: list = None) -> MeetingAgentInfo:
        """向会议中添加一个智能体。

        Args:
            agent_id: 智能体 ID
            name: 智能体名称
            role: 角色
            capabilities: 能力列表

        Returns:
            创建的 MeetingAgentInfo
        """
        agent = MeetingAgentInfo(
            id=agent_id,
            name=name,
            role=role,
            status=MeetingAgentStatus.MEETING,
            capabilities=capabilities or [],
        )
        self.agents.append(agent)
        return agent

    def get_agent(self, agent_id: str) -> Optional[MeetingAgentInfo]:
        for agent in self.agents:
            if agent.id == agent_id:
                return agent
        return None

    def update_agent_status(self, agent_id: str, status: MeetingAgentStatus, current_task: str = None) -> None:
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")
        agent.status = status

    def add_task(self, agent_id: str, description: str) -> MeetingTaskInfo:
        if not self.get_agent(agent_id):
            raise ValueError(f"Agent not found: {agent_id}")
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
                return
        raise ValueError(f"Task not found: {task_id}")

    def delete_task(self, task_id: str) -> bool:
        """删除任务。"""
        for i, task in enumerate(self.tasks):
            if task.id == task_id:
                self.tasks.pop(i)
                return True
        raise ValueError(f"Task not found: {task_id}")

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