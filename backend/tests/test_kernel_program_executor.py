"""KernelProgramExecutor — unit tests with mocked AgentKernelClient."""

from __future__ import annotations

import json

from kernel_program_executor import KernelProgramExecutor, resolve_executor
from program_executor import ExecutionResult, ExecutionTelemetry
from program_registry import ProgramManifest, ProgramRegistry, ProgramStatus, ProgramTrigger


class _FakeClient:
    def __init__(self, response=None, raise_exc=None):
        self._response = response or {}
        self._raise = raise_exc
        self.calls = []

    def run_program(self, program_id, payload, timeout_ms=15000):
        self.calls.append((program_id, payload, timeout_ms))
        if self._raise is not None:
            raise self._raise
        return self._response


class _FakeLocal:
    def __init__(self, result: ExecutionResult):
        self._result = result
        self.calls = []

    async def execute(self, program_id, input_data, timeout_seconds=None):
        self.calls.append(program_id)
        return self._result


def _registry_with_promoted(tmp_path) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "packs"))
    m = ProgramManifest(
        program_id="echo_x",
        version="1.0.0",
        status=ProgramStatus.PROMOTED,
        trigger=ProgramTrigger(keywords=["echo"]),
        model_dependency=None,
    )
    # write pack files for local fallback path
    d = reg.pack_dir("echo_x")
    import os

    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "main.py"), "w") as f:
        f.write(
            "import json,sys\n"
            "def run(data):\n"
            "    return {'ok': True, 'echo': data.get('task','')}\n"
            "if __name__=='__main__':\n"
            "    json.dump(run(json.load(sys.stdin)), sys.stdout)\n"
        )
    reg.create(m)
    reg.promote("echo_x", validated_model="deepseek-chat")
    return reg


def test_kernel_success_parses_stdout(tmp_path):
    reg = _registry_with_promoted(tmp_path)
    out = {"ok": True, "echo": "hi"}
    client = _FakeClient(
        {
            "ok": True,
            "stdout": json.dumps(out),
            "errorCode": "",
            "durationMs": 12.0,
            "llmCalls": 0,
        }
    )
    ex = KernelProgramExecutor(client, reg, local_fallback=_FakeLocal(None))
    import asyncio

    r = asyncio.run(ex.execute("echo_x", {"task": "hi"}))
    assert r.success is True
    assert r.output == out
    assert r.telemetry.llm_calls == 0
    assert client.calls[0][0] == "echo_x"


def test_kernel_not_found_falls_back_local(tmp_path):
    reg = _registry_with_promoted(tmp_path)
    client = _FakeClient(
        {"ok": False, "stdout": "", "errorCode": "NOT_FOUND", "durationMs": 1}
    )
    local = _FakeLocal(
        ExecutionResult(success=True, output={"ok": True}, telemetry=ExecutionTelemetry())
    )
    ex = KernelProgramExecutor(client, reg, local_fallback=local)
    import asyncio

    r = asyncio.run(ex.execute("echo_x", {"task": "x"}))
    assert r.success is True
    assert local.calls == ["echo_x"]


def test_kernel_error_no_fallback_on_run_failed(tmp_path):
    reg = _registry_with_promoted(tmp_path)
    client = _FakeClient(
        {
            "ok": False,
            "stdout": "",
            "stderr": "boom",
            "errorCode": "RUN_FAILED",
            "durationMs": 3,
        }
    )
    local = _FakeLocal(
        ExecutionResult(success=True, output={}, telemetry=ExecutionTelemetry())
    )
    ex = KernelProgramExecutor(client, reg, local_fallback=local)
    import asyncio

    r = asyncio.run(ex.execute("echo_x", {}))
    assert r.success is False
    assert r.error_code == "RUN_FAILED"
    assert local.calls == []  # real failure must NOT fall back silently


def test_kernel_connection_error_falls_back(tmp_path):

    reg = _registry_with_promoted(tmp_path)
    client = _FakeClient(raise_exc=ConnectionError("down"))
    local = _FakeLocal(
        ExecutionResult(success=True, output={"ok": 1}, telemetry=ExecutionTelemetry())
    )
    ex = KernelProgramExecutor(client, reg, local_fallback=local)
    import asyncio

    r = asyncio.run(ex.execute("echo_x", {}))
    assert r.success is True
    assert local.calls == ["echo_x"]


def test_resolve_executor_no_socket_uses_local(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "p"))
    ex = resolve_executor(reg, kernel_socket="")
    from program_executor import ProgramExecutor

    assert isinstance(ex, ProgramExecutor)
