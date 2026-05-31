from dataclasses import dataclass, field
from enum import Enum
from typing import List


class MeetingMessageType(str, Enum):
    START_MEETING = "start_meeting"
    END_MEETING = "end_meeting"
    MEETING_MESSAGE = "meeting_message"
    TASK_ASSIGN = "task_assign"
    GET_MEETING_STATUS = "get_meeting_status"

    MEETING_STARTED = "meeting_started"
    MEETING_ENDED = "meeting_ended"
    MEETING_MESSAGE_ACK = "meeting_message_ack"
    AGENT_MESSAGE = "agent_message"
    TASK_ASSIGNED = "task_assigned"
    AGENT_STATUS_UPDATE = "agent_status_update"
    MEETING_ERROR = "meeting_error"


class AgentRole(str, Enum):
    PLANNER = "planner"
    EXECUTOR = "executor"
    MONITOR = "monitor"
    REVIEWER = "reviewer"
    COORDINATOR = "coordinator"


class MeetingAgentStatus(str, Enum):
    IDLE = "idle"
    MEETING = "meeting"
    WORKING = "working"
    SPEAKING = "speaking"


@dataclass
class MeetingAgentInfo:
    id: str
    name: str
    role: AgentRole
    status: MeetingAgentStatus
    capabilities: List[str] = field(default_factory=list)


@dataclass
class MeetingTaskInfo:
    id: str
    agent_id: str
    description: str
    status: str
    created_at: float


@dataclass
class MeetingSummary:
    total_agents: int
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
    messages_count: int


def meeting_agent_to_dict(agent: MeetingAgentInfo) -> dict:
    return {
        "id": agent.id,
        "name": agent.name,
        "role": agent.role.value,
        "status": agent.status.value,
        "capabilities": agent.capabilities,
    }


def meeting_task_to_dict(task: MeetingTaskInfo) -> dict:
    return {
        "id": task.id,
        "agent_id": task.agent_id,
        "description": task.description,
        "status": task.status,
        "created_at": task.created_at,
    }


def meeting_summary_to_dict(summary: MeetingSummary) -> dict:
    return {
        "total_agents": summary.total_agents,
        "total_tasks": summary.total_tasks,
        "completed_tasks": summary.completed_tasks,
        "failed_tasks": summary.failed_tasks,
        "pending_tasks": summary.pending_tasks,
        "messages_count": summary.messages_count,
    }
