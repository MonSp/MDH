"""
WebSocket 消息 Pydantic 验证模型

为 ws_handlers.py 中所有 42 种消息类型提供类型安全验证。
通过 validate_ws_message() 统一入口进行消息解析。
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── 基础模型（允许 extra fields 通过，避免破坏现有字段） ──

class _Base(BaseModel):
    """所有 WS 消息模型的基类：保留未知字段"""
    model_config = {"extra": "allow"}


# ── 会话管理 ──

class UserMessage(_Base):
    type: str = Field(..., pattern=r"^(user_message|unified_message)$")
    content: str = Field("", max_length=50000)
    provider: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    execution_preference: Optional[str] = None
    workspace_type: Optional[str] = None
    selected_roles: Optional[List[str]] = None
    role_locations: Optional[Dict[str, str]] = None
    reset: Optional[bool] = None
    multimodal: Optional[bool] = None


class ToolResult(_Base):
    type: str = "tool_result"
    call_id: Optional[str] = None
    result: Optional[Any] = None


class ConfirmResult(_Base):
    type: str = "confirm_result"
    call_id: Optional[str] = None
    confirmed: Optional[bool] = True


class WorkspaceConfirmResponse(_Base):
    type: str = "workspace_confirm_response"
    workspace_type: Optional[str] = "standalone"
    repo_path: Optional[str] = ""
    branch_name: Optional[str] = ""
    output_dir: Optional[str] = ""


class PageContext(_Base):
    type: str = "page_context"
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)


# ── 技能管理 ──

class SaveSkill(_Base):
    type: str = "save_skill"
    name: str = Field("", max_length=200)
    description: str = Field("", max_length=5000)
    steps: List[Any] = Field(default_factory=list)
    skill_type: Optional[str] = "strict"


class GetSkills(_Base):
    type: str = "get_skills"


class DeleteSkill(_Base):
    type: str = "delete_skill"
    dir: str = Field("", max_length=500)


class GenerateSkillSummary(_Base):
    type: str = "generate_skill_summary"
    steps: List[Any] = Field(default_factory=list)
    skill_type: Optional[str] = "strict"


# ── 会议管理 ──

class StartMeeting(_Base):
    type: str = "start_meeting"
    content: str = ""
    selected_roles: List[str] = Field(default_factory=list)
    role_locations: Dict[str, str] = Field(default_factory=dict)
    workspace_type: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    max_iterations: Optional[int] = Field(None, ge=1, le=10)


class MeetingMessage(_Base):
    type: str = "meeting_message"
    content: str = Field(..., min_length=1, max_length=50000)


class TaskAssign(_Base):
    type: str = "task_assign"
    agentId: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=5000)


class TaskDelete(_Base):
    type: str = "task_delete"
    taskId: str = Field("", max_length=200)


class EndMeeting(_Base):
    type: str = "end_meeting"


class GetMeetingStatus(_Base):
    type: str = "get_meeting_status"


class PauseTask(_Base):
    type: str = "pause_task"
    taskId: str = Field("", max_length=200)


class ResumeTask(_Base):
    type: str = "resume_task"
    taskId: str = Field("", max_length=200)


# ── 议程/投票 ──

class AgendaAction(_Base):
    type: str = "agenda_action"
    action: str = Field("", max_length=100)
    topic: str = Field("", max_length=2000)
    reason: str = Field("", max_length=2000)


class OverrideDecision(_Base):
    type: str = "override_decision"
    decision_id: str = Field("", max_length=200)
    new_decision: str = Field("", max_length=5000)


class CreateProposal(_Base):
    type: str = "create_proposal"
    proposerId: str = Field("user", max_length=200)
    content: str = Field(..., min_length=1, max_length=10000)


class CastVote(_Base):
    type: str = "cast_vote"
    proposalId: str = Field(..., min_length=1, max_length=200)
    voterId: str = Field("user", max_length=200)
    approve: Optional[bool] = True
    weight: Optional[float] = Field(None, ge=0.0, le=10.0)
    reason: str = Field("", max_length=2000)


class EvaluateConsensus(_Base):
    type: str = "evaluate_consensus"
    proposalId: str = Field("", max_length=200)


class RequestRetransmit(_Base):
    type: str = "request_retransmit"
    from_sequence_no: Optional[int] = Field(0, ge=0)


# ── 工作区/Bridge/审批 ──

class WorkspaceAction(_Base):
    type: str = "workspace_action"
    action: str = Field("", max_length=100)
    workspace_id: Optional[str] = Field(None, max_length=200)


class ToolCall(_Base):
    type: str = "tool_call"
    tool_name: Optional[str] = Field(None, max_length=200)
    arguments: Dict[str, Any] = Field(default_factory=dict)


class BridgeRegisterAgent(_Base):
    type: str = "bridge_register_agent"
    tsAgentId: Optional[str] = Field(None, max_length=200)
    name: str = Field("Unknown", max_length=200)
    role: str = Field("executor", max_length=100)
    capabilities: List[str] = Field(default_factory=list)


class BridgeUnregisterAgent(_Base):
    type: str = "bridge_unregister_agent"
    tsAgentId: Optional[str] = Field(None, max_length=200)


class BridgeMessage(_Base):
    type: str = "bridge_message"
    fromAgentId: Optional[str] = Field(None, max_length=200)
    toAgentId: Optional[str] = Field(None, max_length=200)
    payload: Dict[str, Any] = Field(default_factory=dict)


class HumanApprovalResponse(_Base):
    type: str = "human_approval_response"
    requestId: str = Field("", max_length=200)
    approved: Optional[bool] = False
    reason: str = Field("", max_length=2000)


class GetPendingApprovals(_Base):
    type: str = "get_pending_approvals"


class RequestApproval(_Base):
    type: str = "request_approval"
    requesterId: str = Field("agent-executor", max_length=200)
    operation: str = Field("unknown_operation", max_length=500)
    description: str = Field("", max_length=5000)
    riskLevel: str = Field("medium", max_length=20)
    confidence: Optional[float] = Field(0.5, ge=0.0, le=1.0)


# ── 检查点 ──

class CheckpointSave(_Base):
    type: str = "checkpoint_save"
    taskId: str = Field("", max_length=200)
    stepIndex: Optional[int] = Field(0, ge=0)
    state: Dict[str, Any] = Field(default_factory=dict)


class CheckpointRestore(_Base):
    type: str = "checkpoint_restore"
    checkpointId: str = Field("", max_length=200)


class GetCheckpoints(_Base):
    type: str = "get_checkpoints"
    taskId: str = Field("", max_length=200)


class CheckpointDelete(_Base):
    type: str = "checkpoint_delete"
    checkpointId: str = Field("", max_length=200)


class SetMaxIterations(_Base):
    type: str = "set_max_iterations"
    maxIterations: Optional[int] = Field(3, ge=1, le=10)


class SaveMeetingSnapshot(_Base):
    type: str = "save_meeting_snapshot"


class RestoreMeetingSnapshot(_Base):
    type: str = "restore_meeting_snapshot"
    checkpointId: str = Field("", max_length=200)


# ── 紧急/审计 ──

class CriticalBlocker(_Base):
    type: str = "critical_blocker"
    agentId: str = Field("unknown", max_length=200)
    content: str = Field("", max_length=10000)
    blockerType: str = Field("unknown", max_length=100)


class GetAuditLog(_Base):
    type: str = "get_audit_log"
    agentId: Optional[str] = Field(None, max_length=200)
    operation: Optional[str] = Field(None, max_length=200)
    riskLevel: Optional[str] = Field(None, max_length=20)


class LogAudit(_Base):
    type: str = "log_audit"
    agentId: str = Field("unknown", max_length=200)
    operation: str = Field("unknown", max_length=200)
    target: str = Field("", max_length=500)
    capability: Optional[str] = Field(None, max_length=200)
    allowed: Optional[bool] = True
    reason: str = Field("", max_length=2000)


# ── 注册表：type string → model ──

MESSAGE_MODELS: Dict[str, type[BaseModel]] = {
    # 会话管理
    "user_message": UserMessage,
    "unified_message": UserMessage,
    "tool_result": ToolResult,
    "confirm_result": ConfirmResult,
    "workspace_confirm_response": WorkspaceConfirmResponse,
    "page_context": PageContext,
    # 技能管理
    "save_skill": SaveSkill,
    "get_skills": GetSkills,
    "delete_skill": DeleteSkill,
    "generate_skill_summary": GenerateSkillSummary,
    # 会议管理
    "start_meeting": StartMeeting,
    "meeting_message": MeetingMessage,
    "task_assign": TaskAssign,
    "task_delete": TaskDelete,
    "end_meeting": EndMeeting,
    "get_meeting_status": GetMeetingStatus,
    "pause_task": PauseTask,
    "resume_task": ResumeTask,
    # 议程/投票
    "agenda_action": AgendaAction,
    "override_decision": OverrideDecision,
    "create_proposal": CreateProposal,
    "cast_vote": CastVote,
    "evaluate_consensus": EvaluateConsensus,
    "request_retransmit": RequestRetransmit,
    # 工作区/Bridge/审批
    "workspace_action": WorkspaceAction,
    "tool_call": ToolCall,
    "bridge_register_agent": BridgeRegisterAgent,
    "bridge_unregister_agent": BridgeUnregisterAgent,
    "bridge_message": BridgeMessage,
    "human_approval_response": HumanApprovalResponse,
    "get_pending_approvals": GetPendingApprovals,
    "request_approval": RequestApproval,
    # 检查点
    "checkpoint_save": CheckpointSave,
    "checkpoint_restore": CheckpointRestore,
    "get_checkpoints": GetCheckpoints,
    "checkpoint_delete": CheckpointDelete,
    "set_max_iterations": SetMaxIterations,
    "save_meeting_snapshot": SaveMeetingSnapshot,
    "restore_meeting_snapshot": RestoreMeetingSnapshot,
    # 紧急/审计
    "critical_blocker": CriticalBlocker,
    "get_audit_log": GetAuditLog,
    "log_audit": LogAudit,
}


class WSValidationError(ValueError):
    """WebSocket 消息验证失败"""
    pass


def validate_ws_message(data: dict) -> BaseModel:
    """验证并解析 WebSocket 消息。

    Args:
        data: 原始消息字典

    Returns:
        验证后的 Pydantic 模型实例

    Raises:
        WSValidationError: 未知消息类型或验证失败
    """
    msg_type = data.get("type", "")
    if not msg_type:
        raise WSValidationError("消息缺少 type 字段")

    model = MESSAGE_MODELS.get(msg_type)
    if not model:
        raise WSValidationError(f"未知消息类型: {msg_type}")

    try:
        return model.model_validate(data)
    except Exception as e:
        raise WSValidationError(f"消息验证失败 ({msg_type}): {e}")
