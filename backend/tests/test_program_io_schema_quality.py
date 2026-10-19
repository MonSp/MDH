"""T12.2 编译器 io_schema 落盘型质量门

验收：落盘启发式触发时 manifest.io_schema.inputs.workspace_path.required=true；
漏声明被自动补写；prompt 含强制文案。
"""

import asyncio
import json
import textwrap

from program_compiler import (
    ProgramCompiler,
    TaskTrajectory,
    ensure_workspace_required,
    is_file_producing,
)
from program_registry import ProgramRegistry, ProgramStatus

_FILE_MAIN = textwrap.dedent(
    """
    import json, os, sys

    def run(data):
        ws = data.get("workspace_path")
        path = os.path.join(ws, "out.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(data.get("task", ""))
        return {"ok": True, "files_written": [path]}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_FILE_TEST = textwrap.dedent(
    """
    import main

    def test_run(tmp_path):
        r = main.run({"task": "x", "workspace_path": str(tmp_path)})
        assert r["ok"] is True
    """
)


def _file_trajectory() -> TaskTrajectory:
    return TaskTrajectory(
        task_description="把结果写文件 out.txt 到工作区",
        steps=["打开路径", "写入文件"],
        output_example={"files_written": ["out.txt"]},
        success=True,
    )


def _summary_trajectory() -> TaskTrajectory:
    return TaskTrajectory(
        task_description="生成一段部署摘要文本",
        steps=["读取配置", "汇总输出"],
        output_example={"summary": "ok"},
        success=True,
    )


# ── 启发式 ───────────────────────────────────────────


def test_is_file_producing_from_trajectory():
    assert is_file_producing(_file_trajectory()) is True
    assert is_file_producing(_summary_trajectory()) is False


def test_is_file_producing_from_main_py():
    assert is_file_producing(None, _FILE_MAIN) is True
    assert (
        is_file_producing(None, "def run(data):\n    return {'s': data.get('task')}\n")
        is False
    )


def test_ensure_workspace_required_injects_and_forces():
    out = ensure_workspace_required({})
    assert out["inputs"]["task"]["required"] is True
    assert out["inputs"]["workspace_path"]["required"] is True

    out2 = ensure_workspace_required(
        {
            "inputs": {
                "task": {"type": "string", "required": True},
                "workspace_path": {"type": "string", "required": False},
            }
        }
    )
    assert out2["inputs"]["workspace_path"]["required"] is True


# ── compile 质量门 ───────────────────────────────────


def test_prompt_forces_workspace_for_file_trajectory():
    prompt = ProgramCompiler(ProgramRegistry("/tmp/x")).build_prompt(
        _file_trajectory()
    )
    assert "落盘型" in prompt
    assert '"required": true' in prompt
    assert "workspace_path" in prompt


def test_prompt_optional_workspace_for_summary():
    prompt = ProgramCompiler(ProgramRegistry("/tmp/x")).build_prompt(
        _summary_trajectory()
    )
    assert "落盘型" not in prompt
    assert '"required": false' in prompt


def test_compile_auto_sets_workspace_required(tmp_path):
    """LLM 漏声明 required=true 时，落盘型自动补写。"""
    draft = {
        "program_id": "file_auto_ws",
        "version": "1.0.0",
        "description": "写文件",
        "trigger_keywords": ["写文件"],
        "io_schema": {
            "inputs": {
                "task": {"type": "string", "required": True},
                "workspace_path": {"type": "string", "required": False},
            }
        },
        "main_py": _FILE_MAIN,
        "test_py": _FILE_TEST,
    }

    async def _gen(prompt: str) -> str:
        assert "落盘型" in prompt
        return json.dumps(draft, ensure_ascii=False)

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    manifest = asyncio.run(
        ProgramCompiler(reg).compile(_file_trajectory(), _gen)
    )
    assert manifest.status == ProgramStatus.CANDIDATE
    assert manifest.io_schema["inputs"]["workspace_path"]["required"] is True
    loaded = reg.get("file_auto_ws")
    assert loaded is not None
    assert loaded.io_schema["inputs"]["workspace_path"]["required"] is True


def test_compile_summary_keeps_optional_workspace(tmp_path):
    """非落盘型不强制 required=true。"""
    draft = {
        "program_id": "summary_keep",
        "version": "1.0.0",
        "description": "摘要",
        "trigger_keywords": ["摘要"],
        "io_schema": {
            "inputs": {
                "task": {"type": "string", "required": True},
                "workspace_path": {"type": "string", "required": False},
            }
        },
        "main_py": "import json,sys\ndef run(data):\n    return {'s': data.get('task')}\n",
        "test_py": "import main\n\ndef test_run():\n    assert main.run({'task':'a'})['s']=='a'\n",
    }

    async def _gen(prompt: str) -> str:
        return json.dumps(draft, ensure_ascii=False)

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    manifest = asyncio.run(
        ProgramCompiler(reg).compile(_summary_trajectory(), _gen)
    )
    assert manifest.io_schema["inputs"]["workspace_path"]["required"] is False
