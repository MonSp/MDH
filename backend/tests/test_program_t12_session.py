"""T12.3 同会话 workspace 复用 + T12.5 WORKSPACE_REQUIRED 可观测

验收：
- 会话已有 self._workspace 时，program 路径载荷带同一路径并写入文件；
- 无 workspace 时 WORKSPACE_REQUIRED 回退且 CEO 发出可感知提示（非 NO_MATCH 静默）。
"""

import asyncio
import os
import textwrap
from types import SimpleNamespace

from program_registry import (
    ProgramManifest,
    ProgramRegistry,
    ProgramTrigger,
)
from program_router import try_program_path

_FILE_MAIN = textwrap.dedent(
    """
    import json, os, sys

    def run(data):
        ws = data.get("workspace_path")
        if not ws:
            return {"ok": False, "error": "no workspace"}
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
        assert main.run({"task": "x", "workspace_path": str(tmp_path)})["ok"]
    """
)

_WS_SCHEMA = {
    "inputs": {
        "task": {"type": "string", "required": True},
        "workspace_path": {"type": "string", "required": True},
    },
    "outputs": {"description": "file under ws"},
}


async def _review_pass(prompt: str) -> str:
    import json as _json

    return _json.dumps({"verdict": "pass", "issues": [], "summary": "ok"})


def _seed_file_prog(tmp_path) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(
        ProgramManifest(
            program_id="file_writer",
            version="1.0.0",
            trigger=ProgramTrigger(keywords=["写文件", "生成 out"]),
            io_schema=_WS_SCHEMA,
        )
    )
    pack = reg.pack_dir("file_writer")
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(_FILE_MAIN)
    tests = os.path.join(pack, "tests")
    os.makedirs(tests, exist_ok=True)
    with open(os.path.join(tests, "test_main.py"), "w", encoding="utf-8") as f:
        f.write(_FILE_TEST)
    reg.promote("file_writer")
    reg.record_validation("file_writer", model="deepseek-chat")
    return reg


class _Session:
    api_key = ""
    provider = "deepseek"
    base_url = ""
    model_name = "deepseek-chat"

    def next_sequence(self):
        return 1


# ── T12.3 同会话二命 ─────────────────────────────────


def test_second_hit_same_session_writes_file(tmp_path):
    """模拟：首任务已建 workspace → 第二任务同 agent 命中 program 并写文件。"""
    from ceo_agent import CeoAgent

    reg = _seed_file_prog(tmp_path)
    ws = tmp_path / "session_ws"
    ws.mkdir()
    sent = []

    async def route_fn(content, context):
        return await try_program_path(
            content,
            reg,
            model="deepseek-chat",
            workspace_path=context.get("workspace_path"),
            review_generate=_review_pass,
        )

    agent = CeoAgent(
        session=_Session(),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        program_route_fn=route_fn,
    )
    # 同会话内已有工作区（复杂路径 HITL 之后的状态）
    agent._workspace = SimpleNamespace(root_path=str(ws))

    async def send_message(msg):
        sent.append(msg)

    task_text = "请写文件：生成 out"
    result = asyncio.run(agent.process_message(task_text, send_message))
    assert result is not None
    assert result["path_used"] == "program"
    assert result["success"] is True
    out_file = ws / "out.txt"
    assert out_file.is_file()
    assert out_file.read_text() == task_text
    assert result["output"]["files_written"] == [str(out_file)]


def test_first_hit_without_workspace_falls_back(tmp_path):
    """首任务无 workspace → WORKSPACE_REQUIRED，不写文件。"""
    from ceo_agent import CeoAgent

    reg = _seed_file_prog(tmp_path)
    ws = tmp_path / "unused"
    ws.mkdir()
    sent = []

    async def route_fn(content, context):
        assert context.get("workspace_path") is None
        return await try_program_path(
            content,
            reg,
            model="deepseek-chat",
            workspace_path=None,
            review_generate=_review_pass,
        )

    class _Classifier:
        _get_model = None
        _kernel = None

        async def classify(self, content):
            return SimpleNamespace(
                level="simple", confidence=0.9, reason="", method="rule"
            )

    class _SimpleExec:
        async def execute(self, *a, **k):
            return SimpleNamespace(
                retry_with_complex=False,
                success=True,
                result={"note": "llm"},
                project_id="p1",
                review_passed=True,
            )

    agent = CeoAgent(
        session=_Session(),
        project_manager=None,
        complexity_classifier=_Classifier(),
        simple_executor=_SimpleExec(),
        program_route_fn=route_fn,
        program_sediment_fn=None,
    )

    async def send_message(msg):
        sent.append(msg)

    result = asyncio.run(agent.process_message("请写文件：生成 out", send_message))
    # 回退 LLM simple 路径
    assert result["path_used"] == "simple"
    assert not (ws / "out.txt").exists()


# ── T12.5 WORKSPACE_REQUIRED 可观测 ──────────────────


def test_workspace_required_emits_notice(tmp_path):
    """非 NO_MATCH 回退（含 WORKSPACE_REQUIRED）必须有可感知提示。"""
    from ceo_agent import CeoAgent

    reg = _seed_file_prog(tmp_path)
    sent = []

    async def route_fn(content, context):
        return await try_program_path(
            content,
            reg,
            model="deepseek-chat",
            workspace_path=None,
            review_generate=_review_pass,
        )

    class _Classifier:
        _get_model = None
        _kernel = None

        async def classify(self, content):
            return SimpleNamespace(
                level="simple", confidence=0.9, reason="", method="rule"
            )

    class _SimpleExec:
        async def execute(self, *a, **k):
            return SimpleNamespace(
                retry_with_complex=False,
                success=True,
                result={},
                project_id="p",
                review_passed=True,
            )

    agent = CeoAgent(
        session=_Session(),
        project_manager=None,
        complexity_classifier=_Classifier(),
        simple_executor=_SimpleExec(),
        program_route_fn=route_fn,
    )

    async def send_message(msg):
        sent.append(msg)

    asyncio.run(agent.process_message("请写文件：生成 out", send_message))
    notices = [
        m
        for m in sent
        if m.get("type") == "agent_message"
        and "WORKSPACE_REQUIRED" in str(m.get("content", ""))
    ]
    assert notices, "WORKSPACE_REQUIRED 必须有可感知降级提示"
