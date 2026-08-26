"""工作流节点把关钩子：带 gate 节点发起 request_gate 并等待决定"""
import asyncio
from types import SimpleNamespace

from approval_manager import ApprovalManager
from meeting_coordinator import MeetingCoordinator
from protocol import WorkflowNode


def _coordinator_with_approval():
    coordinator = MeetingCoordinator.__new__(MeetingCoordinator)
    # _run_node_gate 的 requester_id 经 _find_agent_id(AgentRole.CEO) 解析，需 meeting.agents
    coordinator.meeting = SimpleNamespace(agents=[])
    coordinator._approval_manager = ApprovalManager()
    coordinator._approval_timeout = 5.0
    # 审批推送走 noop 路径：_run_node_gate 经 _build_approval_send_fn(_noop_on_message) 生效，
    # 无需在实例上挂 _build_approval_send_fn（该实例属性从未被读取）。
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


async def test_gate_timeout_defaults_to_pass():
    """超时默认通过：超过 _approval_timeout 后 _run_node_gate 返回 None，且把关请求已入审计。"""
    c = _coordinator_with_approval()
    c._approval_timeout = 0.05
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-1", "stage": "review"})
    result = await c._run_node_gate(node)
    assert result is None
    audit = c._approval_manager.get_gate_audit()
    assert any(e.get("event") == "gate/requested" for e in audit)


async def test_gate_without_approval_manager_returns_none():
    """无 approval_manager 时把关跳过：带 gate 节点直接返回 None。"""
    c = _coordinator_with_approval()
    c._approval_manager = None
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-1", "stage": "review"})
    assert await c._run_node_gate(node) is None


async def test_run_node_gate_passes_approver():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-7", "stage": "review"})
    gate_task = asyncio.create_task(c._run_node_gate(node))
    await asyncio.sleep(0.05)
    pending = c._approval_manager.get_pending_requests()
    assert pending[0]["approver"] == "emp-7"
    await c._approval_manager.handle_gate_response(pending[0]["id"], True)
    await gate_task
