"""演示 API：混合组队 + 把关点

覆盖 S5-M1 验收「API 可演示组队与把关」：
- POST /api/hybrid/team           组装 human+agent 混合团队
- POST /api/gates                 创建把关点请求
- GET  /api/gates/pending         查看待处理把关请求
- POST /api/gates/{id}/decide     对把关请求做出决定

使用 FastAPI TestClient + 既有 server 构造方式（conftest 注入 mock），
并关闭 REST 认证中间件（与既有 test_workflow_endpoints.py 一致）。
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# 复用 conftest 的 sys.modules 注入，随后再导入 server
import conftest  # noqa: F401

import server

# 关闭 REST 认证中间件（与既有 executor_server 测试关闭方式一致），
# 便于直接用 TestClient 调用受保护端点
server.BACKEND_TOKEN = ""

client = TestClient(server.app)


def test_hybrid_team_endpoint():
    resp = client.post("/api/hybrid/team", json={
        "project_id": "proj-demo",
        "dag": {
            "tasks": [
                {"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "从速记生成纪要"},
            ]
        },
        "humans": [{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    })
    assert resp.status_code == 200
    data = resp.json()
    member_types = {m["memberType"] for m in data["members"]}
    assert "human" in member_types
    assert "agent" in member_types
    human = next(m for m in data["members"] if m["memberType"] == "human")
    assert human["agentId"] == "emp-1"
    assert human["approverFor"] == ["task-1"]


def test_gate_create_pending_and_decide():
    resp = client.post("/api/gates", json={
        "requesterId": "agent-minutes",
        "operation": "minutes_review",
        "description": "纪要待确认",
        "taskId": "task-1",
        "gateId": "gate-1",
    })
    assert resp.status_code == 200
    request_id = resp.json()["id"]
    assert resp.json()["gateId"] == "gate-1"

    pending = client.get("/api/gates/pending").json()
    assert any(r["id"] == request_id for r in pending)

    decided = client.post(f"/api/gates/{request_id}/decide", json={"approved": True, "reason": "无误"})
    assert decided.status_code == 200
    assert decided.json()["resolved"] is True

    pending_after = client.get("/api/gates/pending").json()
    assert all(r["id"] != request_id for r in pending_after)


def test_gate_decide_string_false_is_rejected():
    """字符串 "false" 不是布尔 True，必须 fail-closed：resolved 为 False，请求保持未批准。"""
    resp = client.post("/api/gates", json={
        "requesterId": "agent-minutes",
        "operation": "minutes_review",
        "description": "纪要待确认",
        "taskId": "task-2",
        "gateId": "gate-2",
    })
    assert resp.status_code == 200
    request_id = resp.json()["id"]

    decided = client.post(
        f"/api/gates/{request_id}/decide",
        json={"approved": "false", "reason": "字符串非布尔"},
    )
    assert decided.status_code == 200
    # 非布尔 approved 一律视为未批准（fail-closed），不得解析为 True
    assert decided.json()["resolved"] is False


def test_hybrid_team_missing_dag_returns_error():
    """缺 dag 字段时返回错误响应而非 HTTP 500。"""
    resp = client.post("/api/hybrid/team", json={
        "project_id": "proj-demo",
        "humans": [],
    })
    assert resp.status_code != 500
    body = resp.json()
    assert body.get("error")


def test_hybrid_team_non_dict_dag_returns_error():
    """dag 非 dict 时返回错误响应而非 HTTP 500。"""
    resp = client.post("/api/hybrid/team", json={
        "project_id": "p",
        "dag": "not-a-dict",
        "humans": [],
    })
    assert resp.status_code != 500
    assert "error" in resp.json()


def test_hybrid_team_endpoint_returns_display_name():
    resp = client.post("/api/hybrid/team", json={
        "project_id": "proj-demo",
        "dag": {"tasks": [{"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "d"}]},
        "humans": [{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    })
    human = next(m for m in resp.json()["members"] if m["memberType"] == "human")
    assert human["displayName"] == "张三"


def test_hybrid_team_endpoint_agent_has_display_name_key():
    resp = client.post("/api/hybrid/team", json={
        "project_id": "proj-demo",
        "dag": {"tasks": [{"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "d"}]},
        "humans": [],
    })
    for member in resp.json()["members"]:
        assert "displayName" in member
        assert member["displayName"] == ""


def test_gates_pending_returns_gate_context_fields():
    """REST /api/gates/pending 条目携带 gate 上下文（taskId/gateId/approver），
    与 get_pending_requests / WS pending_approvals 三键对齐。"""
    created = client.post("/api/gates", json={
        "requesterId": "agent-minutes", "operation": "node_gate",
        "description": "纪要待确认", "taskId": "draft", "gateId": "draft:review",
    })
    assert created.status_code == 200
    pending = client.get("/api/gates/pending").json()
    item = next(r for r in pending if r["id"] == created.json()["id"])
    assert item["taskId"] == "draft"
    assert item["gateId"] == "draft:review"
    assert "approver" in item


def test_gates_pending_includes_approver_name():
    created = client.post("/api/gates", json={
        "requesterId": "agent", "operation": "node_gate", "description": "d",
        "taskId": "draft", "gateId": "draft:review", "approver": "emp-001",
    })
    assert created.status_code == 200
    pending = client.get("/api/gates/pending").json()
    item = next(r for r in pending if r["id"] == created.json()["id"])
    assert item["approverName"] == "张伟"  # 目录解析


def test_minutes_resolves_submitter_display_name():
    resp = client.post("/api/minutes", json={
        "transcript": "会议讨论发布计划，确定 8 月上线。",
        "submitter": "emp-001",
    })
    assert resp.status_code == 200
    members = resp.json()["team"]["members"]
    human = next(m for m in members if m["memberType"] == "human")
    assert human["displayName"] == "张伟"  # 目录解析


def test_minutes_submitter_fallback_to_raw_id():
    resp = client.post("/api/minutes", json={
        "transcript": "会议讨论发布计划，确定 8 月上线。",
        "submitter": "ghost-id",
    })
    assert resp.status_code == 200
    members = resp.json()["team"]["members"]
    human = next(m for m in members if m["memberType"] == "human")
    assert human["displayName"] == "ghost-id"  # 未命中回退


def test_employees_endpoint_lists_directory():
    resp = client.get("/api/employees")
    assert resp.status_code == 200
    # _ok 包装：{"success": True, "data": [...], "error": None}，目录列表在 data 字段
    data = resp.json()["data"]
    assert any(e["employeeId"] == "emp-001" and e["name"] == "张伟" for e in data)
