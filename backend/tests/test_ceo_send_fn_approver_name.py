import asyncio

from ceo_agent import CeoAgent


def _make_agent(collector):
    agent = CeoAgent.__new__(CeoAgent)

    class FakeSession:
        def __init__(self):
            self._seq = 0

        def next_sequence(self):
            self._seq += 1
            return self._seq

    agent._session = FakeSession()
    send = agent._send_fn(collector)
    return send


def test_approval_push_injects_approver_name():
    sent = {}

    async def collector(payload):
        sent["payload"] = payload

    send = _make_agent(collector)
    asyncio.run(send("coordinator", {
        "type": "human_approval_request",
        "request": {"id": "r1", "approver": "emp-001", "operation": "node_gate"},
    }, "approval"))

    request = sent["payload"]["request"]
    assert request["approverName"] == "张伟"  # 目录解析


def test_approval_push_no_approver_keeps_empty_name():
    sent = {}

    async def collector(payload):
        sent["payload"] = payload

    send = _make_agent(collector)
    asyncio.run(send("coordinator", {
        "type": "human_approval_request",
        "request": {"id": "r2", "operation": "node_gate"},
    }, "approval"))

    assert sent["payload"]["request"]["approverName"] == ""  # 空 approver → 空串


def test_approval_push_unknown_approver_falls_back_to_raw_id():
    sent = {}

    async def collector(payload):
        sent["payload"] = payload

    send = _make_agent(collector)
    asyncio.run(send("coordinator", {
        "type": "human_approval_request",
        "request": {"id": "r3", "approver": "ghost-id", "operation": "node_gate"},
    }, "approval"))

    assert sent["payload"]["request"]["approverName"] == "ghost-id"  # 未命中回退原 ID
