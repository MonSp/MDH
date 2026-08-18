"""会议相关协议类型"""

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
    AGENDA_UPDATE = "agenda_update"
    PROPOSAL = "proposal"
    VOTE = "vote"
    VOTE_RESULT = "vote_result"
    CRITICAL_BLOCKER = "critical_blocker"
    HUMAN_APPROVAL_REQUEST = "human_approval_request"
    HUMAN_APPROVAL_RESPONSE = "human_approval_response"
    CHECKPOINT_SAVE = "checkpoint_save"
    CHECKPOINT_RESTORE = "checkpoint_restore"
    AUDIT_LOG = "audit_log"
    REQUEST_RETRANSMIT = "request_retransmit"
    SEMANTIC_ANALYSIS_RESULT = "semantic_analysis_result"
    TASK_AUTO_ASSIGNED = "task_auto_assigned"

    WORKFLOW_CREATED = "workflow_created"
    WORKFLOW_STATUS_UPDATE = "workflow_status_update"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_NODE_STATUS_UPDATE = "workflow_node_status_update"


class AgentRole(str, Enum):
    CEO = "ceo"
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


class AgendaPhase(str, Enum):
    IDLE = "idle"
    OPEN_TOPIC = "open_topic"
    DISCUSSION = "discussion"
    PROPOSAL = "proposal"
    VOTING = "voting"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CLOSED = "closed"
    EMERGENCY = "emergency"


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


@dataclass
class TraceContext:
    trace_id: str
    span_id: str
    parent_span_id: str | None = None


@dataclass
class AgendaState:
    phase: AgendaPhase
    topic: str = ""
    current_speaker: str | None = None
    proposal_id: str | None = None


# ── 序列化函数 ──

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


def trace_context_to_dict(ctx: TraceContext) -> dict:
    return {
        "trace_id": ctx.trace_id,
        "span_id": ctx.span_id,
        "parent_span_id": ctx.parent_span_id,
    }


def agenda_state_to_dict(state: AgendaState) -> dict:
    return {
        "phase": state.phase.value,
        "topic": state.topic,
        "current_speaker": state.current_speaker,
        "proposal_id": state.proposal_id,
    }


def dict_to_trace_context(data: dict) -> TraceContext:
    return TraceContext(
        trace_id=data["trace_id"],
        span_id=data["span_id"],
        parent_span_id=data.get("parent_span_id"),
    )


def dict_to_agenda_state(data: dict) -> AgendaState:
    return AgendaState(
        phase=AgendaPhase(data["phase"]),
        topic=data.get("topic", ""),
        current_speaker=data.get("current_speaker"),
        proposal_id=data.get("proposal_id"),
    )
