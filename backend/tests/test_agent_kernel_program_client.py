"""AgentKernelClient program_* methods — transport-level unit tests (mocked)."""

from __future__ import annotations

from agent_kernel_client import AgentKernelClient


class _FakeSock:
    def __init__(self):
        self.sent = []


def _client_with_sent(calls: list) -> AgentKernelClient:
    c = AgentKernelClient.__new__(AgentKernelClient)
    c._socket_path = "/tmp/x"
    c._sock = _FakeSock()
    c._request_id = 0
    c._buffer = b""

    def fake_send(method: str, params: dict | None = None) -> dict:
        calls.append((method, params or {}))
        if method == "listPrograms":
            return {"ok": True, "data": {"programs": [{"programId": "a"}]}}
        if method == "matchProgram":
            return {
                "ok": True,
                "data": {
                    "matched": True,
                    "program": {"programId": "writer", "status": "promoted"},
                },
            }
        if method == "runProgram":
            return {
                "ok": True,
                "data": {
                    "ok": True,
                    "llmCalls": 0,
                    "stdout": '{"ok":true}',
                    "errorCode": "",
                },
            }
        if method == "appendProgramLineage":
            return {"ok": True, "data": {"appended": True}}
        return {"ok": True, "data": {"programId": (params or {}).get("programId", "x")}}

    c._send = fake_send  # type: ignore[method-assign]
    return c


def test_list_programs_calls_kernel():
    calls: list = []
    c = _client_with_sent(calls)
    out = c.list_programs("promoted")
    assert calls[0][0] == "listPrograms"
    assert calls[0][1]["status"] == "promoted"
    assert out[0]["programId"] == "a"


def test_compile_program_params():
    calls: list = []
    c = _client_with_sent(calls)
    c.compile_program(
        "echo_task",
        "1.0.0",
        "def run(d):\n    return {'ok': True}\n",
        "def test_x():\n    pass\n",
        description="echo",
        keywords=["写文件"],
        model_dependency="deepseek-chat",
    )
    m, p = calls[0]
    assert m == "compileProgram"
    assert p["programId"] == "echo_task"
    assert p["keywords"] == ["写文件"]
    assert "def run(" in p["mainPy"]


def test_match_and_run():
    calls: list = []
    c = _client_with_sent(calls)
    hit = c.match_program("请写文件", model="deepseek-chat")
    assert hit is not None and hit["programId"] == "writer"
    r = c.run_program("writer", {"task": "x"}, timeout_ms=5000)
    assert r["ok"] is True
    assert r["llmCalls"] == 0
    assert calls[1][0] == "runProgram"


def test_append_lineage():
    calls: list = []
    c = _client_with_sent(calls)
    assert c.append_program_lineage("writer", {"event": "tested"}) is True
    assert calls[0][1]["event"] == {"event": "tested"}
