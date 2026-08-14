"""演示端点：速记 → 纪要 DAG 规划 + 混合团队"""
import server

server.BACKEND_TOKEN = ""
from server import app  # noqa: E402  （沿用 test_hybrid_endpoints 的 import 顺序约定）
from fastapi.testclient import TestClient

client = TestClient(app)


def test_minutes_endpoint_returns_plan_and_team():
    resp = client.post("/api/minutes", json={
        "transcript": "今天的会议讨论了发布计划",
        "project_id": "proj-minutes",
        "submitter": "emp-1",
    })
    assert resp.status_code == 200
    data = resp.json()
    nodes = data["workflow"]["nodes"]
    assert [n["node_id"] for n in nodes] == ["extract", "draft", "proofread"]
    draft = next(n for n in nodes if n["node_id"] == "draft")
    assert draft["gate"]["approver"] == "emp-1"
    member_types = {m["memberType"] for m in data["team"]["members"]}
    assert "human" in member_types and "agent" in member_types


def test_minutes_endpoint_missing_transcript_returns_error():
    resp = client.post("/api/minutes", json={"project_id": "p", "submitter": "emp-1"})
    assert resp.status_code != 500
    assert "error" in resp.json()


def test_minutes_endpoint_non_string_transcript_returns_error():
    resp = client.post("/api/minutes", json={"transcript": 123, "project_id": "p", "submitter": "emp-1"})
    assert resp.status_code != 500
    assert "error" in resp.json()
