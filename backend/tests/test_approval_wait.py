"""审批真阻塞等待：ApprovalManager 等待人工决策，超时抛 TimeoutError"""

import asyncio

import pytest

from approval_manager import ApprovalManager
from protocol import RiskLevel


async def test_approval_manager_wait_and_respond():
    """request_approval 后 wait_for_decision 阻塞，handle_response 解除"""
    manager = ApprovalManager()

    async def send_fn(payload):
        return None

    approval = await manager.request_approval(
        requester_id="agent-executor",
        operation="task_execution",
        description="执行高风险任务",
        risk_level=RiskLevel.HIGH,
        confidence=0.8,
        send_fn=send_fn,
    )

    async def respond():
        await asyncio.sleep(0.05)
        await manager.handle_response(approval.id, True, "同意", send_fn)

    task = asyncio.create_task(respond())
    decision = await manager.wait_for_decision(approval.id, timeout=5.0)
    await task

    assert decision["approved"] is True
    assert decision["request_id"] == approval.id


async def test_approval_manager_timeout_raises():
    """超时后 wait_for_decision 抛 TimeoutError（由调用方按配置默认通过）"""
    manager = ApprovalManager()

    async def send_fn(payload):
        return None

    approval = await manager.request_approval(
        requester_id="agent-executor",
        operation="task_execution",
        description="测试",
        risk_level=RiskLevel.MEDIUM,
        confidence=0.5,
        send_fn=send_fn,
    )

    with pytest.raises(asyncio.TimeoutError):
        await manager.wait_for_decision(approval.id, timeout=0.05)


async def test_coordinator_injects_approval_manager(tmp_path):
    """MeetingCoordinator 构造注入 ApprovalManager，审批阶段可真阻塞等待"""
    from meeting import MeetingSession
    from meeting_coordinator import MeetingCoordinator

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "routing_table.json").write_text(
        '{"departments": []}', encoding="utf-8"
    )

    meeting = MeetingSession("test-meeting")
    meeting.start()
    manager = ApprovalManager()
    coord = MeetingCoordinator(
        meeting_session=meeting,
        provider="openai",
        model_name="gpt-4",
        api_key="test-key",
        base_url="",
        data_dir=str(data_dir),
        approval_manager=manager,
        approval_timeout=123.0,
    )

    assert coord._approval_manager is manager
    assert coord._approval_timeout == 123.0


# ── 拒绝文案合成（R2） ──
# 审批阶段嵌在 process_user_message 长流程中，消息合成已提取为模块级辅助函数
# _build_task_approval_message，可直接单测（无需跑完整串行流程）。

def test_build_task_approval_message_rejected_no_reason():
    """回归用例：无 reason 的拒绝（server 允许 reason 为空）不得误报"通过"。"""
    from meeting_coordinator import _build_task_approval_message

    msg = _build_task_approval_message(approved=False, reason="")
    assert msg == "项目经理：任务执行审批被拒绝。"
    assert "通过" not in msg


def test_build_task_approval_message_rejected_with_reason():
    from meeting_coordinator import _build_task_approval_message

    msg = _build_task_approval_message(approved=False, reason="方案不可行")
    assert msg == "项目经理：任务执行审批被拒绝（方案不可行）。"


def test_build_task_approval_message_approved_no_reason():
    from meeting_coordinator import _build_task_approval_message

    msg = _build_task_approval_message(approved=True, reason="")
    assert msg == "项目经理：任务执行审批通过。"


def test_build_task_approval_message_approved_with_reason():
    from meeting_coordinator import _build_task_approval_message

    msg = _build_task_approval_message(approved=True, reason="同意")
    assert msg == "项目经理：任务执行审批通过（同意）。"


# ── 审批请求推送可追溯（R1） ──
# coordinator 的 send_fn lambda 读取 payload["request"]["id"] / ["riskLevel"]，
# 校验 ApprovalManager 推送的 payload 契约，防止字段改名导致 lambda 静默失效。

