"""
Tests for the AgentKernelClient IPC module.

These tests run against a real agent-kernel daemon binary, started as
a subprocess with a dedicated test socket.
"""

import os
import sys
import time
import socket
import signal
import subprocess
from pathlib import Path

import pytest

# Ensure backend/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent_kernel_client import AgentKernelClient, AgentKernelError, KernelAgent  # noqa: E402

DAEMON_PATH = str(
    Path(__file__).resolve().parents[2]
    / ".." / "MyGame" / "agent-kernel" / "build" / "agent-kernel-daemon"
)
SOCKET_PATH = "/tmp/test-kernel-py.sock"


def _wait_for_socket(path: str, timeout: float = 5.0):
    """Block until the socket file exists and accepts a connection."""
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
def kernel():
    """Start the agent-kernel daemon for the test session."""
    # Clean up stale socket
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass

    if not os.path.exists(DAEMON_PATH):
        pytest.skip(f"Daemon binary not found at {DAEMON_PATH}")

    proc = subprocess.Popen(
        [DAEMON_PATH, "--socket", SOCKET_PATH],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        _wait_for_socket(SOCKET_PATH)
    except TimeoutError:
        proc.kill()
        stdout, stderr = proc.communicate()
        pytest.fail(
            f"Daemon failed to start.\nstdout: {stdout}\nstderr: {stderr}"
        )

    yield proc

    # Teardown
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass


@pytest.fixture(scope="module")
def client(kernel) -> AgentKernelClient:
    """Provide a connected client for the test session."""
    c = AgentKernelClient(SOCKET_PATH)
    c.connect()
    yield c
    c.disconnect()


# ── Connection tests ───────────────────────────────────────────────


class TestConnection:
    def test_connect_and_disconnect(self, kernel):
        c = AgentKernelClient(SOCKET_PATH)
        assert not c.is_connected
        c.connect()
        assert c.is_connected
        c.disconnect()
        assert not c.is_connected

    def test_connect_refused(self):
        c = AgentKernelClient("/tmp/nonexistent-kernel-xyz.sock")
        with pytest.raises((ConnectionRefusedError, FileNotFoundError, OSError)):
            c.connect()


# ── Agent CRUD tests ──────────────────────────────────────────────


class TestAgentCRUD:
    def test_create_agent(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="Alice",
            department="Engineering",
            company_role="Backend Developer",
            agent_id="py-test-001",
            team_id="alpha",
        )
        assert isinstance(agent, KernelAgent)
        assert agent.id == "py-test-001"
        assert agent.name == "Alice"
        assert agent.department == "Engineering"
        assert agent.company_role == "Backend Developer"
        assert agent.team_id == "alpha"
        assert agent.entity_id >= 0
        assert agent.career_stage == "Junior"
        assert agent.total_xp == 0

    def test_create_agent_auto_id(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="Bob",
            department="Design",
            company_role="UI Designer",
        )
        assert agent.name == "Bob"
        assert agent.id.startswith("py-agent-")

    def test_get_agent(self, client: AgentKernelClient):
        # First agent created above should be entity 0
        agent = client.create_agent(
            name="GetTest",
            department="QA",
            company_role="Tester",
            agent_id="py-get-001",
        )
        fetched = client.get_agent(agent.entity_id)
        assert fetched is not None
        assert fetched.id == "py-get-001"
        assert fetched.name == "GetTest"

    def test_get_agent_not_found(self, client: AgentKernelClient):
        result = client.get_agent(99999)
        assert result is None

    def test_list_agents(self, client: AgentKernelClient):
        # At least the agents we've created should be present
        agents = client.list_agents()
        assert isinstance(agents, list)
        assert len(agents) >= 1
        ids = {a.id for a in agents}
        assert "py-test-001" in ids

    def test_update_agent(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="UpdateMe",
            department="Ops",
            company_role="SRE",
            agent_id="py-update-001",
        )
        updated = client.update_agent(
            agent.entity_id,
            name="UpdatedName",
            role="Lead",
        )
        assert updated.name == "UpdatedName"
        assert updated.role == "Lead"
        # Department should be unchanged
        assert updated.department == "Ops"

    def test_delete_agent(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="DeleteMe",
            department="Temp",
            company_role="Intern",
            agent_id="py-delete-001",
        )
        result = client.delete_agent(agent.entity_id)
        assert result is True

        # Verify it's gone
        fetched = client.get_agent(agent.entity_id)
        assert fetched is None

    def test_create_agent_requires_name(self, client: AgentKernelClient):
        """Creating an agent without a name should fail."""
        with pytest.raises(AgentKernelError):
            client._send("createAgent", {"id": "no-name", "name": ""})


# ── Skills tests ──────────────────────────────────────────────────


class TestSkills:
    def test_get_skills_empty(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="SkillTest",
            department="Engineering",
            company_role="Developer",
            agent_id="py-skills-001",
        )
        skills = client.get_skills(agent.entity_id)
        assert isinstance(skills, dict)
        # Fresh agent has an empty skill tree
        assert len(skills) == 0

    def test_add_skill_xp_no_skill_tree(self, client: AgentKernelClient):
        """addSkillXp on an agent with no pre-existing skill should error
        (the C++ daemon checks hasSkill before adding XP)."""
        agent = client.create_agent(
            name="XpTest",
            department="Engineering",
            company_role="Developer",
            agent_id="py-xp-001",
        )
        with pytest.raises(AgentKernelError, match="skill not found"):
            client.add_skill_xp(agent.entity_id, "nonexistent_skill", 50)


# ── Sync tests ────────────────────────────────────────────────────


class TestSync:
    def test_sync_state(self, client: AgentKernelClient):
        state = client.sync_state()
        assert "agents" in state
        assert "count" in state
        assert isinstance(state["agents"], list)
        assert state["count"] == len(state["agents"])
        assert state["count"] >= 1


# ── L4: LLM Decision tests ──────────────────────────────────────


class TestAgentDecide:
    def test_agent_decide(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="DecideAgent",
            department="engineering",
            company_role="developer",
            agent_id="py-decide-001",
        )
        result = client.agent_decide(agent.entity_id, "Implement a REST API")
        assert isinstance(result, dict)
        assert "action" in result
        assert "reasoning" in result
        assert "confidence" in result

    def test_agent_decide_invalid_entity(self, client: AgentKernelClient):
        with pytest.raises(AgentKernelError, match="entity not found"):
            client.agent_decide(99999, "some task")


# ── L5: Agent Tick tests ─────────────────────────────────────────


class TestAgentTick:
    def test_agent_tick(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="TickAgent",
            department="engineering",
            company_role="developer",
            agent_id="py-tick-001",
        )
        result = client.agent_tick(agent.entity_id, "Write unit tests")
        assert isinstance(result, dict)
        assert "action" in result
        assert "tickNumber" in result
        assert "timestamp" in result
        assert "decision" in result
        assert "effects" in result
        assert isinstance(result["effects"], list)

    def test_agent_tick_invalid_entity(self, client: AgentKernelClient):
        with pytest.raises(AgentKernelError, match="entity not found"):
            client.agent_tick(99999, "some task")


class TestRunSimulation:
    def test_run_simulation(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="SimAgent",
            department="engineering",
            company_role="developer",
            agent_id="py-sim-001",
        )
        result = client.run_simulation([agent.entity_id], ticks=2, tasks=["task A"])
        assert isinstance(result, dict)
        assert "results" in result
        assert "summary" in result
        assert len(result["results"]) == 2
        summary = result["summary"]
        assert summary["totalTicks"] == 2
        assert "averageConfidence" in summary
        assert "actionCounts" in summary

    def test_run_simulation_no_tasks(self, client: AgentKernelClient):
        agent = client.create_agent(
            name="SimAgent2",
            department="engineering",
            company_role="developer",
            agent_id="py-sim-002",
        )
        result = client.run_simulation([agent.entity_id], ticks=1)
        assert len(result["results"]) == 1


# ── Error handling tests ──────────────────────────────────────────


class TestErrorHandling:
    def test_unknown_method(self, client: AgentKernelClient):
        with pytest.raises(AgentKernelError, match="unknown method"):
            client._send("bogusMethodThatDoesNotExist")

    def test_error_on_missing_params(self, client: AgentKernelClient):
        with pytest.raises(AgentKernelError):
            client._send("createAgent", {})
