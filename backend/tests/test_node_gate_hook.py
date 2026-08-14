"""工作流节点把关钩子：带 gate 节点发起 request_gate 并等待决定"""
import asyncio

import pytest
from approval_manager import ApprovalManager
from meeting_coordinator import MeetingCoordinator
from protocol import WorkflowNode


def _coordinator_with_approval():
    coordinator = MeetingCoordinator.__new__(MeetingCoordinator)
    coordinator._approval_manager = ApprovalManager()
    coordinator._approval_timeout = 5.0
    coordinator._build_approval_send_fn = lambda payload: None
    return coordinator


async def test_no_gate_returns_none():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="extract", task_description="t", dept_id="dept-docs")
    assert await c._run_node_gate(node) is None


async def test_gate_approves_returns_none():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-1", "stage": "review"})
    gate_task = asyncio.create_task(c._run_node_gate(node))
    await asyncio.sleep(0.05)
    pending = c._approval_manager.get_pending_requests()
    assert len(pending) == 1
    await c._approval_manager.handle_gate_response(pending[0]["id"], True, reason="ok")
    result = await gate_task
    assert result is None


async def test_gate_reject_returns_rejected():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-1", "stage": "review"})
    gate_task = asyncio.create_task(c._run_node_gate(node))
    await asyncio.sleep(0.05)
    pending = c._approval_manager.get_pending_requests()
    await c._approval_manager.handle_gate_response(pending[0]["id"], False, reason="需修改")
    result = await gate_task
    assert result == {"status": "rejected", "reason": "需修改"}
