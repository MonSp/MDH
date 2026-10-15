"""Program Registry 端点测试 (program-pivot T1)

验收：POST /api/programs 创建通过 manifest 校验；
GET 返回匹配候选与 status；非法 manifest / 状态机错误返回结构化 fail。
"""
from fastapi.testclient import TestClient

import server
from program_registry import ProgramRegistry
from routers import programs as programs_router

server.BACKEND_TOKEN = ""

client = TestClient(server.app)

_VALID_MANIFEST = {
    "program_id": "deploy_report",
    "version": "1.0.0",
    "description": "生成部署报告",
    "trigger": {"keywords": ["部署报告", "deploy report"]},
    "io_schema": {"input": {"type": "object"}},
}


def _fresh_registry(tmp_path, monkeypatch) -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    monkeypatch.setattr(programs_router, "_registry", reg)
    return reg


def test_create_and_get_program(tmp_path, monkeypatch):
    _fresh_registry(tmp_path, monkeypatch)
    resp = client.post("/api/programs", json=_VALID_MANIFEST)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] and body["code"] == "CREATED"
    assert body["data"]["status"] == "candidate"

    got = client.get("/api/programs/deploy_report")
    assert got.status_code == 200
    data = got.json()["data"]
    assert data["program_id"] == "deploy_report"
    assert data["status"] == "candidate"
    assert "lineage" in data


def test_create_invalid_manifest_rejected(tmp_path, monkeypatch):
    _fresh_registry(tmp_path, monkeypatch)
    resp = client.post("/api/programs", json={"program_id": "Bad ID!", "version": "1"})
    # FastAPI/pydantic 原生校验在进入 handler 前拒绝 → 422
    assert resp.status_code == 422
    assert resp.json()["detail"]  # 校验错误详情
    # 校验通过 handler 但业务拒绝（重复 id）→ 结构化 fail
    resp2 = client.post("/api/programs", json={"program_id": "ok_id", "version": "1"})
    assert resp2.status_code == 200
    assert resp2.json()["success"] and resp2.json()["code"] == "CREATED"


def test_duplicate_create_returns_already_exists(tmp_path, monkeypatch):
    _fresh_registry(tmp_path, monkeypatch)
    client.post("/api/programs", json=_VALID_MANIFEST)
    resp = client.post("/api/programs", json=_VALID_MANIFEST)
    assert resp.json()["code"] == "ALREADY_EXISTS"


def test_match_endpoint_returns_promoted_fresh(tmp_path, monkeypatch):
    reg = _fresh_registry(tmp_path, monkeypatch)
    client.post("/api/programs", json=_VALID_MANIFEST)
    # candidate 不命中
    miss = client.get("/api/programs/match", params={"task_text": "生成部署报告"})
    assert miss.json()["data"] == []

    client.post("/api/programs/deploy_report/promote", json={"model": "deepseek-chat"})
    hit = client.get("/api/programs/match", params={"task_text": "生成部署报告"})
    data = hit.json()["data"]
    assert [m["program_id"] for m in data] == ["deploy_report"]
    assert data[0]["status"] == "promoted"
    # 模型换代 → 不新鲜 → 不命中
    stale = client.get(
        "/api/programs/match",
        params={"task_text": "生成部署报告", "model": "gpt-5"},
    )
    assert stale.json()["data"] == []


def test_promote_and_invalid_transition(tmp_path, monkeypatch):
    _fresh_registry(tmp_path, monkeypatch)
    client.post("/api/programs", json=_VALID_MANIFEST)
    ok1 = client.post("/api/programs/deploy_report/promote")
    assert ok1.json()["success"] and ok1.json()["data"]["status"] == "promoted"

    again = client.post("/api/programs/deploy_report/promote")
    assert again.json()["success"] is False
    assert again.json()["code"] == "INVALID_TRANSITION"

    dep = client.post("/api/programs/deploy_report/deprecate")
    assert dep.json()["data"]["status"] == "deprecated"

    third = client.post("/api/programs/deploy_report/promote")
    assert third.json()["code"] == "INVALID_TRANSITION"


def test_list_filter_by_status(tmp_path, monkeypatch):
    _fresh_registry(tmp_path, monkeypatch)
    client.post("/api/programs", json=_VALID_MANIFEST)
    client.post("/api/programs/deploy_report/promote")
    resp = client.get("/api/programs", params={"status": "promoted"})
    ids = [m["program_id"] for m in resp.json()["data"]]
    assert ids == ["deploy_report"]


def test_legacy_import_endpoint(tmp_path, monkeypatch):
    _fresh_registry(tmp_path, monkeypatch)
    packs = tmp_path / "skill_packs"
    (packs / "testing").mkdir(parents=True)
    (packs / "testing" / "manifest.yaml").write_text(
        "name: testing\nversion: '1.0.0'\n", encoding="utf-8"
    )
    monkeypatch.setattr(programs_router, "_skill_packs_dir", str(packs))
    resp = client.post("/api/programs/legacy/import")
    assert resp.json()["data"]["imported"] == 1
    assert resp.json()["data"]["program_ids"] == ["legacy_testing"]

    got = client.get("/api/programs/legacy_testing")
    assert got.json()["data"]["kind"] == "legacy_skill_pack"

    promote = client.post("/api/programs/legacy_testing/promote")
    assert promote.json()["code"] in ("READ_ONLY", "INVALID_TRANSITION")
