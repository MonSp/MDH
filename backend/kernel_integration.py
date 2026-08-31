"""
Kernel Integration Service — bridge between Company backend and agent-kernel daemon.

Provides a thin abstraction layer so that agent profile operations (create,
get, list, XP grant) can optionally flow through the C++ agent-kernel when
available, while keeping the existing SQLite path as primary.
"""

import logging
import os
from typing import Dict, List, Optional

from agent_kernel_client import AgentKernelClient, AgentKernelError, KernelAgent

logger = logging.getLogger("kernel_integration")


class KernelIntegration:
    """Bridge between Company backend and agent-kernel daemon.

    Usage::

        ki = KernelIntegration()
        if ki.connect():
            ki.sync_agent_to_kernel(...)
            ki.grant_xp_via_kernel(...)
        ki.disconnect()
    """

    def __init__(self, socket_path: Optional[str] = None):
        if socket_path is None:
            socket_path = os.environ.get(
                "AGENT_KERNEL_SOCKET", "/tmp/agent-kernel.sock"
            )
        self._socket_path = socket_path
        self._client = AgentKernelClient(socket_path)
        self._connected = False
        # Mapping: company agent_id (str) -> kernel entity_id (int)
        self._entity_map: Dict[str, int] = {}

    def connect(self) -> bool:
        """Try to connect to kernel. Returns False if unavailable."""
        try:
            self._client.connect()
            self._connected = True
            logger.info("Agent-kernel connected at %s", self._socket_path)
            return True
        except (ConnectionError, FileNotFoundError, OSError) as e:
            self._connected = False
            logger.info("Agent-kernel unavailable: %s", e)
            return False

    def is_available(self) -> bool:
        return self._connected

    def disconnect(self):
        """Disconnect from the kernel daemon."""
        if self._connected:
            self._client.disconnect()
            self._connected = False

    # ── Agent sync ──────────────────────────────────────────────────

    def sync_agent_to_kernel(
        self,
        agent_id: str,
        name: str,
        department: str,
        company_role: str,
        total_xp: int = 0,
        career_stage: str = "Junior",
    ) -> Optional[KernelAgent]:
        """Sync an agent from Company DB to kernel.

        Creates the agent in the kernel (or retrieves it if already present)
        and caches the entity_id mapping.

        Returns the KernelAgent on success, None if kernel is unavailable.
        """
        if not self._connected:
            return None
        try:
            agent = self._client.create_agent(
                name=name,
                department=department,
                company_role=company_role,
                agent_id=agent_id,
            )
            self._entity_map[agent_id] = agent.entity_id
            logger.info(
                "Synced agent %s to kernel (entity_id=%d)", agent_id, agent.entity_id
            )
            return agent
        except (AgentKernelError, ConnectionError, OSError) as e:
            logger.warning("sync_agent_to_kernel failed for %s: %s", agent_id, e)
            return None

    def grant_xp_via_kernel(
        self, agent_id: str, skill_id: str, xp: int
    ) -> bool:
        """Grant XP through kernel. Returns False if kernel unavailable or
        the agent/skill is not present in the kernel.

        Uses the cached entity_id mapping; falls back to False if no mapping.
        """
        if not self._connected:
            return False
        entity_id = self._entity_map.get(agent_id)
        if entity_id is None:
            logger.debug(
                "grant_xp_via_kernel: no entity_id for %s, skipping", agent_id
            )
            return False
        try:
            self._client.add_skill_xp(entity_id, skill_id, xp)
            return True
        except (AgentKernelError, ConnectionError, OSError) as e:
            # Skill may not exist in kernel yet — log and continue
            logger.debug(
                "grant_xp_via_kernel failed for %s/%s: %s", agent_id, skill_id, e
            )
            return False

    # ── Career XP ─────────────────────────────────────────────────

    def grant_career_xp_via_kernel(self, agent_id: str, xp: int) -> bool:
        """Grant career XP through kernel. Returns False if kernel unavailable
        or the agent is not present in the kernel.
        """
        if not self._connected:
            return False
        entity_id = self._entity_map.get(agent_id)
        if entity_id is None:
            logger.debug(
                "grant_career_xp_via_kernel: no entity_id for %s, skipping", agent_id
            )
            return False
        try:
            self._client.add_career_xp(entity_id, xp)
            return True
        except (AgentKernelError, ConnectionError, OSError) as e:
            logger.warning(
                "grant_career_xp_via_kernel failed for %s: %s", agent_id, e
            )
            return False

    # ── Query ───────────────────────────────────────────────────────

    def get_kernel_state(self) -> List[dict]:
        """Get all agents from kernel as serializable dicts.

        Returns an empty list if kernel is unavailable.
        """
        if not self._connected:
            return []
        try:
            agents = self._client.list_agents()
            return [
                {
                    "entity_id": a.entity_id,
                    "id": a.id,
                    "name": a.name,
                    "department": a.department,
                    "company_role": a.company_role,
                    "role": a.role,
                    "team_id": a.team_id,
                    "total_xp": a.total_xp,
                    "career_stage": a.career_stage,
                    "tasks_completed": a.tasks_completed,
                    "tasks_succeeded": a.tasks_succeeded,
                    "avg_review_score": a.avg_review_score,
                    "skills": a.skills,
                }
                for a in agents
            ]
        except (ConnectionError, OSError) as e:
            logger.warning("get_kernel_state failed: %s", e)
            return []

    def sync_all_from_company(
        self, profiles: list
    ) -> Dict[str, Optional[dict]]:
        """Bulk-sync all Company profiles to the kernel.

        *profiles* should be a list of AgentProfile objects (from
        AgentProfileManager.list_profiles()).  Returns a mapping of
        agent_id -> kernel agent dict (or None on failure).
        """
        results: Dict[str, Optional[dict]] = {}
        for p in profiles:
            kernel_agent = self.sync_agent_to_kernel(
                agent_id=p.agent_id,
                name=p.name,
                department=p.department or "",
                company_role=p.department or "Employee",
                total_xp=p.total_xp,
                career_stage=p.career_stage,
            )
            if kernel_agent:
                results[p.agent_id] = {
                    "entity_id": kernel_agent.entity_id,
                    "id": kernel_agent.id,
                    "name": kernel_agent.name,
                }
            else:
                results[p.agent_id] = None
        return results
