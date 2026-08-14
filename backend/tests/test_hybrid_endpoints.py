"""演示 API：混合组队 + 把关点

覆盖 S5-M1 验收「API 可演示组队与把关」：
- POST /api/hybrid/team           组装 human+agent 混合团队
- POST /api/gates                 创建把关点请求
- GET  /api/gates/pending         查看待处理把关请求
- POST /api/gates/{id}/decide     对把关请求做出决定

使用 FastAPI TestClient + 既有 server 构造方式（conftest 注入 agentscope mock），
并关闭 REST 认证中间件（与既有 test_workflow_endpoints.py 一致）。
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# 复用 conftest 的 agentscope sys.modules 注入，随后再导入 server
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
