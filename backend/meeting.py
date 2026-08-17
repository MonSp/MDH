import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
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


class SessionEventType(str, Enum):
    """SessionEvent 事件类型最小集。

    会话消息（add_message 汇入）映射到 user_message / agent_message /
    system；其余类型供后续 LLM 上下文投影、快照与审计扩展使用。
    """

    USER_MESSAGE = "user_message"
    AGENT_MESSAGE = "agent_message"
    SYSTEM = "system"
    DISCUSSION = "discussion"
    EXECUTION = "execution"
    REVIEW = "review"
    APPROVAL = "approval"
    EXPERIENCE_INJECTION = "experience_injection"
    TOOL = "tool"
    AUDIT = "audit"


@dataclass
class SessionEvent:
    """结构化会话事件（append-only 事件流的基本单元）。

    event_id 与 add_message 返回消息的 ``id`` 对齐，便于从事件流追溯
    到既有消息；phase/actor/span_id 为扩展字段，默认空。
    """

    event_id: str
    event_type: SessionEventType = SessionEventType.AGENT_MESSAGE
    role: str = ""
    content: str = ""
    agent_id: Optional[str] = None
    phase: Optional[str] = None
    actor: Optional[str] = None
    span_id: Optional[str] = None
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        """转为可 JSON 序列化的 dict（event_type 落为字符串值）。"""
        event_type = (
            self.event_type.value
            if isinstance(self.event_type, SessionEventType)
            else str(self.event_type)
        )
        return {
            "event_id": self.event_id,
            "event_type": event_type,
            "role": self.role,
            "content": self.content,
            "agent_id": self.agent_id,
            "phase": self.phase,
            "actor": self.actor,
            "span_id": self.span_id,
            "timestamp": self.timestamp,
        }


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
    def __init__(self, meeting_id: str, session_log_dir: Optional[str] = None):
        self.meeting_id = meeting_id
        self.agents: list[MeetingAgentInfo] = []
        self.tasks: list[MeetingTaskInfo] = []
        self.messages: list[dict] = []
        self._running: bool = False
        self._created_at: float = time.time()
        # SessionEvent 事件流：内存镜像 + 可选 JSONL 持久化
        self._session_log_dir: Optional[str] = session_log_dir
        self._events: list[dict] = []
        if session_log_dir:
            os.makedirs(session_log_dir, exist_ok=True)

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
        self._append_event(message)
        return message

    def _append_event(self, message: dict) -> None:
        """将消息追加为结构化 SessionEvent（内存镜像 + JSONL append）。"""
        if not self._events and self._session_log_dir:
            # 重载会话先 add_message 后 deriveMessages（续会自然顺序）时，
            # _events 已被新消息填为非空导致 deriveMessages 的磁盘回填短路；
            # 这里在首次 append 前先回填磁盘历史，防丢失。
            self._events = self.load_events()
        event = SessionEvent(
            event_id=message["id"],
            event_type=self._infer_event_type(message["role"]),
            role=message["role"],
            content=message["content"],
            agent_id=message.get("agent_id"),
            timestamp=message["timestamp"],
        )
        event_dict = event.to_dict()
        self._events.append(event_dict)
        if self._session_log_dir:
            try:
                path = os.path.join(self._session_log_dir, f"{self.meeting_id}.jsonl")
                with open(path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(event_dict, ensure_ascii=False) + "\n")
            except (IOError, OSError):
                # IOError 静默降级为纯内存模式，不破坏 add_message 行为
                logger.warning(
                    "SessionEvent JSONL 追加失败（降级为内存模式）: %s/%s.jsonl",
                    self._session_log_dir,
                    self.meeting_id,
                )

    @staticmethod
    def _infer_event_type(role: str) -> SessionEventType:
        if role == "user":
            return SessionEventType.USER_MESSAGE
        if role == "agent":
            return SessionEventType.AGENT_MESSAGE
        return SessionEventType.SYSTEM

    def append_event(
        self,
        event_type: SessionEventType,
        content: str,
        agent_id: Optional[str] = None,
        phase: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> dict:
        """追加结构化事件（不经过 add_message，直接写入事件流）。

        用于记录非消息类事件：EXPERIENCE_INJECTION、REVIEW、EXECUTION、TOOL、AUDIT 等。
        """
        event_id = str(uuid.uuid4())[:8]
        event = SessionEvent(
            event_id=event_id,
            event_type=event_type,
            role=event_type.value,
            content=content,
            agent_id=agent_id,
            phase=phase,
            actor=actor,
            timestamp=time.time(),
        )
        event_dict = event.to_dict()
        self._events.append(event_dict)
        if self._session_log_dir:
            try:
                path = os.path.join(self._session_log_dir, f"{self.meeting_id}.jsonl")
                with open(path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(event_dict, ensure_ascii=False) + "\n")
            except (IOError, OSError):
                logger.warning(
                    "SessionEvent JSONL 追加失败（降级为内存模式）: %s/%s.jsonl",
                    self._session_log_dir,
                    self.meeting_id,
                )
        return event_dict

    def deriveMessages(
        self,
        event_types: Optional[list] = None,
        window: Optional[int] = None,
        max_content_len: Optional[int] = None,
    ) -> list[dict]:
        """从事件流投影为既有 messages 结构 ``{id, role, content, agent_id, timestamp}``。

        Args:
            event_types: 仅投影指定 event_type 的事件（如 ["agent_message"]）。
            window: 仅取最近 N 条事件。
            max_content_len: 内容截断长度。
        """
        events = self._events
        if not events and self._session_log_dir:
            # 会话重载场景：内存为空时从 JSONL 重载投影
            events = self.load_events()
            self._events = events  # 回写缓存，防后续 add_message 后投影丢历史
        if event_types is not None:
            allowed = set(event_types)
            events = [e for e in events if e.get("event_type") in allowed]
        if window is not None and window > 0:
            events = events[-window:]
        msgs = []
        for e in events:
            content = e.get("content") or ""
            if max_content_len is not None and max_content_len > 0:
                content = content[:max_content_len]
            msgs.append(
                {
                    "id": e.get("event_id"),
                    "role": e.get("role"),
                    "content": content,
                    "agent_id": e.get("agent_id"),
                    "timestamp": e.get("timestamp"),
                }
            )
        return msgs

    def rebuild_events_from_messages(self, messages: list[dict]) -> None:
        """将消息 dict 列表重建为 ``_events`` 事件流（快照 restore 回填）。

        消息结构 ``{id, role, content, agent_id, timestamp}`` 重建为
        SessionEvent：event_type 由角色经 ``_infer_event_type`` 推断，
        event_id 用消息 id（与 add_message 对齐）。restore 后 ``_events``
        与 ``messages`` 完全一致，不再携带快照前的历史事件（非消息事件
        进入后 deriveMessages 与 messages 投影才会保持一致）。
        """
        events = []
        for msg in messages:
            event = SessionEvent(
                event_id=msg.get("id"),
                event_type=self._infer_event_type(msg.get("role", "")),
                role=msg.get("role"),
                content=msg.get("content"),
                agent_id=msg.get("agent_id"),
                timestamp=msg.get("timestamp"),
            )
            events.append(event.to_dict())
        self._events = events

    def load_events(self) -> list[dict]:
        """从 JSONL 逐行读取持久化事件（损坏行跳过），返回事件 dict 列表。"""
        if not self._session_log_dir:
            return []
        path = os.path.join(self._session_log_dir, f"{self.meeting_id}.jsonl")
        if not os.path.exists(path):
            return []
        events = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if not isinstance(obj, dict):
                            logger.warning(
                                "跳过非 dict 的 SessionEvent 行: %s...", line[:80]
                            )
                            continue
                        events.append(obj)
                    except json.JSONDecodeError:
                        logger.warning(
                            "跳过损坏的 SessionEvent 行: %s...", line[:80]
                        )
                        continue
        except (IOError, OSError):
            logger.warning("读取 SessionEvent JSONL 失败: %s", path)
            return []
        return events

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
        self._events.clear()
