"""
WebSocket 消息验证模型测试

覆盖：有效消息、边界拒绝、未知类型、extra fields 保留、全类型注册。
"""

import pytest

from ws_schemas import (
    MESSAGE_MODELS,
    StartMeeting,
    UserMessage,
    WSValidationError,
    validate_ws_message,
)

# ── 基本验证 ──

class TestUserMessage:
    def test_valid_user_message(self):
        msg = {"type": "user_message", "content": "Hello"}
        result = validate_ws_message(msg)
        assert isinstance(result, UserMessage)
        assert result.content == "Hello"

    def test_valid_unified_message(self):
        msg = {"type": "unified_message", "content": "Hello", "selected_roles": ["executor"]}
        result = validate_ws_message(msg)
        assert isinstance(result, UserMessage)
        assert result.selected_roles == ["executor"]

    def test_empty_content_allowed_for_user_message(self):
        """user_message 允许空 content（handler 自行检查）"""
        msg = {"type": "user_message", "content": ""}
        result = validate_ws_message(msg)
        assert result.content == ""

    def test_missing_content_defaults_empty(self):
        msg = {"type": "user_message"}
        result = validate_ws_message(msg)
        assert result.content == ""


class TestContentLimits:
    def test_empty_content_rejected_for_meeting_message(self):
        msg = {"type": "meeting_message", "content": ""}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_oversized_content_rejected(self):
        msg = {"type": "meeting_message", "content": "x" * 50001}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_max_length_boundary_accepted(self):
        msg = {"type": "meeting_message", "content": "x" * 50000}
        result = validate_ws_message(msg)
        assert len(result.content) == 50000


class TestUnknownType:
    def test_unknown_message_type_rejected(self):
        msg = {"type": "nonexistent_type", "data": 123}
        with pytest.raises(WSValidationError, match="未知消息类型"):
            validate_ws_message(msg)

    def test_missing_type_rejected(self):
        msg = {"content": "hello"}
        with pytest.raises(WSValidationError, match="缺少 type"):
            validate_ws_message(msg)

    def test_empty_type_rejected(self):
        msg = {"type": "", "content": "hello"}
        with pytest.raises(WSValidationError, match="缺少 type"):
            validate_ws_message(msg)


class TestStartMeeting:
    def test_valid_start_meeting(self):
        msg = {"type": "start_meeting", "selected_roles": ["executor", "reviewer"]}
        result = validate_ws_message(msg)
        assert isinstance(result, StartMeeting)
        assert result.selected_roles == ["executor", "reviewer"]

    def test_start_meeting_defaults(self):
        msg = {"type": "start_meeting"}
        result = validate_ws_message(msg)
        assert result.content == ""
        assert result.selected_roles == []
        assert result.role_locations == {}

    def test_start_meeting_max_iterations_validated(self):
        msg = {"type": "start_meeting", "max_iterations": 0}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_start_meeting_max_iterations_upper_bound(self):
        msg = {"type": "start_meeting", "max_iterations": 11}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)


class TestExtraFields:
    def test_validate_preserves_extra_fields(self):
        """未知字段不应导致验证失败"""
        msg = {"type": "user_message", "content": "hi", "future_field": "value", "count": 42}
        result = validate_ws_message(msg)
        assert result.content == "hi"
        # extra fields 在 model_dump 中保留
        dumped = result.model_dump()
        assert dumped["future_field"] == "value"
        assert dumped["count"] == 42


class TestFieldValidation:
    def test_task_assign_requires_agent_id(self):
        msg = {"type": "task_assign", "description": "do something"}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_task_assign_requires_description(self):
        msg = {"type": "task_assign", "agentId": "agent-1"}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_create_proposal_requires_content(self):
        msg = {"type": "create_proposal"}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_cast_vote_requires_proposal_id(self):
        msg = {"type": "cast_vote"}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_cast_vote_weight_range(self):
        msg = {"type": "cast_vote", "proposalId": "p1", "weight": 11.0}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_confidence_range(self):
        msg = {"type": "request_approval", "confidence": 1.5}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)

    def test_set_max_iterations_range(self):
        msg = {"type": "set_max_iterations", "maxIterations": 15}
        with pytest.raises(WSValidationError, match="消息验证失败"):
            validate_ws_message(msg)


# ── 注册完整性 ──

ALL_HANDLER_TYPES = [
    "user_message", "tool_result", "confirm_result",
    "unified_message", "workspace_confirm_response", "page_context",
    "save_skill", "get_skills", "delete_skill", "generate_skill_summary",
    "start_meeting", "meeting_message", "task_assign", "task_delete",
    "end_meeting", "get_meeting_status", "pause_task", "resume_task",
    "agenda_action", "override_decision", "create_proposal", "cast_vote",
    "evaluate_consensus", "request_retransmit", "workspace_action", "tool_call",
    "bridge_register_agent", "bridge_unregister_agent", "bridge_message",
    "human_approval_response", "get_pending_approvals", "request_approval",
    "checkpoint_save", "checkpoint_restore", "get_checkpoints", "checkpoint_delete",
    "set_max_iterations", "save_meeting_snapshot", "restore_meeting_snapshot",
    "critical_blocker", "get_audit_log", "log_audit",
]


# 有 required 字段的模型需要的最小额外数据
_REQUIRED_FIELDS: dict[str, dict] = {
    "meeting_message": {"content": "test"},
    "task_assign": {"agentId": "a1", "description": "d1"},
    "create_proposal": {"content": "proposal text"},
    "cast_vote": {"proposalId": "p1"},
}


@pytest.mark.parametrize("msg_type", ALL_HANDLER_TYPES)
def test_all_message_types_have_models(msg_type):
    """每个 handler 注册的消息类型都应有对应的验证模型"""
    assert msg_type in MESSAGE_MODELS, f"缺少消息类型模型: {msg_type}"
    # 验证含 type + required 字段的消息可解析
    minimal = {"type": msg_type, **_REQUIRED_FIELDS.get(msg_type, {})}
    result = validate_ws_message(minimal)
    assert result is not None
