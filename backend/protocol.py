from dataclasses import dataclass, field
from enum import Enum
from typing import List

# LLM 调用失败时的 fallback 消息模板
LLM_FALLBACK_TEMPLATE = "[{role}] 由于网络问题，无法获取详细{content_type}。建议按照标准流程执行。"


# ============================================================================
# 工作流相关数据结构（必须在SemanticAnalysisResult之前定义）
# ============================================================================

class WorkflowNodeStatus(str, Enum):
    """工作流节点状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class WorkflowExecutionStatus(str, Enum):
    """工作流执行状态"""
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class WorkflowNode:
    """工作流节点定义"""
    node_id: str
    task_description: str
    dept_id: str  # 负责部门ID
    input_spec: dict = field(default_factory=dict)
    output_spec: dict = field(default_factory=dict)
    status: WorkflowNodeStatus = WorkflowNodeStatus.PENDING
    result: dict | None = None


@dataclass
class WorkflowEdge:
    """工作流边定义，表示节点间的依赖关系"""
    source_node_id: str
    target_node_id: str
    condition: str | None = None  # 条件表达式


@dataclass
class WorkflowDefinition:
    """工作流定义"""
    workflow_id: str
    name: str
    description: str
    nodes: List[WorkflowNode] = field(default_factory=list)
    edges: List[WorkflowEdge] = field(default_factory=list)
    execution_strategy: str = "sequential"  # sequential, parallel, mixed


@dataclass
class WorkflowExecution:
    """工作流执行实例"""
    execution_id: str
    workflow_id: str
    status: WorkflowExecutionStatus = WorkflowExecutionStatus.CREATED
    started_at: str = ""
    completed_at: str | None = None
    node_states: dict = field(default_factory=dict)  # node_id -> WorkflowNodeStatus
    results: dict = field(default_factory=dict)  # node_id -> result


# ============================================================================
# 其他数据结构
# ============================================================================

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

    # 工作流相关消息类型
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


@dataclass
class SemanticAnalysisResult:
    is_task: bool
    intent: str = "discussion"
    task_description: str = ""
    target_agent_id: str = ""
    reason: str = ""
    discussion_topic: str = ""
    is_workflow: bool = False  # 是否为跨部门复杂任务
    workflow_definition: WorkflowDefinition | None = None  # 工作流定义


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


class Stance(str, Enum):
    SUPPORT = "support"
    OPPOSE = "oppose"
    MODIFY = "modify"
    NEUTRAL = "neutral"


class ConsensusStrategy(str, Enum):
    SIMPLE_MAJORITY = "simple_majority"
    WEIGHTED_VOTE = "weighted_vote"
    ARGUMENT_BASED = "argument_based"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


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


@dataclass
class ArgumentRef:
    message_id: str
    summary: str = ""


@dataclass
class Proposal:
    id: str
    proposer_id: str
    content: str
    stance: Stance = Stance.NEUTRAL
    confidence: float = 1.0
    argument_refs: List[ArgumentRef] = field(default_factory=list)
    created_at: float = 0.0


@dataclass
class Vote:
    proposal_id: str
    voter_id: str
    approve: bool
    weight: float = 1.0
    reason: str = ""


@dataclass
class VoteResult:
    proposal_id: str
    strategy: ConsensusStrategy
    total_votes: int = 0
    approve_count: int = 0
    oppose_count: int = 0
    weighted_approve: float = 0.0
    weighted_oppose: float = 0.0
    accepted: bool = False


@dataclass
class ApprovalRequest:
    id: str
    requester_id: str
    operation: str
    description: str
    risk_level: RiskLevel = RiskLevel.MEDIUM
    confidence: float = 0.5
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: float = 0.0


@dataclass
class Checkpoint:
    id: str
    task_id: str
    step_index: int
    state_snapshot: dict = field(default_factory=dict)
    created_at: float = 0.0


@dataclass
class AuditEntry:
    id: str
    agent_id: str
    operation: str
    target: str
    risk_level: RiskLevel = RiskLevel.LOW
    result: str = ""
    details: dict = field(default_factory=dict)
    timestamp: float = 0.0


@dataclass
class CompensateAction:
    description: str
    action_type: str = ""
    params: dict = field(default_factory=dict)


def semantic_analysis_to_dict(result: SemanticAnalysisResult) -> dict:
    return {
        "is_task": result.is_task,
        "intent": result.intent,
        "task_description": result.task_description,
        "target_agent_id": result.target_agent_id,
        "reason": result.reason,
        "discussion_topic": result.discussion_topic,
        "is_workflow": result.is_workflow,
        "workflow_definition": workflow_definition_to_dict(result.workflow_definition) if result.workflow_definition else None,
    }


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


def argument_ref_to_dict(ref: ArgumentRef) -> dict:
    return {
        "message_id": ref.message_id,
        "summary": ref.summary,
    }


def proposal_to_dict(proposal: Proposal) -> dict:
    return {
        "id": proposal.id,
        "proposer_id": proposal.proposer_id,
        "content": proposal.content,
        "stance": proposal.stance.value,
        "confidence": proposal.confidence,
        "argument_refs": [argument_ref_to_dict(r) for r in proposal.argument_refs],
        "created_at": proposal.created_at,
    }


def vote_to_dict(vote: Vote) -> dict:
    return {
        "proposal_id": vote.proposal_id,
        "voter_id": vote.voter_id,
        "approve": vote.approve,
        "weight": vote.weight,
        "reason": vote.reason,
    }


def vote_result_to_dict(result: VoteResult) -> dict:
    return {
        "proposal_id": result.proposal_id,
        "strategy": result.strategy.value,
        "total_votes": result.total_votes,
        "approve_count": result.approve_count,
        "oppose_count": result.oppose_count,
        "weighted_approve": result.weighted_approve,
        "weighted_oppose": result.weighted_oppose,
        "accepted": result.accepted,
    }


def approval_request_to_dict(req: ApprovalRequest) -> dict:
    return {
        "id": req.id,
        "requester_id": req.requester_id,
        "operation": req.operation,
        "description": req.description,
        "risk_level": req.risk_level.value,
        "confidence": req.confidence,
        "status": req.status.value,
        "created_at": req.created_at,
    }


def checkpoint_to_dict(cp: Checkpoint) -> dict:
    return {
        "id": cp.id,
        "task_id": cp.task_id,
        "step_index": cp.step_index,
        "state_snapshot": cp.state_snapshot,
        "created_at": cp.created_at,
    }


def audit_entry_to_dict(entry: AuditEntry) -> dict:
    return {
        "id": entry.id,
        "agent_id": entry.agent_id,
        "operation": entry.operation,
        "target": entry.target,
        "risk_level": entry.risk_level.value,
        "result": entry.result,
        "details": entry.details,
        "timestamp": entry.timestamp,
    }


def compensate_action_to_dict(action: CompensateAction) -> dict:
    return {
        "description": action.description,
        "action_type": action.action_type,
        "params": action.params,
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


def dict_to_argument_ref(data: dict) -> ArgumentRef:
    return ArgumentRef(
        message_id=data["message_id"],
        summary=data.get("summary", ""),
    )


def dict_to_proposal(data: dict) -> Proposal:
    return Proposal(
        id=data["id"],
        proposer_id=data["proposer_id"],
        content=data["content"],
        stance=Stance(data["stance"]) if "stance" in data else Stance.NEUTRAL,
        confidence=data.get("confidence", 1.0),
        argument_refs=[dict_to_argument_ref(r) for r in data.get("argument_refs", [])],
        created_at=data.get("created_at", 0.0),
    )


def dict_to_vote(data: dict) -> Vote:
    return Vote(
        proposal_id=data["proposal_id"],
        voter_id=data["voter_id"],
        approve=data["approve"],
        weight=data.get("weight", 1.0),
        reason=data.get("reason", ""),
    )


def dict_to_vote_result(data: dict) -> VoteResult:
    return VoteResult(
        proposal_id=data["proposal_id"],
        strategy=ConsensusStrategy(data["strategy"]),
        total_votes=data.get("total_votes", 0),
        approve_count=data.get("approve_count", 0),
        oppose_count=data.get("oppose_count", 0),
        weighted_approve=data.get("weighted_approve", 0.0),
        weighted_oppose=data.get("weighted_oppose", 0.0),
        accepted=data.get("accepted", False),
    )


def dict_to_approval_request(data: dict) -> ApprovalRequest:
    return ApprovalRequest(
        id=data["id"],
        requester_id=data["requester_id"],
        operation=data["operation"],
        description=data["description"],
        risk_level=RiskLevel(data["risk_level"]) if "risk_level" in data else RiskLevel.MEDIUM,
        confidence=data.get("confidence", 0.5),
        status=ApprovalStatus(data["status"]) if "status" in data else ApprovalStatus.PENDING,
        created_at=data.get("created_at", 0.0),
    )


def dict_to_checkpoint(data: dict) -> Checkpoint:
    return Checkpoint(
        id=data["id"],
        task_id=data["task_id"],
        step_index=data["step_index"],
        state_snapshot=data.get("state_snapshot", {}),
        created_at=data.get("created_at", 0.0),
    )


def dict_to_audit_entry(data: dict) -> AuditEntry:
    return AuditEntry(
        id=data["id"],
        agent_id=data["agent_id"],
        operation=data["operation"],
        target=data["target"],
        risk_level=RiskLevel(data["risk_level"]) if "risk_level" in data else RiskLevel.LOW,
        result=data.get("result", ""),
        details=data.get("details", {}),
        timestamp=data.get("timestamp", 0.0),
    )


def dict_to_compensate_action(data: dict) -> CompensateAction:
    return CompensateAction(
        description=data["description"],
        action_type=data.get("action_type", ""),
        params=data.get("params", {}),
    )


def workflow_node_status_to_dict(status: WorkflowNodeStatus) -> dict:
    return {"status": status.value}


def workflow_execution_status_to_dict(status: WorkflowExecutionStatus) -> dict:
    return {"status": status.value}


def workflow_node_to_dict(node: WorkflowNode) -> dict:
    return {
        "node_id": node.node_id,
        "task_description": node.task_description,
        "dept_id": node.dept_id,
        "input_spec": node.input_spec,
        "output_spec": node.output_spec,
        "status": node.status.value,
        "result": node.result,
    }


def workflow_edge_to_dict(edge: WorkflowEdge) -> dict:
    return {
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "condition": edge.condition,
    }


def workflow_definition_to_dict(definition: WorkflowDefinition) -> dict:
    return {
        "workflow_id": definition.workflow_id,
        "name": definition.name,
        "description": definition.description,
        "nodes": [workflow_node_to_dict(n) for n in definition.nodes],
        "edges": [workflow_edge_to_dict(e) for e in definition.edges],
        "execution_strategy": definition.execution_strategy,
    }


def workflow_execution_to_dict(execution: WorkflowExecution) -> dict:
    return {
        "execution_id": execution.execution_id,
        "workflow_id": execution.workflow_id,
        "status": execution.status.value,
        "started_at": execution.started_at,
        "completed_at": execution.completed_at,
        "node_states": {k: v.value for k, v in execution.node_states.items()},
        "results": execution.results,
    }


def dict_to_workflow_node_status(data: str) -> WorkflowNodeStatus:
    return WorkflowNodeStatus(data)


def dict_to_workflow_execution_status(data: str) -> WorkflowExecutionStatus:
    return WorkflowExecutionStatus(data)


def dict_to_workflow_node(data: dict) -> WorkflowNode:
    return WorkflowNode(
        node_id=data["node_id"],
        task_description=data["task_description"],
        dept_id=data["dept_id"],
        input_spec=data.get("input_spec", {}),
        output_spec=data.get("output_spec", {}),
        status=WorkflowNodeStatus(data["status"]) if "status" in data else WorkflowNodeStatus.PENDING,
        result=data.get("result"),
    )


def dict_to_workflow_edge(data: dict) -> WorkflowEdge:
    return WorkflowEdge(
        source_node_id=data["source_node_id"],
        target_node_id=data["target_node_id"],
        condition=data.get("condition"),
    )


def dict_to_workflow_definition(data: dict) -> WorkflowDefinition:
    return WorkflowDefinition(
        workflow_id=data["workflow_id"],
        name=data["name"],
        description=data["description"],
        nodes=[dict_to_workflow_node(n) for n in data.get("nodes", [])],
        edges=[dict_to_workflow_edge(e) for e in data.get("edges", [])],
        execution_strategy=data.get("execution_strategy", "sequential"),
    )


def dict_to_workflow_execution(data: dict) -> WorkflowExecution:
    return WorkflowExecution(
        execution_id=data["execution_id"],
        workflow_id=data["workflow_id"],
        status=WorkflowExecutionStatus(data["status"]) if "status" in data else WorkflowExecutionStatus.CREATED,
        started_at=data.get("started_at", ""),
        completed_at=data.get("completed_at"),
        node_states={k: WorkflowNodeStatus(v) for k, v in data.get("node_states", {}).items()},
        results=data.get("results", {}),
    )
