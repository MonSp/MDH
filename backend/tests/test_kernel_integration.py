"""
Tests for the KernelIntegration bridge service.

Tests cover:
- Connection lifecycle (connect, is_available, disconnect)
- Agent sync to kernel
- XP grant via kernel (dual-write)
- Graceful fallback when kernel is unavailable
- New API endpoints (/api/agents/kernel/state, /api/agents/kernel/sync)
"""

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent_kernel_client import AgentKernelClient, AgentKernelError, KernelAgent
from kernel_integration import KernelIntegration

# ── Fixtures: mock-based (no daemon needed) ────────────────────────


@pytest.fixture
def mock_client():
    """Provide a mocked AgentKernelClient."""
    client = MagicMock(spec=AgentKernelClient)
    client.is_connected = True
    return client


@pytest.fixture
def integration_with_mock(mock_client):
    """Provide a KernelIntegration with a mocked client."""
    ki = KernelIntegration.__new__(KernelIntegration)
    ki._socket_path = "/tmp/test.sock"
    ki._client = mock_client
    ki._connected = True
    ki._entity_map = {}
    return ki


@pytest.fixture
def integration_disconnected():
    """Provide a KernelIntegration that is not connected."""
    ki = KernelIntegration.__new__(KernelIntegration)
    ki._socket_path = "/tmp/test.sock"
    ki._client = MagicMock(spec=AgentKernelClient)
    ki._connected = False
    ki._entity_map = {}
    return ki


# ── Real daemon fixture (skips if binary missing) ──────────────────

DAEMON_PATH = str(
    Path(__file__).resolve().parents[2]
    / ".." / "MyGame" / "agent-kernel" / "build" / "agent-kernel-daemon"
)
REAL_SOCKET = "/tmp/test-integration-kernel.sock"


