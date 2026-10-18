"""三分法路由接线测试 (program-pivot T6)

验收：命中 promoted 新鲜程序走免 LLM 路径且 task_result 标注
path_used="program"；未命中/失效/审阅 fail 回退 LLM 路径。
"""

import asyncio
import json
import os
import textwrap

from program_registry import (
    ProgramManifest,
    ProgramRegistry,
    ProgramTrigger,
)
from program_router import try_program_path

_MAIN = textwrap.dedent(
    """
    import json, sys

    def run(data):
        return {"summary": data.get("task", ""), "ok": True}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_PASS_TEST = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"task": "x"})["ok"] is True
    """
)


def _registry(tmp_path, promote=True, validate=True) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(
        ProgramManifest(
            program_id="summary_prog",
            version="1.0.0",
            trigger=ProgramTrigger(keywords=["生成摘要"]),
        )
    )
    pack = reg.pack_dir("summary_prog")
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(_MAIN)
    tests = os.path.join(pack, "tests")
    os.makedirs(tests, exist_ok=True)
    with open(os.path.join(tests, "test_main.py"), "w", encoding="utf-8") as f:
        f.write(_PASS_TEST)
    if promote:
        reg.promote("summary_prog")
    if promote and validate:
        reg.record_validation("summary_prog", model="deepseek-chat")
    return reg


async def _review_pass(prompt: str) -> str:
    return json.dumps({"verdict": "pass", "issues": [], "summary": "正确"})


async def _review_fail(prompt: str) -> str:
    return json.dumps(
        {"verdict": "fail", "issues": ["摘要缺少来源字段"], "summary": "不完整"}
    )


def _run(coro):
    return asyncio.run(coro)


# ── try_program_path ─────────────────────────────────


def test_no_match_falls_back(tmp_path):
    reg = _registry(tmp_path)
    outcome = _run(try_program_path("完全不相关的任务", reg, review_generate=_review_pass))
    assert outcome.handled is False
    assert outcome.fallback_reason == "NO_MATCH"


def test_program_hit_delivers_path_used_program(tmp_path):
    reg = _registry(tmp_path)
    outcome = _run(
        try_program_path(
            "请生成摘要：本周发布计划", reg, review_generate=_review_pass
        )
    )
    assert outcome.handled is True
    result = outcome.task_result
    assert result["type"] == "task_result"
    assert result["path_used"] == "program"
    assert result["success"] is True
    assert result["program_id"] == "summary_prog"
    assert result["output"]["ok"] is True
    assert result["telemetry"]["llm_calls"] == 0  # 执行免 LLM


def test_stale_program_not_matched(tmp_path):
    from datetime import datetime, timedelta, timezone

    reg = _registry(tmp_path)
    past = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    reg.record_validation(
        "summary_prog", model="deepseek-chat", validated_at=past
    )
    outcome = _run(
        try_program_path("请生成摘要", reg, review_generate=_review_pass)
    )
    assert outcome.handled is False
    assert outcome.fallback_reason == "NO_MATCH"


def test_execution_error_falls_back_with_issues(tmp_path):
    reg = _registry(tmp_path)
    # 删掉 main.py 制造执行失败
    os.remove(os.path.join(reg.pack_dir("summary_prog"), "main.py"))
    outcome = _run(
        try_program_path("请生成摘要", reg, review_generate=_review_pass)
    )
    assert outcome.handled is False
    assert outcome.fallback_reason == "PROGRAM_MISSING"
    assert outcome.review_issues  # 供升级闭环消费


def test_review_fail_falls_back_with_issues(tmp_path):
    reg = _registry(tmp_path)
    outcome = _run(
        try_program_path("请生成摘要", reg, review_generate=_review_fail)
    )
    assert outcome.handled is False
    assert outcome.fallback_reason == "REVIEW_FAIL"
    assert outcome.review_verdict == "fail"
    assert outcome.review_issues == ["摘要缺少来源字段"]


def test_review_unavailable_falls_back(tmp_path):
    reg = _registry(tmp_path)
    outcome = _run(try_program_path("请生成摘要", reg, review_generate=None))
    assert outcome.handled is False
    assert outcome.fallback_reason == "REVIEW_UNAVAILABLE"


def test_match_error_fails_open(tmp_path, monkeypatch):
    reg = _registry(tmp_path)

    def boom(text, current_model=None):
        raise RuntimeError("registry corrupt")

    monkeypatch.setattr(reg, "match", boom)
    outcome = _run(try_program_path("请生成摘要", reg, review_generate=_review_pass))
    assert outcome.handled is False
    assert outcome.fallback_reason == "MATCH_ERROR"


def test_candidate_not_routed(tmp_path):
    reg = _registry(tmp_path, promote=False)
    outcome = _run(
        try_program_path("请生成摘要", reg, review_generate=_review_pass)
    )
    assert outcome.handled is False
    assert outcome.fallback_reason == "NO_MATCH"


# ── CeoAgent 接线 ────────────────────────────────────


