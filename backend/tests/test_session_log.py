"""SessionEvent 事件流：统一写入口 + JSONL 持久化 + 投影接口"""

import json

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


def test_add_before_derive_keeps_history(tmp_path):
    """重载会话先 add_message 再 deriveMessages 仍含磁盘历史（续会顺序）"""
    m1 = MeetingSession("m1", session_log_dir=str(tmp_path))
    m1.add_message("agent", "A1", "a")
    m1.add_message("agent", "A2", "b")

    m2 = MeetingSession("m1", session_log_dir=str(tmp_path))
    m2.add_message("agent", "B1", "c")   # 先 add
    msgs = m2.deriveMessages()
    assert [x["content"] for x in msgs] == ["A1", "A2", "B1"]


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


# === 会议快照投影（save_meeting_snapshot 使用 deriveMessages(window=50)）===

def test_snapshot_projection_contains_last_n_events(tmp_path):
    """快照投影含最近 N 事件：60 条消息投影 window=50 → 最近 50 条。"""
    m = MeetingSession("snap1", session_log_dir=str(tmp_path))
    for i in range(60):
        m.add_message("agent", f"msg-{i:02d}", "agent-1")
    # 与 save_meeting_snapshot 生产调用一致：显式限定消息类事件类型
    projected = m.deriveMessages(
        event_types=["user_message", "agent_message", "system"], window=50
    )
    assert len(projected) == 50
    # 最近 50 条即第 11~60 条
    assert projected[0]["content"] == "msg-10"
    assert projected[-1]["content"] == "msg-59"
    # 结构与既有 messages 元素一致（快照 payload 结构不变）
    assert set(projected[0]) == {"id", "role", "content", "agent_id", "timestamp"}
    # 与 messages[-50:] 逐条对齐（event_id == 消息 id）
    assert [p["id"] for p in projected] == [msg["id"] for msg in m.messages[-50:]]


def test_snapshot_projection_excludes_non_message_events(tmp_path):
    """快照投影显式限定消息类事件：非消息事件（如 discussion）被排除。"""
    m = MeetingSession("snap3", session_log_dir=str(tmp_path))
    m.add_message("agent", "正常消息", "agent-1")
    # 向 _events 塞一个非消息事件（如后续扩展的 discussion）
    m._events.append(
        {
            "event_id": "ev-disc-1",
            "event_type": "discussion",
            "role": "",
            "content": "讨论过程",
            "agent_id": None,
            "timestamp": 0,
        }
    )
    projected = m.deriveMessages(
        event_types=["user_message", "agent_message", "system"], window=50
    )
    assert [p["content"] for p in projected] == ["正常消息"]
    # 不加 event_types 过滤时全量投影仍含非消息事件（过滤器是唯一防线）
    assert [e["content"] for e in m.deriveMessages()] == ["正常消息", "讨论过程"]


def test_snapshot_projection_under_window_returns_all(tmp_path):
    """少于 window 时返回全部（与 messages[-50:] 语义一致）。"""
    m = MeetingSession("snap2", session_log_dir=str(tmp_path))
    for i in range(3):
        m.add_message("user", f"q{i}", None)
    projected = m.deriveMessages(
        event_types=["user_message", "agent_message", "system"], window=50
    )
    assert len(projected) == 3


# === 快照 restore 回填事件流（rebuild_events_from_messages）===

def test_restore_rebuild_events_matches_messages(tmp_path):
    """restore 回填后 deriveMessages 与 messages 完全一致（事件流一致）。"""
    m = MeetingSession("rst1", session_log_dir=str(tmp_path))
    m.add_message("user", "提问", None)
    m.add_message("agent", "回复", "agent-1")

    # 模拟快照前状态：_events 保留完整事件流 + 一个非消息事件
    m._events.append(
        {
            "event_id": "ev-x",
            "event_type": "review",
            "role": "",
            "content": "审查事件",
            "agent_id": None,
            "timestamp": 0,
        }
    )
    snapshot_messages = m.deriveMessages(
        event_types=["user_message", "agent_message", "system"], window=50
    )

    # restore 语义：替换 messages + 回填 _events
    restored = list(snapshot_messages)
    m.messages = restored
    m.rebuild_events_from_messages(restored)

    assert [p["id"] for p in m.deriveMessages()] == [msg["id"] for msg in m.messages]
    assert [p["content"] for p in m.deriveMessages()] == [
        msg["content"] for msg in m.messages
    ]
    # 非消息事件不再出现
    assert all(e["event_type"] in ("user_message", "agent_message", "system")
               for e in m._events)
    assert all(e["event_id"] != "ev-x" for e in m._events)


