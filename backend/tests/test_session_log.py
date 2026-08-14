"""SessionEvent 事件流：统一写入口 + JSONL 持久化 + 投影接口"""

import json
import os

import pytest

from meeting import MeetingSession, SessionEvent, SessionEventType


def test_add_message_writes_structured_event(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    msg = m.add_message("agent", "你好", "agent-1")
    assert msg["role"] == "agent"
    # 事件已持久化
    log_file = tmp_path / "m1.jsonl"
    assert log_file.exists()
    line = json.loads(log_file.read_text().strip().splitlines()[-1])
    assert line["event_type"] in ("agent_message", "user_message")
    assert line["agent_id"] == "agent-1"


def test_add_message_returns_legacy_shape(tmp_path):
    """add_message 返回结构保持 {id, role, content, agent_id, timestamp}"""
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    msg = m.add_message("agent", "你好", "agent-1")
    assert set(msg) == {"id", "role", "content", "agent_id", "timestamp"}
    assert m.messages[-1] == msg
    # 事件 event_id 与消息 id 对齐，便于追溯
    line = json.loads((tmp_path / "m1.jsonl").read_text().strip().splitlines()[-1])
    assert line["event_id"] == msg["id"]


def test_reload_events_from_disk(tmp_path):
    m1 = MeetingSession("m1", session_log_dir=str(tmp_path))
    m1.add_message("agent", "A", "agent-1")
    m1.add_message("user", "B", None)

    m2 = MeetingSession("m1", session_log_dir=str(tmp_path))
    events = m2.load_events()
    assert len(events) == 2
    assert events[0]["content"] == "A"
    assert events[0]["event_type"] == "agent_message"
    assert events[1]["event_type"] == "user_message"


def test_derive_messages_projects_from_events(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    m.add_message("agent", "发言一", "agent-1")
    m.add_message("agent", "发言二", "agent-2")
    msgs = m.deriveMessages(window=1, max_content_len=100)
    assert len(msgs) == 1
    assert msgs[0]["content"] == "发言二"
    assert set(msgs[0]) >= {"id", "role", "content", "agent_id", "timestamp"}


def test_no_dir_falls_back_to_memory(tmp_path):
    m = MeetingSession("m2")  # 无 session_log_dir → 纯内存（向后兼容）
    m.add_message("agent", "X", "agent-1")
    assert len(m.messages) == 1
    assert m.load_events() == []


def test_derive_messages_filters_by_event_types(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    m.add_message("user", "用户提问", None)
    m.add_message("agent", "智能体回复", "agent-1")
    msgs = m.deriveMessages(event_types=["agent_message"])
    assert len(msgs) == 1
    assert msgs[0]["content"] == "智能体回复"
    assert msgs[0]["role"] == "agent"


def test_derive_messages_truncates_content(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    m.add_message("agent", "abcdefghij", "agent-1")
    msgs = m.deriveMessages(max_content_len=4)
    assert msgs[0]["content"] == "abcd"


def test_load_events_skips_corrupted_lines(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    m.add_message("agent", "好行", "agent-1")
    log_file = tmp_path / "m1.jsonl"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write("{corrupted json line\n")
        f.write("\n")
        f.write('{"event_id":"x"}\n')
    events = m.load_events()
    assert len(events) == 2  # 1 好行 + 1 有效（损坏行与空行被跳过）
    assert events[0]["content"] == "好行"
    assert events[-1]["event_id"] == "x"


def test_jsonl_ioerror_falls_back_to_memory(tmp_path, monkeypatch):
    """IOError 时静默降级为纯内存，不破坏 add_message 行为"""
    m = MeetingSession("m1", session_log_dir=str(tmp_path))

    import builtins

    real_open = builtins.open

    def fail_open(*args, **kwargs):
        if args and "jsonl" in str(args[0]):
            raise OSError("disk full (simulated)")
        return real_open(*args, **kwargs)

    monkeypatch.setattr(builtins, "open", fail_open)
    # 不应抛出
    msg = m.add_message("agent", "降级消息", "agent-1")
    assert msg["content"] == "降级消息"
    assert m.messages[0]["content"] == "降级消息"
    monkeypatch.undo()
    # 内存事件仍在，可正常投影
    msgs = m.deriveMessages()
    assert msgs[0]["content"] == "降级消息"


def test_reload_then_append_keeps_history(tmp_path):
    """重载→追加后投影仍含全部事件（防历史丢失）"""
    m1 = MeetingSession("m1", session_log_dir=str(tmp_path))
    m1.add_message("agent", "A1", "a")
    m1.add_message("agent", "A2", "b")

    m2 = MeetingSession("m1", session_log_dir=str(tmp_path))
    first = m2.deriveMessages()
    assert len(first) == 2
    m2.add_message("agent", "B1", "c")
    second = m2.deriveMessages()
    assert [x["content"] for x in second] == ["A1", "A2", "B1"]


def test_load_events_skips_non_dict_json_lines(tmp_path):
    """合法 JSON 非 dict 行（如 123）被跳过而非引发 AttributeError"""
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    m.add_message("agent", "好行", "agent-1")
    log_file = tmp_path / "m1.jsonl"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write("123\n")
        f.write('"a plain string"\n')
    events = m.load_events()
    assert len(events) == 1  # 非 dict 行被跳过
    assert events[0]["content"] == "好行"


def test_session_event_types_minimal_set():
    values = {t.value for t in SessionEventType}
    for expected in (
        "user_message",
        "agent_message",
        "discussion",
        "execution",
        "review",
        "approval",
        "experience_injection",
        "tool",
        "audit",
    ):
        assert expected in values


def test_session_event_dataclass_defaults():
    ev = SessionEvent(event_id="e1")
    assert ev.event_type == SessionEventType.AGENT_MESSAGE
    assert ev.role == ""
    assert ev.content == ""
    assert ev.agent_id is None
    assert ev.phase is None
    assert ev.actor is None
    assert ev.span_id is None
    assert ev.timestamp > 0
    d = ev.to_dict()
    assert d["event_type"] == "agent_message"
