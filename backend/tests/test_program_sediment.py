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


# ── M2.5 skill sediment ──────────────────────────────


def _write_skill_pack(base, name="testing"):
    import os

    pack = os.path.join(base, name)
    os.makedirs(os.path.join(pack, "rules"), exist_ok=True)
    with open(os.path.join(pack, "manifest.yaml"), "w") as f:
        f.write(
            f"name: {name}\n"
            'version: "1.0.0"\n'
            "description: 测试驱动开发，单元，集成\n"
            "category: dev\n"
            "trigger: 测试, 单元测试, pytest\n"
        )
    with open(os.path.join(pack, "SKILL.md"), "w") as f:
        f.write("---\nname: testing\n---\n\n# T\n\n- 必须用 pytest 编写可运行测试\n")
    with open(os.path.join(pack, "rules", "r.yaml"), "w") as f:
        f.write("action: 必须覆盖边界分支并用 tmp_path 做文件断言\n")


def test_match_skills_for_task(tmp_path):
    from program_sediment import match_skills_for_task

    _write_skill_pack(str(tmp_path))
    names = match_skills_for_task("请补充单元测试和 pytest 用例", str(tmp_path), limit=1)
    assert names == ["testing"]
    assert match_skills_for_task("写一首诗", str(tmp_path), limit=1) == []


async def _gen_skill_ok(prompt: str) -> str:
    # 轨迹 compile 与 skill compile 共用生成器——用不同 id 防撞
    import re as _re

    m = _re.search(r"技能包「(\w+)」", prompt)
    pid = f"skill_{m.group(1)}" if m else "traj_sediment_skill"
    return json.dumps(
        {
            "program_id": pid,
            "version": "1.0.0",
            "description": "x",
            "trigger_keywords": ["测试"],
            "io_schema": {
                "inputs": {"task": {"type": "string", "required": True}}
            },
            "main_py": (
                "import json,sys\n"
                "def run(data):\n"
                "    return {'ok': True}\n"
                "if __name__ == '__main__':\n"
                "    json.dump(run(json.load(sys.stdin)), sys.stdout)\n"
            ),
            "test_py": "import main\ndef test_r():\n    assert main.run({})['ok']\n",
        },
        ensure_ascii=False,
    )


def test_sediment_with_skill_m25(tmp_path):
    packs = tmp_path / "skills"
    packs.mkdir()
    _write_skill_pack(str(packs))
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    out = _run(
        sediment_successful_task(
            "为项目补充单元测试与 pytest 覆盖",
            registry=reg,
            generate=_gen_skill_ok,
            steps=["写测试"],
            skill_packs_dir=str(packs),
            max_skill_compiles=1,
        )
    )
    assert out["compiled"] is True
    ss = out["skill_sediment"]
    assert ss["matched"] == ["testing"]
    assert any(x["skill"] == "testing" for x in ss["compiled"])
    assert reg.get(ss["compiled"][0]["program_id"]) is not None


def test_sediment_skill_no_match(tmp_path):
    packs = tmp_path / "skills"
    packs.mkdir()
    _write_skill_pack(str(packs))
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    out = _run(
        sediment_successful_task(
            "完全无关的创意写作任务",
            registry=reg,
            generate=_gen_ok,
            skill_packs_dir=str(packs),
        )
    )
    assert out["compiled"] is True
    assert out["skill_sediment"]["matched"] == []
    assert out["skill_sediment"]["compiled"] == []