def test_restore_rebuild_events_role_mapping(tmp_path):
    """rebuild 时 event_type 由角色推断（user→user_message 等），event_id 用消息 id。"""
    m = MeetingSession("rst2", session_log_dir=str(tmp_path))
    msgs = [
        {"id": "m1", "role": "user", "content": "q", "agent_id": None, "timestamp": 1.0},
        {"id": "m2", "role": "agent", "content": "a", "agent_id": "a1", "timestamp": 2.0},
        {"id": "m3", "role": "system", "content": "s", "agent_id": None, "timestamp": 3.0},
    ]
    m.rebuild_events_from_messages(msgs)
    assert [e["event_type"] for e in m._events] == [
        "user_message", "agent_message", "system",
    ]
    assert [e["event_id"] for e in m._events] == ["m1", "m2", "m3"]
    assert m._events[1]["agent_id"] == "a1"
    # 投影结构保持既有消息形状
    projected = m.deriveMessages()
    assert [p["id"] for p in projected] == ["m1", "m2", "m3"]
    assert [p["role"] for p in projected] == ["user", "agent", "system"]


# === 安全审计事件持久化（SecurityMiddleware._log_audit → audit.jsonl）===

def test_audit_event_persisted_to_jsonl(tmp_path):
    """_log_audit 在内存 append 外追加写入 audit.jsonl（event_type="audit"）。"""
    from security import RiskLevel, SecurityMiddleware

    mw = SecurityMiddleware(audit_log_dir=str(tmp_path))
    mw._log_audit(
        "agent-exec", "bash", "run pytest", "file_operation",
        False, "High-risk tool requires approval", ["reviewer-1"],
    )
    log_file = tmp_path / "audit.jsonl"
    assert log_file.exists()
    lines = [l for l in log_file.read_text(encoding="utf-8").strip().splitlines() if l.strip()]
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["event_type"] == "audit"
    assert entry["agent_id"] == "agent-exec"
    assert entry["operation"] == "bash"
    assert entry["target"] == "run pytest"
    assert entry["risk_level"] in (RiskLevel.HIGH.value, RiskLevel.LOW.value)
    assert entry["allowed"] is False
    assert entry["reason"] == "High-risk tool requires approval"
    assert entry["timestamp"] > 0
    assert entry["signers"] == ["reviewer-1"]


def test_audit_events_reload_from_disk(tmp_path):
    """审计事件持久化可重载：新实例/读取端可从 audit.jsonl 重放全部事件。"""
    from security import SecurityMiddleware

    mw = SecurityMiddleware(audit_log_dir=str(tmp_path))
    mw._log_audit("a1", "read_file", "x.py", "file_operation", True, "ok", [])
    mw._log_audit("a2", "write_file", "y.py", "file_operation", False, "denied", [])

    lines = [l for l in (tmp_path / "audit.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 2
    reloaded = [json.loads(l) for l in lines]
    assert [e["agent_id"] for e in reloaded] == ["a1", "a2"]
    assert [e["operation"] for e in reloaded] == ["read_file", "write_file"]
    assert all(e["event_type"] == "audit" for e in reloaded)
    assert all(e["timestamp"] > 0 for e in reloaded)


def test_audit_ioerror_falls_back_to_memory(tmp_path, monkeypatch):
    """audit.jsonl 写入 IOError 时降级为纯内存，不破坏 _log_audit 行为。"""
    from security import SecurityMiddleware

    mw = SecurityMiddleware(audit_log_dir=str(tmp_path))
    import builtins

    real_open = builtins.open

    def fail_open(*args, **kwargs):
        if args and "audit.jsonl" in str(args[0]):
            raise OSError("disk full (simulated)")
        return real_open(*args, **kwargs)

    monkeypatch.setattr(builtins, "open", fail_open)
    mw._log_audit("a1", "bash", "ls", "file_operation", True, "ok", [])
    monkeypatch.undo()
    # 不抛异常，内存审计日志仍在
    assert len(mw._audit_log) == 1
    assert mw._audit_log[0].id


def test_audit_ioerror_sticky_downgrade(tmp_path, monkeypatch):
    """首次 IOError 后持久化一次性关闭：后续审计不再重试写盘（防刷屏）。"""
    from security import SecurityMiddleware

    mw = SecurityMiddleware(audit_log_dir=str(tmp_path))
    import builtins

    real_open = builtins.open
    fail_count = {"n": 0}

    def fail_open(*args, **kwargs):
        if args and "audit.jsonl" in str(args[0]):
            fail_count["n"] += 1
            raise OSError("disk full (simulated)")
        return real_open(*args, **kwargs)

    monkeypatch.setattr(builtins, "open", fail_open)
    mw._log_audit("a1", "bash", "ls", "file_operation", True, "ok", [])
    assert fail_count["n"] == 1
    # 降级粘性：持久化目录被关闭
    assert mw._audit_log_dir is None
    # 第二次写入不再触碰文件系统（open 不再被调用）
    mw._log_audit("a2", "bash", "pwd", "file_operation", True, "ok", [])
    monkeypatch.undo()
    assert fail_count["n"] == 1
    # 内存审计两条仍在
    assert len(mw._audit_log) == 2


def test_audit_event_uses_audit_event_type():
    """审计事件复用 SessionEvent 事件结构判别字段 event_type='audit'。"""
    assert SessionEventType.AUDIT.value == "audit"
