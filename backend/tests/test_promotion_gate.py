"""PromotionGate 测试 (program-pivot T4)

验收：测试通过自动 promoted 并写 lineage.json；失败回滚保留上一版
（candidate 状态不变）；tests/ 变更被标记。
"""

import asyncio
import os
import textwrap

from fastapi.testclient import TestClient

import server
from program_registry import (
    ProgramKind,
    ProgramManifest,
    ProgramRegistry,
    ProgramStatus,
)
from promotion_gate import PromotionGate
from routers import programs as programs_router

server.BACKEND_TOKEN = ""
client = TestClient(server.app)

_MAIN = textwrap.dedent(
    """
    import json, sys

    def run(data):
        return {"ok": True, "n": data.get("n", 0)}

    if __name__ == "__main__":
        json.dump(run(json.load(sys.stdin)), sys.stdout)
    """
)

_PASSING_TEST = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"n": 1}) == {"ok": True, "n": 1}
    """
)

_FAILING_TEST = textwrap.dedent(
    """
    import main

    def test_run():
        assert main.run({"n": 1}) == {"ok": False}  # 故意失败
    """
)


def _make_pack(
    tmp_path,
    program_id: str,
    test_src: str = _PASSING_TEST,
    with_tests: bool = True,
) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(ProgramManifest(program_id=program_id, version="1.0.0"))
    pack = reg.pack_dir(program_id)
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(_MAIN)
    if with_tests:
        tests_dir = os.path.join(pack, "tests")
        os.makedirs(tests_dir, exist_ok=True)
        with open(
            os.path.join(tests_dir, "test_main.py"), "w", encoding="utf-8"
        ) as f:
            f.write(test_src)
    return reg


def _gate(reg, program_id, model=None):
    return asyncio.run(PromotionGate(reg).evaluate(program_id, model=model))


# ── 门禁行为 ─────────────────────────────────────────


def test_passing_tests_promote_with_lineage(tmp_path):
    reg = _make_pack(tmp_path, "good_prog")
    result = _gate(reg, "good_prog", model="deepseek-chat")
    assert result.passed is True
    assert result.promoted is True
    assert result.llm_calls == 0
    assert result.duration_ms > 0

    m = reg.get("good_prog")
    assert m.status == ProgramStatus.PROMOTED
    assert m.last_validated_model == "deepseek-chat"
    assert m.last_validated_at is not None

    events = [e["event"] for e in reg.read_lineage("good_prog")]
    assert "gate_passed" in events
    assert "promote" in events
    gate_ev = next(e for e in reg.read_lineage("good_prog") if e["event"] == "gate_passed")
    assert gate_ev["passed"] is True
    assert gate_ev["test_hashes"], "gate event must record test hashes"
    assert gate_ev["tests_modified"] is False  # 首次门禁无基线


def test_failing_tests_keep_candidate(tmp_path):
    """失败 → 不晋升（candidate 保持，已有 promoted 不受影响）。"""
    reg = _make_pack(tmp_path, "bad_prog", test_src=_FAILING_TEST)
    result = _gate(reg, "bad_prog")
    assert result.passed is False
    assert result.promoted is False
    assert result.error_code == "GATE_FAILED"
    assert reg.get("bad_prog").status == ProgramStatus.CANDIDATE
    events = [e["event"] for e in reg.read_lineage("bad_prog")]
    assert "gate_failed" in events
    assert "promote" not in events


def test_empty_tests_dir_rejected(tmp_path):
    reg = _make_pack(tmp_path, "no_tests", with_tests=False)
    result = _gate(reg, "no_tests")
    assert result.error_code == "GATE_NO_TESTS"
    assert reg.get("no_tests").status == ProgramStatus.CANDIDATE


def test_guards(tmp_path):
    reg = _make_pack(tmp_path, "guard_prog")
    assert _gate(reg, "missing").error_code == "NOT_FOUND"

    reg.promote("guard_prog")
    assert _gate(reg, "guard_prog").error_code == "NOT_CANDIDATE"

    legacy = ProgramManifest(
        program_id="legacy_x",
        version="1.0.0",
        kind=ProgramKind.LEGACY_SKILL_PACK,
        status=ProgramStatus.DEPRECATED,
    )
    reg._write_manifest(legacy)  # noqa: SLF001 — 测试直写
    assert _gate(reg, "legacy_x").error_code == "NOT_EXECUTABLE"


def test_tests_modified_flagged(tmp_path):
    """二次门禁且 tests/ 已变 → tests_modified=True（防作弊审计信号）。"""
    reg = _make_pack(tmp_path, "mut_prog", test_src=_FAILING_TEST)
    r1 = _gate(reg, "mut_prog")
    assert r1.passed is False
    assert r1.tests_modified is False  # 首次无基线

    # 改测试（仍失败）→ 二次门禁标记变更
    test_path = os.path.join(reg.pack_dir("mut_prog"), "tests", "test_main.py")
    with open(test_path, "w", encoding="utf-8") as f:
        f.write(_FAILING_TEST + "\n# tampered\n")
    r2 = _gate(reg, "mut_prog")
    assert r2.passed is False
    assert r2.tests_modified is True

    # lineage 中有 tests_modified 审计记录
    flagged = [
        e
        for e in reg.read_lineage("mut_prog")
        if e.get("event") == "gate_failed" and e.get("tests_modified")
    ]
    assert flagged


def test_gate_timeout(tmp_path):
    reg = _make_pack(tmp_path, "slow_prog")
    # 塞一个 sleep 测试
    test_path = os.path.join(reg.pack_dir("slow_prog"), "tests", "test_main.py")
    with open(test_path, "w", encoding="utf-8") as f:
        f.write("import time\ndef test_slow():\n    time.sleep(30)\n")
    result = asyncio.run(PromotionGate(reg, timeout=2).evaluate("slow_prog"))
    assert result.error_code == "GATE_TIMEOUT"
    assert result.promoted is False
    assert reg.get("slow_prog").status == ProgramStatus.CANDIDATE


# ── 端点 ────────────────────────────────────────────


def test_gate_endpoint(tmp_path, monkeypatch):
    reg = _make_pack(tmp_path, "ep_prog")
    monkeypatch.setattr(programs_router, "_registry", reg)
    resp = client.post("/api/programs/ep_prog/gate", json={"model": "deepseek-chat"})
    body = resp.json()
    assert body["success"] and body["code"] == "GATE_PASSED"
    assert body["data"]["promoted"] is True
    assert body["data"]["llm_calls"] == 0
    assert reg.get("ep_prog").status == ProgramStatus.PROMOTED


def test_gate_endpoint_failure(tmp_path, monkeypatch):
    reg = _make_pack(tmp_path, "ep_bad", test_src=_FAILING_TEST)
    monkeypatch.setattr(programs_router, "_registry", reg)
    resp = client.post("/api/programs/ep_bad/gate")
    body = resp.json()
    assert body["success"] is False
    assert body["code"] == "GATE_FAILED"
    assert body["data"]["passed"] is False
    assert body["data"]["promoted"] is False
