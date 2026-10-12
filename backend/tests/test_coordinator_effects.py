"""coordinator_effects 通知回归 — agent_id 只作位置参数传递（曾导致全部通知静默失败）"""
import asyncio
from types import SimpleNamespace

from coordinator_effects import notify_agent_status, notify_artifact_created


def test_notify_agent_status_passes_agent_id_positionally_only():
    captured = {}

    async def on_message(agent_id, text, delta, **kwargs):
        captured["agent_id"] = agent_id
        captured["text"] = text
        captured["kwargs"] = kwargs

    coord = SimpleNamespace(_current_on_message=on_message)
    asyncio.run(notify_agent_status(
        coord, "agent-x", "working", current_tool="bash", artifact_count=2,
    ))

    assert captured["agent_id"] == "agent-x"
    assert captured["kwargs"]["msg_type"] == "agent_status_update"
    assert captured["kwargs"]["status"] == "working"
    assert captured["kwargs"]["current_tool"] == "bash"
    # 不得再出现 agent_id 关键字（send(agent_id, ...) 会 "got multiple values"）
    assert "agent_id" not in captured["kwargs"]


def test_notify_artifact_created_passes_agent_id_positionally_only():
    captured = {}

    async def on_message(agent_id, text, delta, **kwargs):
        captured["agent_id"] = agent_id
        captured["kwargs"] = kwargs

    coord = SimpleNamespace(_current_on_message=on_message)
    asyncio.run(notify_artifact_created(
        coord, "agent-y", 3, ["py", "md"], summary="生成了3个文件",
    ))

    assert captured["agent_id"] == "agent-y"
    assert captured["kwargs"]["msg_type"] == "artifact_created"
    assert captured["kwargs"]["files_count"] == 3
    assert "agent_id" not in captured["kwargs"]


def test_notify_noop_when_no_callback():
    coord = SimpleNamespace(_current_on_message=None)
    asyncio.run(notify_agent_status(coord, "agent-z", "idle"))  # 不抛异常
