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
