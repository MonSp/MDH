"""ProgramExecutor 测试 (program-pivot T2)

验收：对 promoted 程序包执行返回结构化结果与 telemetry（llm_calls=0、耗时），
超时/异常按契约报错。
"""

import asyncio
import textwrap

from fastapi.testclient import TestClient

import server
from program_executor import ProgramExecutor
from program_registry import ProgramRegistry
from routers import programs as programs_router

server.BACKEND_TOKEN = ""
client = TestClient(server.app)

_ECHO_MAIN = textwrap.dedent(
    """
    import json, sys

    def run(data):
        return {"echo": data, "ok": True}

    if __name__ == "__main__":
        payload = json.load(sys.stdin)
        json.dump(run(payload), sys.stdout)
    """
)

_CRASH_MAIN = textwrap.dedent(
    """
    import sys
    sys.stderr.write("boom: ValueError\\n")
    sys.exit(3)
    """
)

_SLEEP_MAIN = textwrap.dedent(
    """
    import json, sys, time
    time.sleep(30)
    json.dump({}, sys.stdout)
    """
)


def _make_pack(tmp_path, program_id: str, main_src: str) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    from program_registry import ProgramManifest, ProgramTrigger

    reg.create(
        ProgramManifest(
            program_id=program_id,
            version="1.0.0",
            trigger=ProgramTrigger(keywords=["echo"]),
        )
    )
    from os.path import join

    with open(join(reg.pack_dir(program_id), "main.py"), "w", encoding="utf-8") as f:
        f.write(main_src)
    return reg


def _exec(reg, program_id, input_data, timeout=None):
    return asyncio.run(
        ProgramExecutor(reg).execute(program_id, input_data, timeout_seconds=timeout)
    )


# ── 执行器行为 ───────────────────────────────────────


def test_successful_execution_returns_output_and_telemetry(tmp_path):
    reg = _make_pack(tmp_path, "echo_prog", _ECHO_MAIN)
    reg.promote("echo_prog")
    result = _exec(reg, "echo_prog", {"task": "deploy"})
    assert result.success is True
    assert result.output == {"echo": {"task": "deploy"}, "ok": True}
    assert result.telemetry.llm_calls == 0
    assert result.telemetry.duration_ms > 0
    assert result.telemetry.timed_out is False
    assert result.telemetry.version == "1.0.0"


def test_not_promoted_rejected(tmp_path):
    reg = _make_pack(tmp_path, "cand_prog", _ECHO_MAIN)
    result = _exec(reg, "cand_prog", {})
    assert result.success is False
    assert result.error_code == "NOT_PROMOTED"
    assert result.telemetry.llm_calls == 0


def test_not_found(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    result = _exec(reg, "missing_prog", {})
    assert result.error_code == "NOT_FOUND"


def test_missing_main_py(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    from program_registry import ProgramManifest

    reg.create(ProgramManifest(program_id="no_main", version="1.0.0"))
    reg.promote("no_main")
    result = _exec(reg, "no_main", {})
    assert result.error_code == "PROGRAM_MISSING"


def test_timeout_reports_structured_error(tmp_path):
    reg = _make_pack(tmp_path, "sleep_prog", _SLEEP_MAIN)
    reg.promote("sleep_prog")
    result = _exec(reg, "sleep_prog", {}, timeout=1)
    assert result.success is False
    assert result.error_code == "TIMEOUT"
    assert result.telemetry.timed_out is True
    assert result.telemetry.llm_calls == 0
    assert result.telemetry.duration_ms >= 1000


def test_crash_reports_stderr(tmp_path):
    reg = _make_pack(tmp_path, "crash_prog", _CRASH_MAIN)
    reg.promote("crash_prog")
    result = _exec(reg, "crash_prog", {})
    assert result.success is False
    assert result.error_code == "EXECUTION_ERROR"
    assert "boom: ValueError" in result.error
    assert result.telemetry.llm_calls == 0


def test_invalid_stdout_json(tmp_path):
    reg = _make_pack(
        tmp_path,
        "badout_prog",
        "import sys\nsys.stdout.write('not-json')\n",
    )
    reg.promote("badout_prog")
    result = _exec(reg, "badout_prog", {})
    assert result.success is False
    assert result.error_code == "INVALID_OUTPUT"


def test_legacy_not_executable(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    from program_registry import ProgramKind, ProgramManifest

    # 直接写入 legacy 条目（create 不允许 kind=legacy）
    m = ProgramManifest(
        program_id="legacy_x",
        version="1.0.0",
        kind=ProgramKind.LEGACY_SKILL_PACK,
        status="deprecated",
    )
    reg._write_manifest(m)  # noqa: SLF001 — 测试直写
    result = _exec(reg, "legacy_x", {})
    assert result.error_code == "NOT_EXECUTABLE"


# ── 端点 ────────────────────────────────────────────


def test_execute_endpoint_success(tmp_path, monkeypatch):
    reg = _make_pack(tmp_path, "echo_ep", _ECHO_MAIN)
    reg.promote("echo_ep")
    monkeypatch.setattr(programs_router, "_registry", reg)
    resp = client.post(
        "/api/programs/echo_ep/execute", json={"input": {"a": 1}}
    )
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["output"]["echo"] == {"a": 1}
    assert body["data"]["telemetry"]["llm_calls"] == 0
    assert body["data"]["telemetry"]["duration_ms"] >= 0


def test_execute_endpoint_timeout_has_telemetry(tmp_path, monkeypatch):
    reg = _make_pack(tmp_path, "sleep_ep", _SLEEP_MAIN)
    reg.promote("sleep_ep")
    monkeypatch.setattr(programs_router, "_registry", reg)
    resp = client.post(
        "/api/programs/sleep_ep/execute",
        json={"input": {}, "timeout_seconds": 1},
    )
    body = resp.json()
    assert body["success"] is False
    assert body["code"] == "TIMEOUT"
    assert body["detail"]["telemetry"]["llm_calls"] == 0
    assert body["detail"]["telemetry"]["timed_out"] is True
