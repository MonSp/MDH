"""T12.1 成功任务沉淀接线测试

验收：成功路径 best-effort 调 compile；失败不阻塞；无 generator 跳过；
program 命中不重复沉淀。
"""

import asyncio
import json
from types import SimpleNamespace

from program_sediment import sediment_successful_task
from program_registry import ProgramRegistry, ProgramStatus


async def _gen_ok(prompt: str) -> str:
    return json.dumps(
        {
            "program_id": "sediment_ok",
            "version": "1.0.0",
            "description": "沉淀测试",
            "trigger_keywords": ["沉淀", "sediment"],
            "io_schema": {
                "inputs": {"task": {"type": "string", "required": True}}
            },
            "main_py": (
                "import json,sys\n"
                "def run(data):\n"
                "    return {'s': data.get('task'), 'ok': True}\n"
                "if __name__ == '__main__':\n"
                "    json.dump(run(json.load(sys.stdin)), sys.stdout)\n"
            ),
            "test_py": (
                "import main\n"
                "def test_run():\n"
                "    assert main.run({'task': 'a'})['ok'] is True\n"
            ),
        },
        ensure_ascii=False,
    )


def _run(coro):
    return asyncio.run(coro)


# ── sediment_successful_task ─────────────────────────


def test_sediment_compiles_candidate(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    out = _run(
        sediment_successful_task(
            "沉淀一段摘要逻辑",
            registry=reg,
            generate=_gen_ok,
            steps=["读取", "汇总"],
            output_example={"s": "x", "ok": True},
        )
    )
    assert out["compiled"] is True
    assert out["program_id"] == "sediment_ok"
    m = reg.get("sediment_ok")
    assert m is not None
    assert m.status == ProgramStatus.CANDIDATE


def test_sediment_skips_without_generator(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    out = _run(sediment_successful_task("任务", registry=reg, generate=None))
    assert out["compiled"] is False
    assert out["skipped"] == "NO_GENERATOR"


def test_sediment_skips_empty_task(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    out = _run(
        sediment_successful_task("  ", registry=reg, generate=_gen_ok)
    )
    assert out["compiled"] is False
    assert out["skipped"] == "EMPTY_TASK"


def test_sediment_already_exists_is_soft_skip(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    _run(sediment_successful_task("任务A", registry=reg, generate=_gen_ok))
    out2 = _run(
        sediment_successful_task("任务B", registry=reg, generate=_gen_ok)
    )
    assert out2["compiled"] is False
    assert out2["skipped"] == "ALREADY_EXISTS"


def test_sediment_generate_failure_nonblocking(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))

    async def _bad(prompt: str) -> str:
        raise RuntimeError("llm down")

    out = _run(sediment_successful_task("任务", registry=reg, generate=_bad))
    assert out["compiled"] is False
    assert "error" in out
    assert reg.get("sediment_ok") is None


# ── CeoAgent 钩子 ────────────────────────────────────


def test_ceo_maybe_sediment_called_on_simple_success():
    from ceo_agent import CeoAgent

    calls = []

    async def _sediment(content, context):
        calls.append({"content": content, "ctx_keys": sorted(context.keys())})
        return {"compiled": True, "program_id": "p1"}

    agent = CeoAgent(
        session=SimpleNamespace(
            api_key="k", provider="deepseek", base_url="", model_name="m"
        ),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        program_sediment_fn=_sediment,
    )
    _run(
        agent._maybe_sediment(
            "写一个函数",
            {"type": "task_result", "path_used": "simple", "success": True},
        )
    )
    assert len(calls) == 1
    assert calls[0]["content"] == "写一个函数"
    assert "output_example" in calls[0]["ctx_keys"]


def test_ceo_maybe_sediment_skips_program_and_failure():
    from ceo_agent import CeoAgent

    calls = []

    async def _sediment(content, context):
        calls.append(content)
        return {"compiled": False}

    agent = CeoAgent(
        session=SimpleNamespace(api_key="", provider="", base_url="", model_name=""),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        program_sediment_fn=_sediment,
    )
    # program 命中不沉淀
    _run(
        agent._maybe_sediment(
            "x", {"path_used": "program", "success": True}
        )
    )
    # 失败不沉淀
    _run(
        agent._maybe_sediment(
            "x", {"path_used": "simple", "success": False}
        )
    )
    # 无钩子
    agent2 = CeoAgent(
        session=SimpleNamespace(),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        program_sediment_fn=None,
    )
    _run(
        agent2._maybe_sediment(
            "x", {"path_used": "simple", "success": True}
        )
    )
    assert calls == []


def test_ceo_maybe_sediment_exception_swallowed():
    from ceo_agent import CeoAgent

    async def _boom(content, context):
        raise RuntimeError("hook crash")

    agent = CeoAgent(
        session=SimpleNamespace(api_key="k"),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        program_sediment_fn=_boom,
    )
    # 不抛
    _run(
        agent._maybe_sediment(
            "任务", {"path_used": "complex", "success": True}
        )
    )


# ── server 接线 ──────────────────────────────────────


def test_server_sediment_fn_no_key_skips(tmp_path, monkeypatch):
    import server
    from routers import programs as programs_router

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    monkeypatch.setattr(server, "_program_registry", reg)
    monkeypatch.setattr(programs_router, "_generate_override", None)
    out = _run(server._program_sediment_fn("任务", {"api_key": ""}))
    assert out["skipped"] == "NO_GENERATOR"


def test_server_sediment_fn_uses_override(tmp_path, monkeypatch):
    import server
    from routers import programs as programs_router

    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    monkeypatch.setattr(server, "_program_registry", reg)
    monkeypatch.setattr(programs_router, "_generate_override", _gen_ok)
    out = _run(
        server._program_sediment_fn(
            "沉淀任务",
            {"api_key": "", "output_example": {"ok": True}},
        )
    )
    assert out["compiled"] is True
    assert out["program_id"] == "sediment_ok"
