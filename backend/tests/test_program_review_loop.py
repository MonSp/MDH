"""ProgramReviewer + ProgramEvolver 审阅升级闭环测试 (program-pivot T5)

验收：fail 审阅意见触发修订候选并经 T4 门禁晋升；连续 3 次失败自动降级 deprecated。
"""

import asyncio
import json
import os
import textwrap

from fastapi.testclient import TestClient

import server
from program_evolver import ProgramEvolver
from program_registry import ProgramManifest, ProgramRegistry, ProgramStatus
from program_reviewer import ProgramReviewer
from routers import programs as programs_router

server.BACKEND_TOKEN = ""
client = TestClient(server.app)

_MAIN = textwrap.dedent(
    """
    import json, sys

    def run(data):
        return {"ok": True, "tag": data.get("tag", "")}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_PASS_TEST = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"tag": "x"}) == {"ok": True, "tag": "x"}
    """
)

# 修订版：行为变化但自洽（可过门禁）
_MAIN_REVISED = textwrap.dedent(
    """
    import json, sys

    def run(data):
        return {"ok": True, "tag": data.get("tag", ""), "revised": True}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_PASS_TEST_REVISED = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"tag": "x"}) == {"ok": True, "tag": "x", "revised": True}
    """
)

# 坏修订：测试断言与实现不符（门禁必挂）
_MAIN_BAD = _MAIN_REVISED
_FAIL_TEST = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"tag": "x"}) == {"wrong": True}
    """
)


def _promoted_registry(tmp_path, program_id="loop_prog") -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(ProgramManifest(program_id=program_id, version="1.0.0"))
    pack = reg.pack_dir(program_id)
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(_MAIN)
    tests = os.path.join(pack, "tests")
    os.makedirs(tests, exist_ok=True)
    with open(os.path.join(tests, "test_main.py"), "w", encoding="utf-8") as f:
        f.write(_PASS_TEST)
    reg.promote(program_id)
    return reg


async def _review_pass(prompt: str) -> str:
    return json.dumps({"verdict": "pass", "issues": [], "summary": "结果正确"})


async def _review_fail(prompt: str) -> str:
    return json.dumps(
        {
            "verdict": "fail",
            "issues": ["输出缺少 revised 字段", "应标注修订来源"],
            "summary": "输出不完整",
        }
    )


async def _revision_good(prompt: str) -> str:
    return json.dumps(
        {"version": "1.1.0", "main_py": _MAIN_REVISED, "test_py": _PASS_TEST_REVISED}
    )


async def _revision_bad(prompt: str) -> str:
    return json.dumps({"version": "1.1.0", "main_py": _MAIN_BAD, "test_py": _FAIL_TEST})


# ── Reviewer ─────────────────────────────────────────


def test_reviewer_pass_and_fail():
    r = ProgramReviewer()

    verdict = asyncio.run(
        r.review("p", "任务", {"a": 1}, None, None, _review_pass)
    )
    assert verdict.verdict == "pass"
    assert verdict.llm_calls == 1

    verdict2 = asyncio.run(
        r.review("p", "任务", {"a": 1}, None, None, _review_fail)
    )
    assert verdict2.verdict == "fail"
    assert verdict2.issues == ["输出缺少 revised 字段", "应标注修订来源"]


def test_reviewer_invalid_outputs():
    r = ProgramReviewer()

    async def bad(prompt: str) -> str:
        return "不是 JSON"

    result = asyncio.run(r.review("p", "t", None, None, None, bad))
    assert result.error_code == "REVIEW_INVALID"
    assert result.verdict == "fail"

    async def fail_no_issues(prompt: str) -> str:
        return json.dumps({"verdict": "fail", "issues": [], "summary": "x"})

    result2 = asyncio.run(r.review("p", "t", None, None, None, fail_no_issues))
    assert result2.error_code == "REVIEW_INVALID"


# ── Evolver 升级闭环 ─────────────────────────────────


def test_upgrade_happy_path(tmp_path):
    reg = _promoted_registry(tmp_path)
    result = asyncio.run(
        ProgramEvolver(reg).upgrade(
            "loop_prog", ["输出缺少 revised 字段"], _revision_good
        )
    )
    assert result.upgraded is True
    assert result.deprecated is False
    assert result.rolled_back is False

    m = reg.get("loop_prog")
    assert m.status == ProgramStatus.PROMOTED
    assert m.version == "1.1.0"
    assert m.consecutive_gate_failures == 0

    events = [e["event"] for e in reg.read_lineage("loop_prog")]
    assert events.index("revised") < events.index("gate_passed")
    # 新代码真的落盘
    main_src = open(
        os.path.join(reg.pack_dir("loop_prog"), "main.py"), encoding="utf-8"
    ).read()
    assert "revised" in main_src


def test_upgrade_gate_fail_rolls_back(tmp_path):
    reg = _promoted_registry(tmp_path)
    result = asyncio.run(
        ProgramEvolver(reg).upgrade("loop_prog", ["修一下"], _revision_bad)
    )
    assert result.rolled_back is True
    assert result.upgraded is False
    assert result.failure_count == 1

    m = reg.get("loop_prog")
    assert m.status == ProgramStatus.PROMOTED  # 保留上一版
    assert m.version == "1.0.0"  # 版本随快照一并还原
    main_src = open(
        os.path.join(reg.pack_dir("loop_prog"), "main.py"), encoding="utf-8"
    ).read()
    assert '"revised"' not in main_src  # 旧版恢复
    events = [e["event"] for e in reg.read_lineage("loop_prog")]
    assert "rollback" in events
    assert "version_restored" in events


def test_three_failures_deprecate(tmp_path):
    reg = _promoted_registry(tmp_path)
    evolver = ProgramEvolver(reg)
    for i in range(2):
        r = asyncio.run(
            evolver.upgrade("loop_prog", [f"第{i}轮意见"], _revision_bad)
        )
        assert r.rolled_back is True
        assert r.failure_count == i + 1
        assert reg.get("loop_prog").status == ProgramStatus.PROMOTED

    r3 = asyncio.run(evolver.upgrade("loop_prog", ["第三轮"], _revision_bad))
    assert r3.deprecated is True
    assert r3.error_code == "UPGRADE_DEPRECATED"
    assert r3.failure_count == 3
    m = reg.get("loop_prog")
    assert m.status == ProgramStatus.DEPRECATED
    assert m.consecutive_gate_failures == 3
    # 终态：再升级被拒
    r4 = asyncio.run(evolver.upgrade("loop_prog", ["再来"], _revision_good))
    assert r4.error_code == "NOT_PROMOTED"


def test_upgrade_requires_promoted(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(ProgramManifest(program_id="cand_prog", version="1.0.0"))
    result = asyncio.run(
        ProgramEvolver(reg).upgrade("cand_prog", ["x"], _revision_good)
    )
    assert result.error_code == "NOT_PROMOTED"

    result2 = asyncio.run(
        ProgramEvolver(reg).upgrade("missing", ["x"], _revision_good)
    )
    assert result2.error_code == "NOT_FOUND"


def test_upgrade_requires_issues(tmp_path):
    reg = _promoted_registry(tmp_path)
    result = asyncio.run(ProgramEvolver(reg).upgrade("loop_prog", [], _revision_good))
    assert result.error_code == "NO_ISSUES"


def test_invalid_revision_json(tmp_path):
    reg = _promoted_registry(tmp_path)

    async def bad_gen(prompt: str) -> str:
        return "垃圾输出"

    result = asyncio.run(ProgramEvolver(reg).upgrade("loop_prog", ["x"], bad_gen))
    assert result.error_code == "REVISION_INVALID"
    # 未动状态与文件
    m = reg.get("loop_prog")
    assert m.status == ProgramStatus.PROMOTED
    main_src = open(
        os.path.join(reg.pack_dir("loop_prog"), "main.py"), encoding="utf-8"
    ).read()
    assert '"revised"' not in main_src


def test_failure_count_reset_after_success(tmp_path):
    reg = _promoted_registry(tmp_path)
    evolver = ProgramEvolver(reg)
    asyncio.run(evolver.upgrade("loop_prog", ["a"], _revision_bad))
    assert reg.get("loop_prog").consecutive_gate_failures == 1
    r = asyncio.run(evolver.upgrade("loop_prog", ["b"], _revision_good))
    assert r.upgraded is True
    assert reg.get("loop_prog").consecutive_gate_failures == 0


# ── 端点 ────────────────────────────────────────────


def test_review_endpoint(tmp_path, monkeypatch):
    reg = _promoted_registry(tmp_path, "rev_ep")
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_review_override", _review_fail)
    resp = client.post(
        "/api/programs/rev_ep/review",
        json={"task_description": "t", "output": {"a": 1}},
    )
    body = resp.json()
    assert body["success"] is False
    assert body["code"] == "REVIEW_FAIL"
    assert len(body["data"]["issues"]) == 2
    assert body["data"]["llm_calls"] == 1


def test_review_endpoint_no_generator(tmp_path, monkeypatch):
    reg = _promoted_registry(tmp_path, "rev_none")
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_review_override", None)
    resp = client.post("/api/programs/rev_none/review", json={"task_description": "t"})
    assert resp.json()["code"] == "NO_GENERATOR"


def test_upgrade_endpoint(tmp_path, monkeypatch):
    reg = _promoted_registry(tmp_path, "up_ep")
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_revision_override", _revision_good)
    resp = client.post(
        "/api/programs/up_ep/upgrade",
        json={"issues": ["输出缺少 revised 字段"]},
    )
    body = resp.json()
    assert body["success"] and body["code"] == "UPGRADED"
    assert body["data"]["upgraded"] is True
    assert reg.get("up_ep").version == "1.1.0"


def test_upgrade_endpoint_failure(tmp_path, monkeypatch):
    reg = _promoted_registry(tmp_path, "up_bad")
    monkeypatch.setattr(programs_router, "_registry", reg)
    monkeypatch.setattr(programs_router, "_revision_override", _revision_bad)
    resp = client.post("/api/programs/up_bad/upgrade", json={"issues": ["x"]})
    body = resp.json()
    assert body["success"] is False
    assert body["code"] == "GATE_FAILED"
    assert body["data"]["rolled_back"] is True
    assert reg.get("up_bad").status == ProgramStatus.PROMOTED
