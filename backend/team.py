"""Team — 团队抽象层

管理一组共享运行环境的RoleAgent实例。
Team内部通过Meeting进行讨论和协调。
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Optional


class RuntimeType(str, enum.Enum):
    LOCAL_DOCKER = "local_docker"
    REMOTE_POD = "remote_pod"


class AgentLocation(str, enum.Enum):
    LOCAL = "local"
    REMOTE = "remote"


class TeamStatus(str, enum.Enum):
    CREATED = "created"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    DISSOLVED = "dissolved"


@dataclass
class TeamRuntime:
    """Team共享的运行环境"""
    runtime_id: str
    runtime_type: RuntimeType
    root_path: str
    network_config: dict = field(default_factory=dict)


@dataclass
class TeamMember:
    """Team成员（RoleAgent在Team中的表示）"""
    agent_id: str
    role_name: str
    team_role: str  # Coordinator | Planner | Executor | Reviewer | Monitor
    location: AgentLocation
    skill_pack_id: str = ""
    status: str = "idle"
    member_type: str = "agent"   # "agent" | "human"（human=现实员工，作为把关人）
    approver_for: tuple = ()     # human 成员负责把关的 task_id 列表


@dataclass
class Team:
    """团队实例，管理一组共享Runtime的RoleAgent"""
    team_id: str
    project_id: str
    runtime: TeamRuntime
    members: list[TeamMember] = field(default_factory=list)
    leader: Optional[TeamMember] = field(default=None, repr=False)
    status: TeamStatus = TeamStatus.CREATED

    def add_member(self, member: TeamMember) -> None:
        self.members.append(member)

    def set_leader(self, agent_id: str) -> None:
        for m in self.members:
            if m.agent_id == agent_id:
                self.leader = m
                return
        raise ValueError(f"成员不存在: {agent_id}")

    def set_status(self, status: TeamStatus) -> None:
        self.status = status

    def get_member_by_team_role(self, team_role: str) -> Optional[TeamMember]:
        for m in self.members:
            if m.team_role == team_role:
                return m
        return None

    def get_member_by_id(self, agent_id: str) -> Optional[TeamMember]:
        for m in self.members:
            if m.agent_id == agent_id:
                return m
        return None