async def test_approval_push_payload_contains_id_and_risk():
    """审批请求推送 payload 含 request.id 与 request.riskLevel，供聊天流识别追溯。"""
    manager = ApprovalManager()
    captured = {}

    async def send_fn(payload):
        captured["payload"] = payload

    approval = await manager.request_approval(
        requester_id="agent-executor",
        operation="task_execution",
        description="执行高风险任务",
        risk_level=RiskLevel.HIGH,
        confidence=0.8,
        send_fn=send_fn,
    )

    req = captured["payload"]["request"]
    assert req["id"] == approval.id
    assert req["riskLevel"] == "high"
    assert req["description"]


# ── 审批推送结构化通道（P0 Critical 2） ──
# coordinator 的审批 send_fn 不再把 payload 降级为聊天文本，而是透传完整
# human_approval_request payload，并以 kind='approval' 标记结构化通道；
# 上层发送包装点（CeoAgent._send_fn）据此直接发送完整结构化消息。

async def test_approval_send_fn_passes_full_payload_with_approval_kind():
    """coordinator 审批 send_fn 透传完整 payload，on_message 收到 kind='approval'。"""
    from meeting_coordinator import _build_approval_send_fn

    captured = {}

    async def on_message(agent_id, text, delta):
        captured["agent_id"] = agent_id
        captured["text"] = text
        captured["delta"] = delta

    payload = {
        "type": "human_approval_request",
        "request": {
            "id": "req-1",
            "requesterId": "agent-executor",
            "operation": "task_execution",
            "description": "执行高风险任务",
            "riskLevel": "high",
            "confidence": 0.8,
        },
    }
    send_fn = _build_approval_send_fn(on_message)
    await send_fn(payload)

    assert captured["agent_id"] == "coordinator"
    assert captured["delta"] == "approval"
    assert captured["text"] is payload
    assert captured["text"]["type"] == "human_approval_request"
    assert captured["text"]["request"]["id"] == "req-1"


async def test_ceo_send_fn_passes_structured_approval_payload_through():
    """CeoAgent._send_fn 对 kind='approval' + dict 内容直接透传完整结构化消息。

    其他消息保持原 agent_message 行为，避免审批推送降级为聊天文本。
    """
    from ceo_agent import CeoAgent

    sent = []

    class _FakeSession:
        def __init__(self):
            self._seq = 0

        def next_sequence(self):
            self._seq += 1
            return self._seq

    async def send_message(msg):
        sent.append(msg)

    session = _FakeSession()
    agent = CeoAgent(
        session=session,
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
    )
    send = agent._send_fn(send_message)

    payload = {
        "type": "human_approval_request",
        "request": {"id": "req-1", "description": "执行高风险任务", "riskLevel": "high"},
    }
    await send("coordinator", payload, "approval")

    assert len(sent) == 1
    assert sent[0]["type"] == "human_approval_request"
    assert sent[0]["request"]["id"] == "req-1"
    assert "sequence_no" in sent[0]

    # 普通 agent_message 行为保持不变
    await send("coordinator", "普通文本", "")
    assert len(sent) == 2
    assert sent[1]["type"] == "agent_message"
    assert sent[1]["agentId"] == "coordinator"
    assert sent[1]["content"] == "普通文本"
    assert sent[1]["delta"] == ""


# ── CeoAgent 共享引擎注入（P0 Important 3） ──
# ceo_agent 复杂路径构造 MeetingCoordinator 时须注入与 server start_meeting
# 一致的共享 workflow_engine 与 approval_manager，否则该路径仍用私有引擎且审批自动通过。

def test_ceo_agent_accepts_shared_engines():
    """CeoAgent 构造透传共享 workflow_engine / approval_manager。"""
    from ceo_agent import CeoAgent
    from approval_manager import ApprovalManager
    from workflow_engine import WorkflowEngine

    class _FakeSession:
        def next_sequence(self):
            return 0

    manager = ApprovalManager()
    engine = WorkflowEngine()
    agent = CeoAgent(
        session=_FakeSession(),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        workflow_engine=engine,
        approval_manager=manager,
    )
    assert agent._workflow_engine is engine
    assert agent._approval_manager is manager
