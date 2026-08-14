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
