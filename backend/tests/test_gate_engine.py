"""把关点引擎：request_gate/handle_gate_response 成对审计 + task/gate 关联"""
import pytest
from approval_manager import ApprovalManager


async def test_request_approval_carries_gate_fields():
    manager = ApprovalManager()
    approval = await manager.request_approval(
        requester_id="agent-minutes",
        operation="minutes_draft",
        description="撰写会议纪要初稿",
        task_id="task-1",
        gate_id="gate-1",
    )
    assert approval.task_id == "task-1"
    assert approval.gate_id == "gate-1"


async def test_request_gate_pairs_audit_events():
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="agent-minutes",
        operation="minutes_review",
        description="纪要待确认",
        task_id="task-1",
        gate_id="gate-1",
    )
    assert pending.gate_id == "gate-1"
    audit = manager.get_gate_audit("gate-1")
    assert [e["event"] for e in audit] == ["gate/requested"]
    assert audit[0]["task_id"] == "task-1"

    ok = await manager.handle_gate_response(pending.id, True, reason="内容无误")
    assert ok is True
    events = [e["event"] for e in manager.get_gate_audit("gate-1")]
    assert events == ["gate/requested", "gate/decided"]
    decided = manager.get_gate_audit("gate-1")[-1]
    assert decided["approved"] is True
    assert decided["reason"] == "内容无误"
    assert decided["gate_id"] == "gate-1"


async def test_gate_audit_filter_empty_returns_all():
    manager = ApprovalManager()
    await manager.request_gate(requester_id="a", operation="op", description="d", gate_id="g1")
    await manager.request_gate(requester_id="a", operation="op", description="d", gate_id="g2")
    assert len(manager.get_gate_audit()) == 2
    assert len(manager.get_gate_audit("g1")) == 1


async def test_handle_gate_response_unknown_id_keeps_audit():
    """对不存在的 request_id 调 handle_gate_response → False，且不产生 decided 审计事件。

    回归：失败路径（request 不存在）不得破坏 requested/decided 成对审计不变量。
    """
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="agent-minutes",
        operation="minutes_review",
        description="纪要待确认",
        task_id="task-1",
        gate_id="gate-1",
    )
    assert [e["event"] for e in manager.get_gate_audit()] == ["gate/requested"]

    ok = await manager.handle_gate_response("no-such-request", True, reason="unknown")
    assert ok is False
    assert [e["event"] for e in manager.get_gate_audit()] == ["gate/requested"]
    assert [e["event"] for e in manager.get_gate_audit(pending.gate_id)] == ["gate/requested"]


async def test_handle_gate_response_double_decide_single_event():
    """同一 request 连续两次 handle_gate_response → 首次 True 二次 False，decided 仅 1 条。

    回归：已被处理的 request 不得重复 append gate/decided。
    """
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="agent-minutes",
        operation="minutes_review",
        description="纪要待确认",
        task_id="task-1",
        gate_id="gate-1",
    )

    first = await manager.handle_gate_response(pending.id, True, reason="同意")
    assert first is True
    second = await manager.handle_gate_response(pending.id, True, reason="重复提交")
    assert second is False

    audit = manager.get_gate_audit(pending.gate_id)
    decided = [e for e in audit if e["event"] == "gate/decided"]
    assert len(decided) == 1
    assert decided[0]["approved"] is True
    assert decided[0]["reason"] == "同意"
    # 不变量：requested/decided 严格成对
    assert [e["event"] for e in audit] == ["gate/requested", "gate/decided"]


async def test_gate_request_payload_passthrough_task_and_gate():
    """WS 契约：human_approval_request payload 透传 taskId/gateId（把关点定位用）。"""
    manager = ApprovalManager()
    captured = {}

    async def send_fn(payload):
        captured["payload"] = payload

    pending = await manager.request_gate(
        requester_id="agent-minutes",
        operation="minutes_review",
        description="纪要待确认",
        task_id="task-42",
        gate_id="gate-7",
        send_fn=send_fn,
    )

    req = captured["payload"]["request"]
    assert captured["payload"]["type"] == "human_approval_request"
    assert req["taskId"] == "task-42"
    assert req["gateId"] == "gate-7"
    assert req["id"] == pending.id


async def test_request_gate_carries_approver():
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="a", operation="op", description="d", task_id="t1", gate_id="g1",
        approver="emp-1",
    )
    assert pending.approver == "emp-1"
    assert manager.get_gate_audit("g1")[0]["approver"] == "emp-1"


async def test_request_approval_payload_has_approver():
    captured = {}
    async def send_fn(payload):
        captured.update(payload)
    manager = ApprovalManager()
    await manager.request_approval(
        requester_id="a", operation="op", description="d", approver="emp-1", send_fn=send_fn,
    )
    assert captured["request"]["approver"] == "emp-1"


async def test_pending_requests_include_task_gate_and_approver():
    manager = ApprovalManager()
    await manager.request_gate(
        requester_id="a", operation="op", description="d",
        task_id="task-1", gate_id="gate-1", approver="emp-1",
    )
    pending = manager.get_pending_requests()
    assert len(pending) == 1
    assert pending[0]["taskId"] == "task-1"
    assert pending[0]["gateId"] == "gate-1"
    assert pending[0]["approver"] == "emp-1"


async def test_gate_decided_audit_includes_approver():
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="a", operation="op", description="d",
        task_id="t1", gate_id="g1", approver="emp-1",
    )
    await manager.handle_gate_response(pending.id, True, reason="ok")
    decided = [e for e in manager.get_gate_audit("g1") if e["event"] == "gate/decided"]
    assert decided and decided[0]["approver"] == "emp-1"