def test_ceo_program_hit_returns_task_result(tmp_path):
    from ceo_agent import CeoAgent

    reg = _registry(tmp_path)
    sent = []

    class _Session:
        api_key = ""
        provider = "deepseek"
        base_url = ""
        model_name = ""
        _ceo_agent = None

        def next_sequence(self):
            return 1

    async def route_fn(content, context):
        return await try_program_path(
            content, reg, review_generate=_review_pass
        )

    agent = CeoAgent(
        session=_Session(),
        project_manager=None,
        complexity_classifier=None,  # 命中 program 时不触碰复杂度判定
        simple_executor=None,
        program_route_fn=route_fn,
    )

    async def send_message(msg):
        sent.append(msg)

    result = asyncio.run(
        agent.process_message("请生成摘要：本周发布计划", send_message)
    )
    assert result["type"] == "task_result"
    assert result["path_used"] == "program"
    paths = [m for m in sent if m.get("type") == "path_selected"]
    assert paths and paths[0]["path"] == "program"
    # Major 修复：命中结果必须上线发送（前端靠 wire task_result 复位）
    wire_results = [
        m for m in sent if m.get("type") == "task_result" and m.get("path_used") == "program"
    ]
    assert wire_results
    assert wire_results[0]["program_id"] == "summary_prog"


def test_ceo_review_fail_emits_and_continues(tmp_path):
    from ceo_agent import CeoAgent
    from types import SimpleNamespace

    reg = _registry(tmp_path)
    sent = []

    class _Session:
        api_key = "k"
        provider = "deepseek"
        base_url = ""
        model_name = ""
        _ceo_agent = None

        def next_sequence(self):
            return 1

    async def route_fn(content, context):
        return await try_program_path(content, reg, review_generate=_review_fail)

    class _Classifier:
        _get_model = None
        _kernel = None

        async def classify(self, content):
            return SimpleNamespace(level="simple", confidence=0.9, reason="", method="rule")

    class _SimpleExec:
        async def execute(self, *a, **k):
            return SimpleNamespace(
                retry_with_complex=False,
                success=True,
                result="llm-done",
                project_id="p1",
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

    result = asyncio.run(agent.process_message("请生成摘要", send_message))
    # 审阅 fail → 回退 simple/complex 路径
    assert result["path_used"] == "simple"
    review_msgs = [m for m in sent if m.get("type") == "program_review_failed"]
    assert review_msgs and review_msgs[0]["issues"] == ["摘要缺少来源字段"]


def test_server_route_fn_wiring_no_key_falls_back(tmp_path, monkeypatch):
    """Minor：server._program_route_fn 接线——registry 命中但无会话 key
    → REVIEW_UNAVAILABLE（审阅生成器不可用回退）。"""
    import server

    reg = _registry(tmp_path)
    monkeypatch.setattr(server, "_program_registry", reg)
    outcome = asyncio.run(server._program_route_fn("请生成摘要：x", {}))
    assert outcome.handled is False
    assert outcome.fallback_reason == "REVIEW_UNAVAILABLE"
    assert outcome.program_id == "summary_prog"  # 确实命中并执行过了


def test_ceo_generic_fallback_emits_notice(tmp_path):
    """Minor：非 NO_MATCH 的回退（如 INTERNAL/NOT_PROMOTED）给出降级提示。"""
    from ceo_agent import CeoAgent
    from types import SimpleNamespace

    reg = _registry(tmp_path, promote=False)  # candidate → match 不命中=NO_MATCH
    # 用 REVIEW_UNAVAILABLE 路径（无生成器）验证提示存在
    sent = []

    class _Session:
        api_key = ""
        provider = "deepseek"
        base_url = ""
        model_name = ""
        _ceo_agent = None

        def next_sequence(self):
            return 1

    async def route_fn(content, context):
        return await try_program_path(content, reg, review_generate=None)

    class _Classifier:
        _get_model = None
        _kernel = None

        async def classify(self, content):
            return SimpleNamespace(level="simple", confidence=0.9, reason="", method="rule")

    class _SimpleExec:
        async def execute(self, *a, **k):
            return SimpleNamespace(
                retry_with_complex=False,
                success=True,
                result="llm-done",
                project_id="p1",
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

    # candidate 不命中 → NO_MATCH 静默（不产生回退提示）
    asyncio.run(agent.process_message("请生成摘要", send_message))
    assert not [
        m for m in sent if m.get("type") == "agent_message" and "回退 LLM" in m.get("content", "")
    ]

    # 升级为 promoted → 命中但无审阅器 → REVIEW_UNAVAILABLE → 有提示
    reg.promote("summary_prog")
    reg.record_validation("summary_prog", model="deepseek-chat")
    sent.clear()
    asyncio.run(agent.process_message("请生成摘要", send_message))
    notices = [
        m
        for m in sent
        if m.get("type") == "agent_message" and "回退 LLM" in m.get("content", "")
    ]
    assert notices and "REVIEW_UNAVAILABLE" in notices[0]["content"]
