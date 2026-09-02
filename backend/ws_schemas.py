"""
WebSocket 消息 Pydantic 验证模型

为 ws_handlers.py 中所有 42 种消息类型提供类型安全验证。
通过 validate_ws_message() 统一入口进行消息解析。
"""

from typing import Any

from pydantic import BaseModel, Field

# ── 基础模型（允许 extra fields 通过，避免破坏现有字段） ──

class _Base(BaseModel):
    """所有 WS 消息模型的基类：保留未知字段"""
    model_config = {"extra": "allow"}


# ── 会话管理 ──

class UserMessage(_Base):
    type: str = Field(..., pattern=r"^(user_message|unified_message)$")
    content: str = Field("", max_length=50000)
    provider: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    model_name: str | None = None
    execution_preference: str | None = None
    workspace_type: str | None = None
    selected_roles: list[str] | None = None
    role_locations: dict[str, str] | None = None
    reset: bool | None = None
    multimodal: bool | None = None


class ToolResult(_Base):
    type: str = "tool_result"
    call_id: str | None = None
    result: Any | None = None


class ConfirmResult(_Base):
    type: str = "confirm_result"
    call_id: str | None = None
    confirmed: bool | None = True


class WorkspaceConfirmResponse(_Base):
    type: str = "workspace_confirm_response"
    workspace_type: str | None = "standalone"
    repo_path: str | None = ""
    branch_name: str | None = ""
    output_dir: str | None = ""


class PageContext(_Base):
    type: str = "page_context"
    context: dict[str, Any] | None = Field(default_factory=dict)


# ── 技能管理 ──

class SaveSkill(_Base):
    type: str = "save_skill"
    name: str = Field("", max_length=200)
    description: str = Field("", max_length=5000)
    steps: list[Any] = Field(default_factory=list)
    skill_type: str | None = "strict"


class GetSkills(_Base):
    type: str = "get_skills"


class DeleteSkill(_Base):
    type: str = "delete_skill"
    dir: str = Field("", max_length=500)


class GenerateSkillSummary(_Base):
    type: str = "generate_skill_summary"
    steps: list[Any] = Field(default_factory=list)
    skill_type: str | None = "strict"


# ── 会议管理 ──

class StartMeeting(_Base):
    type: str = "start_meeting"
    content: str = ""
    selected_roles: list[str] = Field(default_factory=list)
    role_locations: dict[str, str] = Field(default_factory=dict)
    workspace_type: str | None = None
    provider: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    model_name: str | None = None
    max_iterations: int | None = Field(None, ge=1, le=10)


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
    approve: bool | None = True
    weight: float | None = Field(None, ge=0.0, le=10.0)
    reason: str = Field("", max_length=2000)


class EvaluateConsensus(_Base):
    type: str = "evaluate_consensus"
    proposalId: str = Field("", max_length=200)


class RequestRetransmit(_Base):
    type: str = "request_retransmit"
    from_sequence_no: int | None = Field(0, ge=0)


# ── 工作区/Bridge/审批 ──

class WorkspaceAction(_Base):
    type: str = "workspace_action"
    action: str = Field("", max_length=100)
    workspace_id: str | None = Field(None, max_length=200)


class ToolCall(_Base):
    type: str = "tool_call"
    tool_name: str | None = Field(None, max_length=200)
    arguments: dict[str, Any] = Field(default_factory=dict)


class BridgeRegisterAgent(_Base):
    type: str = "bridge_register_agent"
    tsAgentId: str | None = Field(None, max_length=200)
    name: str = Field("Unknown", max_length=200)
    role: str = Field("executor", max_length=100)
    capabilities: list[str] = Field(default_factory=list)


class BridgeUnregisterAgent(_Base):
    type: str = "bridge_unregister_agent"
    tsAgentId: str | None = Field(None, max_length=200)


class BridgeMessage(_Base):
    type: str = "bridge_message"
    fromAgentId: str | None = Field(None, max_length=200)
    toAgentId: str | None = Field(None, max_length=200)
    payload: dict[str, Any] = Field(default_factory=dict)


class HumanApprovalResponse(_Base):
    type: str = "human_approval_response"
    requestId: str = Field("", max_length=200)
    approved: bool | None = False
    reason: str = Field("", max_length=2000)


class GetPendingApprovals(_Base):
    type: str = "get_pending_approvals"


class RequestApproval(_Base):
    type: str = "request_approval"
    requesterId: str = Field("agent-executor", max_length=200)
    operation: str = Field("unknown_operation", max_length=500)
    description: str = Field("", max_length=5000)
    riskLevel: str = Field("medium", max_length=20)
    confidence: float | None = Field(0.5, ge=0.0, le=1.0)


# ── 检查点 ──

class CheckpointSave(_Base):
    type: str = "checkpoint_save"
    taskId: str = Field("", max_length=200)
    stepIndex: int | None = Field(0, ge=0)
    state: dict[str, Any] = Field(default_factory=dict)


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
    maxIterations: int | None = Field(3, ge=1, le=10)


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
    agentId: str | None = Field(None, max_length=200)
    operation: str | None = Field(None, max_length=200)
    riskLevel: str | None = Field(None, max_length=20)


class LogAudit(_Base):
    type: str = "log_audit"
    agentId: str = Field("unknown", max_length=200)
    operation: str = Field("unknown", max_length=200)
    target: str = Field("", max_length=500)
    capability: str | None = Field(None, max_length=200)
    allowed: bool | None = True
    reason: str = Field("", max_length=2000)


# ── 注册表：type string → model ──

MESSAGE_MODELS: dict[str, type[BaseModel]] = {
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