def _wait_for_socket(path: str, timeout: float = 5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if os.path.exists(path):
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.connect(path)
                s.close()
                return
            except (ConnectionRefusedError, FileNotFoundError, OSError):
                pass
        time.sleep(0.1)
    raise TimeoutError(f"Socket {path} did not appear within {timeout}s")


@pytest.fixture(scope="module")
def real_kernel():
    """Start the real daemon for integration tests."""
    try:
        os.unlink(REAL_SOCKET)
    except FileNotFoundError:
        pass

    if not os.path.exists(DAEMON_PATH):
        pytest.skip(f"Daemon binary not found at {DAEMON_PATH}")

    proc = subprocess.Popen(
        [DAEMON_PATH, "--socket", REAL_SOCKET],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        _wait_for_socket(REAL_SOCKET)
    except TimeoutError:
        proc.kill()
        stdout, stderr = proc.communicate()
        pytest.fail(f"Daemon failed to start.\nstdout: {stdout}\nstderr: {stderr}")

    yield proc

    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    try:
        os.unlink(REAL_SOCKET)
    except FileNotFoundError:
        pass


@pytest.fixture(scope="module")
def real_integration(real_kernel):
    """Provide a connected KernelIntegration against the real daemon."""
    ki = KernelIntegration(socket_path=REAL_SOCKET)
    assert ki.connect() is True
    yield ki
    ki.disconnect()


# ── Connection tests ───────────────────────────────────────────────


class TestConnection:
    def test_connect_success(self, real_kernel):
        ki = KernelIntegration(socket_path=REAL_SOCKET)
        assert ki.connect() is True
        assert ki.is_available() is True
        ki.disconnect()

    def test_connect_failure(self):
        ki = KernelIntegration(socket_path="/tmp/nonexistent-sock.sock")
        assert ki.connect() is False
        assert ki.is_available() is False

    def test_disconnect_idempotent(self):
        ki = KernelIntegration(socket_path="/tmp/nonexistent-sock.sock")
        ki.disconnect()  # Should not raise


# ── Graceful fallback tests (mock, no daemon) ──────────────────────


class TestGracefulFallback:
    def test_sync_when_disconnected(self, integration_disconnected):
        result = integration_disconnected.sync_agent_to_kernel(
            "a1", "Alice", "Engineering", "Developer"
        )
        assert result is None

    def test_grant_xp_when_disconnected(self, integration_disconnected):
        result = integration_disconnected.grant_xp_via_kernel("a1", "coding", 100)
        assert result is False

    def test_get_state_when_disconnected(self, integration_disconnected):
        result = integration_disconnected.get_kernel_state()
        assert result == []

    def test_grant_xp_no_entity_mapping(self, integration_with_mock):
        """grant_xp should return False when agent_id has no cached entity_id."""
        integration_with_mock._entity_map = {}
        result = integration_with_mock.grant_xp_via_kernel("unknown-agent", "coding", 50)
        assert result is False


# ── Mock-based integration tests ───────────────────────────────────


class TestSyncAgent:
    def test_sync_agent_to_kernel_success(self, integration_with_mock, mock_client):
        mock_agent = KernelAgent(
            entity_id=42, id="a1", name="Alice",
            department="Engineering", company_role="Developer",
        )
        mock_client.create_agent.return_value = mock_agent

        result = integration_with_mock.sync_agent_to_kernel(
            "a1", "Alice", "Engineering", "Developer"
        )
        assert result is not None
        assert result.entity_id == 42
        assert integration_with_mock._entity_map["a1"] == 42
        mock_client.create_agent.assert_called_once()

    def test_sync_agent_failure(self, integration_with_mock, mock_client):
        mock_client.create_agent.side_effect = AgentKernelError("boom")

        result = integration_with_mock.sync_agent_to_kernel(
            "a1", "Alice", "Engineering", "Developer"
        )
        assert result is None


class TestGrantXP:
    def test_grant_xp_success(self, integration_with_mock, mock_client):
        integration_with_mock._entity_map["a1"] = 42
        mock_client.add_skill_xp.return_value = {"skillId": "coding", "xp": 100}

        result = integration_with_mock.grant_xp_via_kernel("a1", "coding", 100)
        assert result is True
        mock_client.add_skill_xp.assert_called_once_with(42, "coding", 100)

    def test_grant_xp_kernel_error(self, integration_with_mock, mock_client):
        integration_with_mock._entity_map["a1"] = 42
        mock_client.add_skill_xp.side_effect = AgentKernelError("skill not found")

        result = integration_with_mock.grant_xp_via_kernel("a1", "nonexistent", 50)
        assert result is False


class TestGetKernelState:
    def test_get_kernel_state_success(self, integration_with_mock, mock_client):
        mock_client.list_agents.return_value = [
            KernelAgent(
                entity_id=0, id="a1", name="Alice",
                department="Engineering", company_role="Developer",
                total_xp=150, career_stage="Mid",
            ),
            KernelAgent(
                entity_id=1, id="b2", name="Bob",
                department="Design", company_role="Designer",
            ),
        ]

        state = integration_with_mock.get_kernel_state()
        assert len(state) == 2
        assert state[0]["id"] == "a1"
        assert state[0]["total_xp"] == 150
        assert state[1]["id"] == "b2"

    def test_get_kernel_state_error(self, integration_with_mock, mock_client):
        mock_client.list_agents.side_effect = ConnectionError("lost")

        state = integration_with_mock.get_kernel_state()
        assert state == []


class TestSyncAllFromCompany:
    def test_sync_all(self, integration_with_mock, mock_client):
        """sync_all_from_company creates agents in kernel for each profile."""
        mock_client.create_agent.side_effect = [
            KernelAgent(entity_id=0, id="a1", name="Alice", department="Eng", company_role="Dev"),
            KernelAgent(entity_id=1, id="b2", name="Bob", department="Design", company_role="Designer"),
        ]

        # Create mock profile objects
        class FakeProfile:
            def __init__(self, agent_id, name, department, total_xp, career_stage):
                self.agent_id = agent_id
                self.name = name
                self.department = department
                self.total_xp = total_xp
                self.career_stage = career_stage

        profiles = [
            FakeProfile("a1", "Alice", "Eng", 100, "Mid"),
            FakeProfile("b2", "Bob", "Design", 50, "Junior"),
        ]

        results = integration_with_mock.sync_all_from_company(profiles)
        assert len(results) == 2
        assert results["a1"] is not None
        assert results["b2"] is not None
        assert integration_with_mock._entity_map["a1"] == 0
        assert integration_with_mock._entity_map["b2"] == 1


# ── Real daemon integration tests ──────────────────────────────────


class TestRealKernel:
    """These tests require the real C++ daemon to be running."""

    def test_connect_to_real_daemon(self, real_kernel):
        ki = KernelIntegration(socket_path=REAL_SOCKET)
        assert ki.connect() is True
        assert ki.is_available() is True
        ki.disconnect()
        assert ki.is_available() is False

    def test_sync_agent_real(self, real_integration):
        agent = real_integration.sync_agent_to_kernel(
            "integ-test-001", "TestAgent", "QA", "Tester"
        )
        assert agent is not None
        assert agent.id == "integ-test-001"
        assert "integ-test-001" in real_integration._entity_map

    def test_grant_xp_real(self, real_integration):
        """grant_xp_via_kernel on agent with no skill should return False."""
        # Ensure agent is synced
        real_integration.sync_agent_to_kernel(
            "integ-xp-001", "XpAgent", "Eng", "Dev"
        )
        # Skill doesn't exist in kernel yet, so this should gracefully fail
        result = real_integration.grant_xp_via_kernel(
            "integ-xp-001", "nonexistent_skill", 50
        )
        assert result is False  # Graceful fallback

    def test_get_kernel_state_real(self, real_integration):
        state = real_integration.get_kernel_state()
        assert isinstance(state, list)
        assert len(state) >= 1  # At least one agent from prior tests


# ── API endpoint tests ─────────────────────────────────────────────


class TestKernelAPIEndpoints:
    """Test the new API endpoints using httpx + mocked kernel."""

    @pytest.fixture
    async def api_client(self, tmp_path, monkeypatch):
        from httpx import ASGITransport, AsyncClient

        import server
        from agent_profile_manager import AgentProfileManager

        server._agent_profile_manager = AgentProfileManager(str(tmp_path / "profiles"))
        server.BACKEND_TOKEN = ""

        # Inject a mock KernelIntegration
        mock_ki = MagicMock()
        mock_ki.is_available.return_value = True
        mock_ki.get_kernel_state.return_value = [
            {
                "entity_id": 0, "id": "a1", "name": "Alice",
                "department": "Eng", "company_role": "Dev",
                "role": "Worker", "team_id": "",
                "total_xp": 100, "career_stage": "Mid",
                "tasks_completed": 5, "tasks_succeeded": 4,
                "avg_review_score": 7.5, "skills": {},
            }
        ]
        mock_agent = MagicMock()
        mock_agent.entity_id = 0
        mock_agent.id = "a1"
        mock_agent.name = "Alice"
        mock_agent.department = "Eng"
        mock_agent.company_role = "Dev"
        mock_agent.role = "Worker"
        mock_agent.team_id = ""
        mock_agent.total_xp = 100
        mock_agent.career_stage = "Mid"
        mock_agent.tasks_completed = 5
        mock_agent.tasks_succeeded = 4
        mock_agent.avg_review_score = 7.5
        mock_agent.skills = {}
        mock_ki.list_agents.return_value = [mock_agent]
        mock_ki.sync_all_from_company.return_value = {
            "a1": {"entity_id": 0, "id": "a1", "name": "Alice"},
        }
        mock_ki.grant_xp_via_kernel.return_value = True

        from routers import agents as agents_router
        agents_router.set_kernel_integration(mock_ki)

        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

        # Cleanup
        agents_router.set_kernel_integration(None)

    @pytest.mark.asyncio
    async def test_kernel_state_endpoint(self, api_client):
        resp = await api_client.get("/api/agents/kernel/state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["available"] is True
        assert len(data["data"]["agents"]) == 1
        assert data["data"]["agents"][0]["id"] == "a1"

    @pytest.mark.asyncio
    async def test_kernel_sync_endpoint(self, api_client):
        resp = await api_client.post("/api/agents/kernel/sync")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "total" in data["data"]
        assert "synced" in data["data"]

    @pytest.mark.asyncio
    async def test_kernel_state_when_unavailable(self, tmp_path):
        """When kernel is not injected, state endpoint returns available=False."""
        from httpx import ASGITransport, AsyncClient

        import server
        from agent_profile_manager import AgentProfileManager
        from routers import agents as agents_router

        server._agent_profile_manager = AgentProfileManager(str(tmp_path / "profiles"))
        server.BACKEND_TOKEN = ""
        agents_router.set_kernel_integration(None)

        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/agents/kernel/state")
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["data"]["available"] is False
            assert data["data"]["agents"] == []

    @pytest.mark.asyncio
    async def test_grant_xp_dual_write(self, api_client):
        """grant-xp should include kernel_xp_granted in the response."""
        resp = await api_client.post(
            "/api/agents/test-agent-1/grant-xp",
            json={
                "skill_id": "coding",
                "task_success": True,
                "review_score": 8.0,
                "task_complexity": 3,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        # Dual-write flag should be present since mock kernel is available
        assert "kernel_xp_granted" in data["data"]
