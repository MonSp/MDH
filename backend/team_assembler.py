"""TeamAssembler — 从DAG组装Team实例

根据任务依赖图，选择合适的角色，组装Team。
"""

import logging
import uuid
from typing import Optional

from team import Team, TeamMember, TeamRuntime, AgentLocation, TeamStatus

logger = logging.getLogger(__name__)

SKILL_TO_TEAM_ROLE = {
    "frontend_dev": "Executor",
    "backend_dev": "Executor",
    "fullstack_dev": "Executor",
    "database": "Executor",
    "api_design": "Executor",
    "testing": "Reviewer",
    "code_review": "Reviewer",
    "security_audit": "Reviewer",
    "architecture": "Planner",
    "task_decomposition": "Planner",
    "progress_tracking": "Coordinator",
    "risk_management": "Coordinator",
}


class TeamAssembler:
    """从DAG和角色配置组装Team实例"""

    def __init__(self, roles_config_path: Optional[str] = None):
        from agent_toolset import load_roles_config
        self._config = load_roles_config(roles_config_path)
        self._base_roles = self._config.get("base_roles", {})
        self._custom_roles = self._config.get("custom_roles", {})

    def _resolve_role(self, role_name: str) -> dict:
        if role_name in self._custom_roles:
            custom = self._custom_roles[role_name]
            base_name = custom.get("base_role", "")
            base = self._base_roles.get(base_name, {})
            return {**base, **custom}
        return self._base_roles.get(role_name, {})

    def _select_roles_for_dag(self, dag: dict) -> list[tuple[str, str]]:
        """根据DAG选择需要的角色，返回 (role_name, team_role) 列表。

        注意：每种 team_role 只选第一个匹配的角色（如多个 Executor 只取一个）。
        这是有意设计——每个 team_role 一个代表，避免团队臃肿。
        """
        tasks = dag.get("tasks", [])
        needed_team_roles = set()
        selected_roles = []
        needed_team_roles.add("Coordinator")
        for task in tasks:
            for skill in task.get("required_skills", []):
                team_role = SKILL_TO_TEAM_ROLE.get(skill, "Executor")
                needed_team_roles.add(team_role)
        if any("dev" in s for t in tasks for s in t.get("required_skills", [])):
            needed_team_roles.add("Reviewer")
        for role_name, role_config in self._base_roles.items():
            team_role = role_config.get("team_role", "")
            if team_role in needed_team_roles:
                selected_roles.append((role_name, team_role))
                needed_team_roles.discard(team_role)
        return selected_roles

    def assemble_from_dag(self, dag: dict, project_id: str, runtime: TeamRuntime) -> Team:
        team_id = f"team-{uuid.uuid4().hex[:8]}"
        team = Team(
            team_id=team_id,
            project_id=project_id,
            runtime=runtime,
        )
        # 从 DAG 中提取每个角色的 location
        task_locations = {}
        for task in dag.get("tasks", []):
            for skill in task.get("required_skills", []):
                task_locations[skill] = task.get("location", "local")

        selected_roles = self._select_roles_for_dag(dag)
        for role_name, team_role in selected_roles:
            agent_id = f"agent-{role_name}-{uuid.uuid4().hex[:6]}"
            role_config = self._resolve_role(role_name)
            # 从 DAG 任务中获取该角色的 location
            primary_skill = role_config.get("skills", [""])[0] if role_config.get("skills") else ""
            loc_str = task_locations.get(primary_skill, "local")
            location = AgentLocation.REMOTE if loc_str == "remote" else AgentLocation.LOCAL
            member = TeamMember(
                agent_id=agent_id,
                role_name=role_name,
                team_role=team_role,
                location=location,
                skill_pack_id=primary_skill,
            )
            team.add_member(member)
            if team_role == "Coordinator" and team.leader is None:
                team.set_leader(agent_id)
        logger.info("Team %s 组装完成，共 %d 个成员", team_id, len(team.members))
        return team

    def assemble_hybrid_team(
        self,
        dag: dict,
        project_id: str,
        runtime: TeamRuntime,
        humans: list[dict],
    ) -> Team:
        """组混合团队：agent 成员按既有逻辑选取，human 成员作为把关人加入。

        humans 元素: {"employee_id": str, "name": str, "approver_for": [task_id, ...]}
        """
        team = self.assemble_from_dag(dag, project_id, runtime)
        for h in humans:
            team.add_member(TeamMember(
                agent_id=h["employee_id"],
                role_name="employee",
                team_role="",  # human 成员不参与 team_role 查询
                location=AgentLocation.LOCAL,
                member_type="human",
                approver_for=tuple(h.get("approver_for", [])),
                display_name=h.get("name", ""),
            ))
        return team
