"""ProgramCompiler 测试 (program-pivot T3)

验收：成功任务后触发产生 candidate 程序包草稿，tests/ 非空且 manifest 完整。
"""

import asyncio
import json
import os

from fastapi.testclient import TestClient

import server
from program_compiler import (
    GenerationError,
    ProgramCompiler,
    TaskTrajectory,
)
from program_registry import ProgramRegistry, ProgramStatus
from routers import programs as programs_router

server.BACKEND_TOKEN = ""
client = TestClient(server.app)

_DRAFT = {
    "program_id": "deploy_summary",
    "version": "1.0.0",
    "description": "生成部署摘要",
    "trigger_keywords": ["部署摘要", "deploy summary"],
    "main_py": (
        "import json, sys\n\n"
        "def run(data):\n"
        "    return {'summary': data.get('service', ''), 'ok': True}\n\n"
        "if __name__ == '__main__':\n"
        "    json.dump(run(json.load(sys.stdin)), sys.stdout)\n"
    ),
    "test_py": (
        "import main\n\n"
        "def test_run():\n"
        "    assert main.run({'service': 'api'}) == {'summary': 'api', 'ok': True}\n"
    ),
}


async def _fake_generate(prompt: str) -> str:
    assert "def run(" in prompt  # prompt 含硬性要求
    return json.dumps(_DRAFT, ensure_ascii=False)


def _trajectory(**overrides) -> TaskTrajectory:
    base = dict(
        task_description="生成某服务的部署摘要",
        steps=["读取部署配置", "汇总端口与版本", "输出摘要"],
        input_example={"service": "api"},
        output_example={"summary": "api", "ok": True},
        success=True,
    )
    base.update(overrides)
    return TaskTrajectory(**base)


# ── 编译产物 ─────────────────────────────────────────


def test_compile_draft_complete(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    manifest = asyncio.run(
        ProgramCompiler(reg).compile(_trajectory(), _fake_generate)
    )
    assert manifest.status == ProgramStatus.CANDIDATE
    assert manifest.program_id == "deploy_summary"
    assert manifest.version == "1.0.0"
    assert manifest.description
    assert manifest.trigger.keywords == ["部署摘要", "deploy summary"]

    pack = reg.pack_dir("deploy_summary")
    assert os.path.isfile(os.path.join(pack, "main.py"))
    tests_dir = os.path.join(pack, "tests")
    assert os.path.isdir(tests_dir)
    entries = [f for f in os.listdir(tests_dir) if f.endswith(".py")]
    assert entries, "tests/ must be non-empty"
    content = open(os.path.join(tests_dir, entries[0]), encoding="utf-8").read()
    assert content.strip(), "test file must be non-empty"

    # manifest 可读回
    loaded = reg.get("deploy_summary")
    assert loaded is not None and loaded.status == ProgramStatus.CANDIDATE


def test_compile_generated_main_is_executable(tmp_path):
    """草稿产物能被 T2 执行器真跑（draft 自洽性）。"""
    from program_executor import ProgramExecutor

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    asyncio.run(ProgramCompiler(reg).compile(_trajectory(), _fake_generate))
    reg.promote("deploy_summary")
    result = asyncio.run(
        ProgramExecutor(reg).execute("deploy_summary", {"service": "web"})
    )
    assert result.success is True
    assert result.output == {"summary": "web", "ok": True}
    assert result.telemetry.llm_calls == 0


def test_reject_failed_trajectory(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    compiler = ProgramCompiler(reg)
    try:
        asyncio.run(
            compiler.compile(_trajectory(success=False), _fake_generate)
        )
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "successful" in str(e)
    assert reg.list() == []


def test_invalid_generation_json(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    compiler = ProgramCompiler(reg)

    async def bad_gen(prompt: str) -> str:
        return "不是 JSON"

    try:
        asyncio.run(compiler.compile(_trajectory(), bad_gen))
        raise AssertionError("expected GenerationError")
    except GenerationError:
        pass
    assert reg.list() == []


def test_draft_missing_run_rejected(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    compiler = ProgramCompiler(reg)
    broken = dict(_DRAFT, main_py="print('no run function')")

    async def gen(prompt: str) -> str:
        return json.dumps(broken)

    try:
        asyncio.run(compiler.compile(_trajectory(), gen))
        raise AssertionError("expected GenerationError")
    except GenerationError:
        pass


def test_duplicate_program_id(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    compiler = ProgramCompiler(reg)
    asyncio.run(compiler.compile(_trajectory(), _fake_generate))
    try:
        asyncio.run(compiler.compile(_trajectory(), _fake_generate))
        raise AssertionError("expected FileExistsError")
    except FileExistsError:
        pass


def test_write_failure_rolls_back_registry(tmp_path, monkeypatch):
    """写盘失败 → 回滚 candidate 登记，不留无 main.py 的半成品。"""
    import program_compiler as pc

    reg = ProgramRegistry(str(tmp_path / "program_packs"))

    def boom(path, content):
        raise OSError("disk full")

    monkeypatch.setattr(pc, "_write_atomic", boom)
    try:
        asyncio.run(ProgramCompiler(reg).compile(_trajectory(), _fake_generate))
        raise AssertionError("expected OSError")
    except OSError:
        pass
    assert reg.list() == []  # 无残留
    assert not os.path.exists(reg.pack_dir("deploy_summary"))


def test_delete_candidate_and_reject_promoted(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    asyncio.run(ProgramCompiler(reg).compile(_trajectory(), _fake_generate))
    reg.delete("deploy_summary")
    assert reg.get("deploy_summary") is None

    asyncio.run(ProgramCompiler(reg).compile(_trajectory(), _fake_generate))
    reg.promote("deploy_summary")
    try:
        reg.delete("deploy_summary")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
    assert reg.get("deploy_summary") is not None


def test_parse_response_with_prefix_and_suffix(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    compiler = ProgramCompiler(reg)

    async def noisy_gen(prompt: str) -> str:
        return (
            "这是生成结果：\n"
            + json.dumps(_DRAFT, ensure_ascii=False)
            + "\n（以上为 JSON）"
        )

    manifest = asyncio.run(compiler.compile(_trajectory(), noisy_gen))
    assert manifest.program_id == "deploy_summary"


# ── 端点 ────────────────────────────────────────────


def test_compile_endpoint_with_injected_generator(tmp_path, monkeypatch):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_generate_override", _fake_generate)
    resp = client.post(
        "/api/programs/compile",
        json={
            "task_description": "生成某服务的部署摘要",
            "steps": ["读取", "汇总"],
            "input_example": {"service": "api"},
            "output_example": {"summary": "api", "ok": True},
            "success": True,
        },
    )
    body = resp.json()
    assert body["success"] and body["code"] == "COMPILED"
    assert body["data"]["status"] == "candidate"
    assert reg.get("deploy_summary") is not None


def test_compile_endpoint_no_generator(tmp_path, monkeypatch):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_generate_override", None)
    resp = client.post(
        "/api/programs/compile",
        json={"task_description": "任务", "success": True},
    )
    assert resp.json()["code"] == "NO_GENERATOR"


def test_compile_endpoint_failed_trajectory(tmp_path, monkeypatch):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_generate_override", _fake_generate)
    resp = client.post(
        "/api/programs/compile",
        json={"task_description": "任务", "success": False},
    )
    assert resp.json()["code"] == "INVALID_TRAJECTORY"
    assert reg.list() == []
