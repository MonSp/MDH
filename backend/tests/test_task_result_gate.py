"""交付门禁回归：revision_required 不得放行 task_result.success"""
import asyncio
from types import SimpleNamespace

from ceo_agent import CeoAgent, _review_gate


def _fake_agent():
    agent = object.__new__(CeoAgent)
    agent._workspace = None
    agent._session = SimpleNamespace(next_sequence=lambda: 1)
    return agent


class _Recorder:
    def __init__(self):
        self.messages = []

    async def __call__(self, msg):
        self.messages.append(msg)


def _project():
    return SimpleNamespace(project_id="p1", brief="测试任务")


# ── 纯函数 ──
def test_gate_approved_passes():
    ok, st = _review_gate({"structured_feedback": {"status": "approved"}})
    assert ok and st == "approved"


def test_gate_revision_blocks():
    ok, st = _review_gate({"structured_feedback": {"status": "revision_required"}})
    assert not ok and st == "revision_required"


def test_gate_missing_review_not_blocked():
    ok, st = _review_gate({})
    assert ok and st == ""
    ok, st = _review_gate(None)
    assert ok and st == ""


# ── serial 分支 ──
async def _run_serial(review_status):
    agent = _fake_agent()
    send = _Recorder()
    result = {
        "type": "serial_completed",
        "assignment": {"task_id": "t1"},
        "review_result": {"structured_feedback": {"status": review_status}},
        "execution_results": [{"agent_id": "a", "written_files": ["app.py"]}],
        "discussion_results": [],
    }
    task_result = await agent._handle_coordinator_result(result, _project(), "m1", send)
    return task_result, send


def test_serial_revision_not_success():
    task_result, send = asyncio.run(_run_serial("revision_required"))
    assert task_result["success"] is False
    assert task_result["review_status"] == "revision_required"
    assert task_result["status"] == "completed"  # 执行完成但交付未过门禁
    assert task_result["written_files"] == ["app.py"]  # 产物信息保留
    sent = [m for m in send.messages if m.get("type") == "task_result"]
    assert sent and sent[0]["success"] is False


def test_serial_approved_success():
    task_result, _ = asyncio.run(_run_serial("approved"))
    assert task_result["success"] is True
    assert task_result["review_status"] == "approved"


# ── workflow 分支 ──
def _run_workflow(review_status, wf_status="completed"):
    agent = _fake_agent()
    send = _Recorder()
    result = {
        "type": "workflow_executed",
        "workflow_result": {"execution_id": "w1", "status": wf_status, "results": {}},
        "review_result": {"structured_feedback": {"status": review_status}},
        "analysis": {},
    }
    return asyncio.run(agent._handle_coordinator_result(result, _project(), "m1", send)), send


def test_workflow_revision_blocks():
    task_result, _ = _run_workflow("revision_required")
    assert task_result["success"] is False
    assert task_result["review_status"] == "revision_required"


def test_workflow_failed_blocks_even_if_review_ok():
    task_result, _ = _run_workflow("approved", wf_status="failed")
    assert task_result["success"] is False


def test_workflow_approved_and_completed_passes():
    task_result, _ = _run_workflow("approved", wf_status="completed")
    assert task_result["success"] is True


# ── fallback: vote_rejected ──
def test_vote_rejected_not_success():
    agent = _fake_agent()
    send = _Recorder()
    task_result = asyncio.run(agent._handle_coordinator_result(
        {"type": "vote_rejected"}, _project(), "m1", send,
    ))
    assert task_result["success"] is False
    assert task_result["review_status"] == "vote_rejected"
