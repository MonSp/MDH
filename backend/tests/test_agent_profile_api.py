# backend/tests/test_agent_profile_api.py
import pytest
from httpx import ASGITransport, AsyncClient

import server


@pytest.fixture
async def client(tmp_path, monkeypatch):
    # 设置临时 profile 目录
    from agent_profile_manager import AgentProfileManager
    server._agent_profile_manager = AgentProfileManager(str(tmp_path / "profiles"))
    server.BACKEND_TOKEN = ""
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.mark.asyncio
class TestAgentProfileAPI:
    async def test_get_or_create_profile(self, client):
        resp = await client.get("/api/agents/agent-001/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["agent_id"] == "agent-001"

    async def test_get_skill_tree(self, client):
        resp = await client.get("/api/skills/tree")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "skills" in data["data"]
        # 至少有一个技能有 prerequisites
        skills = data["data"]["skills"]
        assert len(skills) > 0
