"""server.py REST 端点集成测试

覆盖未被其他测试文件测试的核心 REST 端点：
- /health, /metrics
- /api/skills (CRUD)
- /api/projects (CRUD)
- /api/roles (CRUD)
- /api/experience/rules
- /api/router/table
- /api/sessions, /api/history
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import conftest  # noqa: F401
import server

server.BACKEND_TOKEN = ""
client = TestClient(server.app)


# ──────────────────── /health, /metrics ────────────────────

class TestHealthMetrics:
    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"

    def test_metrics_returns_text(self):
        resp = client.get("/metrics")
        assert resp.status_code == 200


# ──────────────────── /api/skills ────────────────────

class TestSkillsAPI:
    def test_list_skills_returns_list(self):
        resp = client.get("/api/skills")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_get_nonexistent_skill_returns_error(self):
        resp = client.get("/api/skills/nonexistent-skill-id")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False

    def test_get_skill_versions_nonexistent(self):
        resp = client.get("/api/skills/nonexistent/versions")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False

    def test_clone_nonexistent_skill(self):
        resp = client.post("/api/skills/nonexistent/clone", json={"target_dir": "/tmp/test"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False


# ──────────────────── /api/projects ────────────────────

class TestProjectsAPI:
    def test_list_projects_returns_list(self):
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_create_project(self):
        resp = client.post("/api/projects", json={"name": "test-project", "description": "test"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "project_id" in body["data"]

    def test_get_nonexistent_project(self):
        resp = client.get("/api/projects/nonexistent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False

    def test_delete_nonexistent_project(self):
        resp = client.delete("/api/projects/nonexistent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False

    def test_project_categories(self):
        resp = client.get("/api/projects/categories")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True


# ──────────────────── /api/roles ────────────────────

class TestRolesAPI:
    def test_get_roles_config(self):
        resp = client.get("/api/roles/config")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_get_nonexistent_role(self):
        resp = client.get("/api/roles/nonexistent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False

    def test_create_and_delete_role(self):
        # Create
        resp = client.post("/api/roles/test-role", json={
            "name": "Test Role",
            "tools": ["read_file"],
            "skills": ["testing"],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

        # Get
        resp = client.get("/api/roles/test-role")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Delete
        resp = client.delete("/api/roles/test-role")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify deleted
        resp = client.get("/api/roles/test-role")
        assert resp.json()["success"] is False

    def test_update_nonexistent_role(self):
        resp = client.put("/api/roles/nonexistent", json={"name": "Updated"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False


# ──────────────────── /api/experience/rules ────────────────────

class TestExperienceRulesAPI:
    def test_list_rules_returns_list(self):
        resp = client.get("/api/experience/rules")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_list_pending_rules(self):
        resp = client.get("/api/experience/rules/pending")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_approve_nonexistent_rule(self):
        resp = client.post("/api/experience/rules/nonexistent/approve", json={"comment": "test"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False

    def test_reject_nonexistent_rule(self):
        resp = client.post("/api/experience/rules/nonexistent/reject", json={"reason": "test"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False


# ──────────────────── /api/router/table ────────────────────

class TestRouterTableAPI:
    def test_get_router_table(self):
        resp = client.get("/api/router/table")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_update_router_table(self):
        resp = client.put("/api/router/table", json={
            "dept_id": "dept-test",
            "dept_name": "测试部门",
            "capability_keywords": ["test"],
            "priority": 0.5,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_delete_router_entry(self):
        # First add one
        client.put("/api/router/table", json={
            "dept_id": "dept-delete-me",
            "dept_name": "待删除部门",
        })
        # Then delete
        resp = client.delete("/api/router/table/dept-delete-me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True


# ──────────────────── /api/sessions, /api/history ────────────────────

class TestSessionsHistoryAPI:
    def test_list_sessions(self):
        resp = client.get("/api/history/sessions")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)

    def test_get_nonexistent_session(self):
        resp = client.get("/api/sessions/nonexistent")
        assert resp.status_code == 404

    def test_get_session_messages_nonexistent(self):
        resp = client.get("/api/history/sessions/nonexistent/messages")
        assert resp.status_code == 404


# ──────────────────── /api/marketplace (via router) ────────────────────

class TestMarketplaceAPI:
    def test_search_experience(self):
        resp = client.get("/api/marketplace/experience/search")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_get_stats(self):
        resp = client.get("/api/marketplace/stats")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_list_forks(self):
        resp = client.get("/api/marketplace/skills/forks")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    def test_list_exports(self):
        resp = client.get("/api/marketplace/exports")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True


# ──────────────────── /api/mcp (via router) ────────────────────

class TestMCPAPI:
    def test_list_servers(self):
        resp = client.get("/api/mcp/servers")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["servers"], list)

    def test_add_and_delete_server(self):
        # Add
        resp = client.post("/api/mcp/servers", json={
            "name": "test-server",
            "transport": "stdio",
            "command": "echo",
            "args": ["hello"],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

        # Delete
        resp = client.delete("/api/mcp/servers/test-server")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_delete_nonexistent_server(self):
        resp = client.delete("/api/mcp/servers/nonexistent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False


# ──────────────────── 认证中间件 ────────────────────

class TestAuthMiddleware:
    def test_public_endpoints_accessible(self):
        """公开端点无需认证"""
        assert client.get("/health").status_code == 200
        assert client.get("/metrics").status_code == 200

    def test_docs_accessible(self):
        assert client.get("/docs").status_code == 200

    def test_openapi_accessible(self):
        assert client.get("/openapi.json").status_code == 200
