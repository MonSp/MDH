"""io_schema/workspace 载荷契约测试 (program-pivot T11)

验收：
- 路由命中的程序收到 `{task, workspace_path, input?}` 载荷；
- io_schema.inputs.workspace_path.required=true 且无工作区 → WORKSPACE_REQUIRED；
- 编译器生成并校验 io_schema 写入 manifest；
- 审阅期望含 workspace 上下文。
"""

import asyncio
import json
import os
import textwrap

from program_compiler import GenerationError, GeneratedProgram, ProgramCompiler, TaskTrajectory
from program_registry import (
    ProgramManifest,
    ProgramRegistry,
    ProgramStatus,
    ProgramTrigger,
)
from program_router import (
    build_execution_payload,
    try_program_path,
    workspace_required,
)

# 写文件型程序：从 payload.workspace_path 读路径并写文件
_FILE_MAIN = textwrap.dedent(
    """
    import json, os, sys

    def run(data):
        ws = data.get("workspace_path")
        task = data.get("task", "")
        if not ws:
            return {"ok": False, "error": "no workspace"}
        path = os.path.join(ws, "out.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(task)
        return {"ok": True, "files_written": [path], "task": task}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_FILE_TEST = textwrap.dedent(
    """
    import main

    def test_run(tmp_path):
        result = main.run({"task": "hello", "workspace_path": str(tmp_path)})
        assert result["ok"] is True
        assert (tmp_path / "out.txt").read_text() == "hello"
    """
)

_ECHO_MAIN = textwrap.dedent(
    """
    import json, sys

    def run(data):
        return {"echo_task": data.get("task"), "has_ws": "workspace_path" in data,
                "ws": data.get("workspace_path"), "inp": data.get("input"), "ok": True}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_ECHO_TEST = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"task": "x", "workspace_path": None})["ok"] is True
    """
)

_WS_SCHEMA = {
    "inputs": {
        "task": {"type": "string", "required": True},
        "workspace_path": {"type": "string", "required": True},
    },
    "outputs": {"description": "files_written under workspace"},
}


def _seed(
    tmp_path,
    program_id: str,
    main_src: str,
    test_src: str,
    *,
    io_schema=None,
    keywords=None,
    promote: bool = True,
) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(
        ProgramManifest(
            program_id=program_id,
            version="1.0.0",
            trigger=ProgramTrigger(keywords=keywords or ["写文件", "输出文件"]),
            io_schema=io_schema or {},
        )
    )
    pack = reg.pack_dir(program_id)
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(main_src)
    tests = os.path.join(pack, "tests")
    os.makedirs(tests, exist_ok=True)
    with open(os.path.join(tests, "test_main.py"), "w", encoding="utf-8") as f:
        f.write(test_src)
    if promote:
        reg.promote(program_id)
        reg.record_validation(program_id, model="deepseek-chat")
    return reg


async def _review_pass(prompt: str) -> str:
    return json.dumps({"verdict": "pass", "issues": [], "summary": "正确"})


def _run(coro):
    return asyncio.run(coro)


# ── 载荷组装 ─────────────────────────────────────────


def test_build_execution_payload_defaults():
    reg_manifest = ProgramManifest(
        program_id="p", version="1.0.0", trigger=ProgramTrigger()
    )
    p = build_execution_payload("任务A", reg_manifest)
    assert p == {"task": "任务A", "workspace_path": None}


def test_build_execution_payload_input_and_workspace():
    m = ProgramManifest(
        program_id="p", version="1.0.0", trigger=ProgramTrigger()
    )
    p = build_execution_payload(
        "任务B", m, workspace_path="/tmp/ws", input_data={"k": 1}
    )
    assert p["task"] == "任务B"
    assert p["workspace_path"] == "/tmp/ws"
    assert p["input"] == {"k": 1}


def test_build_payload_input_cannot_override_reserved_keys():
    m = ProgramManifest(
        program_id="p", version="1.0.0", trigger=ProgramTrigger()
    )
    p = build_execution_payload(
        "任务C",
        m,
        workspace_path="/tmp/ws",
        input_data={"task": "HACK", "workspace_path": "/evil"},
    )
    # 保留键不被 input_data 覆盖（放在 input 子字段）
    assert p["task"] == "任务C"
    assert p["workspace_path"] == "/tmp/ws"
    assert p["input"]["task"] == "HACK"


def test_workspace_required_detection():
    m = ProgramManifest(
        program_id="p",
        version="1.0.0",
        trigger=ProgramTrigger(),
        io_schema=_WS_SCHEMA,
    )
    assert workspace_required(m) is True

    m2 = ProgramManifest(
        program_id="p2",
        version="1.0.0",
        trigger=ProgramTrigger(),
        io_schema={
            "inputs": {
                "task": {"type": "string", "required": True},
                "workspace_path": {"type": "string", "required": False},
            }
        },
    )
    assert workspace_required(m2) is False

    m3 = ProgramManifest(
        program_id="p3", version="1.0.0", trigger=ProgramTrigger()
    )
    assert workspace_required(m3) is False


# ── 路由端到端载荷 ───────────────────────────────────


def test_payload_reaches_run_with_workspace(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    reg = _seed(tmp_path, "file_prog", _FILE_MAIN, _FILE_TEST, io_schema=_WS_SCHEMA)
    outcome = _run(
        try_program_path(
            "请写文件：生成 out.txt",
            reg,
            review_generate=_review_pass,
            workspace_path=str(ws),
        )
    )
    assert outcome.handled is True
    assert outcome.task_result["path_used"] == "program"
    out = outcome.task_result["output"]
    assert out["ok"] is True
    assert out["files_written"] == [str(ws / "out.txt")]
    assert (ws / "out.txt").read_text() == "请写文件：生成 out.txt"


def test_workspace_required_falls_back_when_no_ws(tmp_path):
    reg = _seed(tmp_path, "file_prog", _FILE_MAIN, _FILE_TEST, io_schema=_WS_SCHEMA)
    outcome = _run(
        try_program_path(
            "请写文件：生成 out.txt",
            reg,
            review_generate=_review_pass,
            workspace_path=None,
        )
    )
    assert outcome.handled is False
    assert outcome.fallback_reason == "WORKSPACE_REQUIRED"
    assert outcome.review_issues  # 可观测


def test_optional_workspace_still_executes_without_ws(tmp_path):
    reg = _seed(tmp_path, "echo_prog", _ECHO_MAIN, _ECHO_TEST)
    outcome = _run(
        try_program_path(
            "请写文件：echo", reg, review_generate=_review_pass, workspace_path=None
        )
    )
    assert outcome.handled is True
    out = outcome.task_result["output"]
    assert out["has_ws"] is True  # 键存在
    assert out["ws"] is None
    assert out["echo_task"] == "请写文件：echo"


def test_input_data_passed_as_input_field(tmp_path):
    reg = _seed(tmp_path, "echo_prog", _ECHO_MAIN, _ECHO_TEST)
    outcome = _run(
        try_program_path(
            "请写文件：echo",
            reg,
            review_generate=_review_pass,
            workspace_path="/tmp/ws-x",
            input_data={"n": 42},
        )
    )
    assert outcome.handled is True
    out = outcome.task_result["output"]
    assert out["ws"] == "/tmp/ws-x"
    assert out["inp"] == {"n": 42}


def test_review_expectation_includes_workspace(tmp_path):
    """有 workspace 时 review prompt 含 workspace_path。"""
    seen: list[str] = []

    async def _review_capture(prompt: str) -> str:
        seen.append(prompt)
        return json.dumps({"verdict": "pass", "issues": [], "summary": "ok"})

    ws = tmp_path / "ws"
    ws.mkdir()
    reg = _seed(tmp_path, "file_prog", _FILE_MAIN, _FILE_TEST, io_schema=_WS_SCHEMA)
    outcome = _run(
        try_program_path(
            "请写文件：生成 out.txt",
            reg,
            review_generate=_review_capture,
            workspace_path=str(ws),
        )
    )
    assert outcome.handled is True
    assert seen and "workspace_path" in seen[0]
    assert str(ws) in seen[0]


# ── 编译器 io_schema ─────────────────────────────────


def test_generated_program_validates_io_schema():
    ok = {
        "program_id": "ok_prog",
        "main_py": "def run(data):\n    return data\n",
        "test_py": "def test_x():\n    assert True\n",
        "io_schema": {
            "inputs": {
                "task": {"type": "string", "required": True},
                "workspace_path": {"type": "string", "required": True},
            }
        },
    }
    parsed = GeneratedProgram.model_validate(ok)
    assert parsed.io_schema["inputs"]["workspace_path"]["required"] is True


def test_generated_program_rejects_task_not_required():
    bad = {
        "program_id": "bad_prog",
        "main_py": "def run(data):\n    return data\n",
        "test_py": "def test_x():\n    assert True\n",
        "io_schema": {
            "inputs": {"task": {"type": "string", "required": False}}
        },
    }
    try:
        GeneratedProgram.model_validate(bad)
        raise AssertionError("expected ValidationError")
    except ValueError as e:
        assert "task" in str(e)


def test_generated_program_rejects_input_without_type():
    bad = {
        "program_id": "bad2",
        "main_py": "def run(data):\n    return data\n",
        "test_py": "def test_x():\n    assert True\n",
        "io_schema": {"inputs": {"foo": {"required": True}}},
    }
    try:
        GeneratedProgram.model_validate(bad)
        raise AssertionError("expected ValidationError")
    except ValueError as e:
        assert "type" in str(e)


def test_compile_writes_io_schema_to_manifest(tmp_path):
    draft = {
        "program_id": "compiled_ws",
        "version": "1.0.0",
        "description": "写文件程序",
        "trigger_keywords": ["写文件"],
        "io_schema": _WS_SCHEMA,
        "main_py": _FILE_MAIN,
        "test_py": _FILE_TEST,
    }

    async def _gen(prompt: str) -> str:
        assert "workspace_path" in prompt  # 编译提示词含载荷契约
        assert "io_schema" in prompt
        return json.dumps(draft, ensure_ascii=False)

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    manifest = asyncio.run(
        ProgramCompiler(reg).compile(
            TaskTrajectory(
                task_description="写一个文件到工作区",
                steps=["打开路径", "写入"],
                success=True,
            ),
            _gen,
        )
    )
    assert manifest.status == ProgramStatus.CANDIDATE
    assert manifest.io_schema["inputs"]["workspace_path"]["required"] is True
    # 持久化后读回
    loaded = reg.get("compiled_ws")
    assert loaded is not None
    assert loaded.io_schema["inputs"]["task"]["required"] is True


def test_compile_rejects_invalid_io_schema(tmp_path):
    draft = {
        "program_id": "bad_schema",
        "main_py": "def run(data):\n    return data\n",
        "test_py": "def test_x():\n    assert True\n",
        "io_schema": {"inputs": {"task": {"type": "string", "required": False}}},
    }

    async def _gen(prompt: str) -> str:
        return json.dumps(draft)

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    try:
        asyncio.run(
            ProgramCompiler(reg).compile(
                TaskTrajectory(task_description="t", success=True), _gen
            )
        )
        raise AssertionError("expected GenerationError")
    except GenerationError as e:
        assert "io_schema" in str(e) or "task" in str(e)
    # 无半成品残留
    assert reg.get("bad_schema") is None


def test_server_program_route_passes_workspace(tmp_path, monkeypatch):
    """server._program_route_fn 把 context.workspace_path 透传到 try_program_path。"""
    import server
    from routers import programs as programs_router

    reg = _seed(
        tmp_path,
        "file_prog",
        _FILE_MAIN,
        _FILE_TEST,
        io_schema=_WS_SCHEMA,
        keywords=["写文件"],
    )
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(server, "_program_registry", reg)

    ws = tmp_path / "server_ws"
    ws.mkdir()

    outcome = asyncio.run(
        server._program_route_fn(
            "请写文件：生成 out.txt",
            {
                "api_key": "",  # 无 key → REVIEW_UNAVAILABLE，但载荷已组装执行过
                "model_name": "deepseek-chat",
                "workspace_path": str(ws),
            },
        )
    )
    # 无审阅生成器 → REVIEW_UNAVAILABLE 回退，但执行已发生（文件已写）
    assert outcome.handled is False
    assert outcome.fallback_reason == "REVIEW_UNAVAILABLE"
    assert (ws / "out.txt").is_file()
