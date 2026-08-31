"""
Python IPC client for the C++ agent-kernel daemon.

Communicates over a Unix domain socket using newline-delimited JSON
(matching the C++ UnixSocketServer / AgentKernelBridge protocol).

Usage:
    from agent_kernel_client import AgentKernelClient

    client = AgentKernelClient("/tmp/agent-kernel.sock")
    client.connect()
    agent = client.create_agent("alice", "Engineering", "Backend Developer")
    print(agent)
    client.disconnect()
"""

import socket
import json
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class KernelAgent:
    """Represents a full agent profile as returned by the kernel."""
    entity_id: int = -1
    id: str = ""
    name: str = ""
    department: str = ""
    company_role: str = ""
    role: str = "Worker"
    team_id: str = ""
    total_xp: int = 0
    career_stage: str = "Junior"
    tasks_completed: int = 0
    tasks_succeeded: int = 0
    avg_review_score: float = 0.0
    skills: Dict[str, dict] = field(default_factory=dict)


class AgentKernelError(Exception):
    """Raised when the kernel returns an error response."""
    pass


class AgentKernelClient:
    """Python client for the C++ agent-kernel daemon via Unix Socket IPC.

    The daemon at ``/tmp/agent-kernel.sock`` (by default) accepts
    newline-delimited JSON requests and returns JSON responses.  This
    client wraps every IPC method with typed Python helpers.
    """

    def __init__(self, socket_path: str = "/tmp/agent-kernel.sock"):
        self._socket_path = socket_path
        self._sock: Optional[socket.socket] = None
        self._request_id = 0
        self._buffer = b""

    # ── connection lifecycle ───────────────────────────────────────

    def connect(self):
        """Connect to the kernel daemon."""
        self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self._sock.connect(self._socket_path)
        self._buffer = b""

    def disconnect(self):
        """Close the connection."""
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None

    @property
    def is_connected(self) -> bool:
        return self._sock is not None

    # ── low-level transport ────────────────────────────────────────

    def _send(self, method: str, params: dict = None) -> dict:
        """Send a request and wait for the response.

        The C++ server processes requests sequentially per client and
        responds with a single newline-delimited JSON line.
        """
        if not self._sock:
            raise ConnectionError("Not connected. Call connect() first.")

        self._request_id += 1
        request = {
            "method": method,
            "params": params or {},
            "id": self._request_id,
        }
        data = json.dumps(request) + "\n"
        self._sock.sendall(data.encode("utf-8"))

        # Read until we get a complete newline-delimited response.
        while True:
            if b"\n" in self._buffer:
                line, self._buffer = self._buffer.split(b"\n", 1)
                line = line.strip()
                if line:
                    resp = json.loads(line.decode("utf-8"))
                    if not resp.get("ok", False):
                        raise AgentKernelError(
                            resp.get("error", "Unknown kernel error")
                        )
                    return resp

            chunk = self._sock.recv(65536)
            if not chunk:
                raise ConnectionError("Connection closed by kernel")
            self._buffer += chunk

    # ── Agent CRUD ─────────────────────────────────────────────────

    def create_agent(
        self,
        name: str,
        department: str,
        company_role: str,
        role: str = "Worker",
        agent_id: Optional[str] = None,
        team_id: str = "",
    ) -> KernelAgent:
        """Create a new agent in the kernel.

        The C++ daemon requires a unique string ``id`` for each agent.
        If *agent_id* is not supplied, one is auto-generated from the
        request counter.
        """
        if agent_id is None:
            agent_id = f"py-agent-{self._request_id + 1}"
        params: Dict[str, Any] = {
            "id": agent_id,
            "name": name,
            "department": department,
            "companyRole": company_role,
            "role": role,
        }
        if team_id:
            params["teamId"] = team_id

        result = self._send("createAgent", params)
        return self._parse_agent(result["data"])

    def get_agent(self, entity_id: int) -> Optional[KernelAgent]:
        """Get an agent by its entity ID."""
        try:
            result = self._send("getAgent", {"entityId": entity_id})
        except AgentKernelError:
            return None
        data = result.get("data")
        if not data:
            return None
        return self._parse_agent(data)

    def update_agent(self, entity_id: int, **fields) -> KernelAgent:
        """Update fields on an existing agent.

        Supported keyword arguments: ``name``, ``department``,
        ``company_role``, ``team_id``, ``role``.
        """
        params: Dict[str, Any] = {"entityId": entity_id}
        # Map Python snake_case → camelCase for the C++ side
        key_map = {
            "name": "name",
            "department": "department",
            "company_role": "companyRole",
            "team_id": "teamId",
            "role": "role",
        }
        for py_key, ipc_key in key_map.items():
            if py_key in fields:
                params[ipc_key] = fields[py_key]

        result = self._send("updateAgent", params)
        return self._parse_agent(result["data"])

    def delete_agent(self, entity_id: int) -> bool:
        """Delete an agent by entity ID. Returns True on success."""
        self._send("deleteAgent", {"entityId": entity_id})
        return True

    def list_agents(self) -> List[KernelAgent]:
        """List all agents currently in the kernel."""
        result = self._send("listAgents", {})
        data = result.get("data", [])
        if isinstance(data, list):
            return [self._parse_agent(a) for a in data]
        return []

    # ── Skills ─────────────────────────────────────────────────────

    def add_skill_xp(self, entity_id: int, skill_id: str, xp: int) -> dict:
        """Add XP to a specific skill on an agent.

        Returns the updated skill node dict.
        """
        result = self._send("addSkillXp", {
            "entityId": entity_id,
            "skillId": skill_id,
            "xp": xp,
        })
        return result.get("data", {})

    def get_skills(self, entity_id: int) -> Dict[str, dict]:
        """Get all skills for an agent."""
        result = self._send("getSkills", {"entityId": entity_id})
        return result.get("data", {})

    # ── Sync ───────────────────────────────────────────────────────

    def sync_state(self) -> Dict[str, Any]:
        """Sync full state from the kernel.

        Returns a dict with ``agents`` (list of KernelAgent) and
        ``count`` (int).
        """
        result = self._send("syncState", {})
        data = result.get("data", {})
        agents = [self._parse_agent(a) for a in data.get("agents", [])]
        return {"agents": agents, "count": data.get("count", len(agents))}

    # ── parsing helpers ────────────────────────────────────────────

    def _parse_agent(self, data: dict) -> KernelAgent:
        """Parse the kernel's nested agent JSON into a KernelAgent.

        The C++ daemon returns agents with this structure::

            {
              "entityId": 0,
              "identity": {
                "id": "...", "name": "...", "department": "...",
                "companyRole": "...", "teamId": "...", "role": "Worker"
              },
              "skillTree": { ... },
              "career": {
                "totalXp": 0, "stage": "Junior",
                "tasksCompleted": 0, "tasksSucceeded": 0,
                "avgReviewScore": 0
              }
            }
        """
        identity = data.get("identity", {})
        career = data.get("career", {})
        return KernelAgent(
            entity_id=data.get("entityId", -1),
            id=identity.get("id", ""),
            name=identity.get("name", ""),
            department=identity.get("department", ""),
            company_role=identity.get("companyRole", ""),
            role=identity.get("role", "Worker"),
            team_id=identity.get("teamId", ""),
            total_xp=career.get("totalXp", 0),
            career_stage=career.get("stage", "Junior"),
            tasks_completed=career.get("tasksCompleted", 0),
            tasks_succeeded=career.get("tasksSucceeded", 0),
            avg_review_score=career.get("avgReviewScore", 0.0),
            skills=data.get("skillTree", {}),
        )
