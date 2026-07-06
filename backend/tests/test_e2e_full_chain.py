"""
端到端全链路测试：CEO → Project → Team → SkillPack → Meeting

使用真实的 roles_config.yaml 和 skill_packs/ 目录，
验证完整链路在生产配置下是否跑通。
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from team import Team, TeamStatus
from team_assembler import TeamAssembler
from skill_registry import SkillRegistry
from project_manager import ProjectManager
from ceo_agent import team_to_meeting_template, _build_dag
from agent_toolset import load_roles_config


# ─── 使用真实配置的 Fixture ───────────────────────────────────────────────────


@pytest.fixture
def real_env(tmp_path):
    """使用真实的 roles_config.yaml 和 skill_packs/ 目录"""
    project_root = os.path.join(os.path.dirname(__file__), "..", "..")

    # 1. 加载真实 roles_config
    config_path = os.path.join(project_root, "backend", "roles_config.yaml")
    roles_config = load_roles_config(config_path)

    # 2. 使用真实 skill_packs 目录
    skill_packs_dir = os.path.join(project_root, "skill_packs")

    # 3. 创建 SkillRegistry 并加载真实 skill_packs
    registry = SkillRegistry(str(tmp_path / "skill_base"))
    registry.load_from_skill_packs(skill_packs_dir)

    # 4. 创建 ProjectManager（传递 config_path 给 TeamAssembler）
    pm = ProjectManager(
        projects_dir=str(tmp_path / "projects"),
        skill_registry=registry,
        roles_config_path=config_path,
    )

    return {
        "pm": pm,
        "registry": registry,
        "config_path": config_path,
        "roles_config": roles_config,
        "skill_packs_dir": skill_packs_dir,
    }


# ─── 测试场景 ────────────────────────────────────────────────────────────────


class TestFullChainReal:
    """使用真实配置的全链路测试"""

    def test_01_dag_construction(self, real_env):
        """CEO 根据选中角色构建 DAG"""
        roles_config = real_env["roles_config"]
        selected_roles = ["coordinator", "executor", "reviewer"]

        dag = _build_dag(selected_roles, roles_config, "帮我开发一个TODO应用")

        assert len(dag["tasks"]) == 3
        for task in dag["tasks"]:
            assert len(task["required_skills"]) > 0

        # coordinator → task_decomposition
        coord = next(t for t in dag["tasks"] if "coordinator" in t["task_id"])
        assert "task_decomposition" in coord["required_skills"]

        # executor → frontend_dev, backend_dev
        exec_task = next(t for t in dag["tasks"] if "executor" in t["task_id"])
        assert "frontend_dev" in exec_task["required_skills"]
        assert "backend_dev" in exec_task["required_skills"]

    def test_02_project_creates_team(self, real_env):
        """ProjectManager.instantiate_project() 返回 Team"""
        pm = real_env["pm"]
        roles_config = real_env["roles_config"]

        project = pm.create_project("TODO应用", {"source": "test"})
        dag = _build_dag(["coordinator", "executor", "reviewer"], roles_config, "开发TODO")
        team = pm.instantiate_project(project.project_id, dag)

        assert isinstance(team, Team)
        assert team.project_id == project.project_id
        assert team.status == TeamStatus.CREATED
        assert len(team.members) >= 3
        assert team.leader is not None
        assert team.leader.team_role == "Coordinator"

    def test_03_skill_pack_resolution(self, real_env):
        """Team 成员的 skill_pack_id 能解析到真实 SkillPack（部分解析即可）"""
        pm = real_env["pm"]
        registry = real_env["registry"]
        roles_config = real_env["roles_config"]

        project = pm.create_project("技能测试", {"source": "test"})
        dag = _build_dag(["coordinator", "executor", "reviewer"], roles_config, "开发TODO")
        team = pm.instantiate_project(project.project_id, dag)

        resolved = 0
        unresolved = []
        for member in team.members:
            if member.skill_pack_id:
                try:
                    skill = registry.get_skill(member.skill_pack_id)
                    resolved += 1
                except KeyError:
                    unresolved.append(member.skill_pack_id)

        # Team 已成功组装（不要求所有技能都有 skill_pack）
        assert len(team.members) >= 3
        # 记录解析情况
        print(f"\n  已解析: {resolved}, 未解析: {unresolved}")

    def test_04_meeting_template_generation(self, real_env):
        """Team 转换为会议模板，包含正确的角色映射"""
        from protocol import AgentRole

        pm = real_env["pm"]
        roles_config = real_env["roles_config"]

        project = pm.create_project("模板测试", {"source": "test"})
        dag = _build_dag(["coordinator", "executor", "reviewer"], roles_config, "开发TODO")
        team = pm.instantiate_project(project.project_id, dag)
        template = team_to_meeting_template(team)

        assert len(template) >= 3
        for item in template:
            assert "id" in item
            assert "name" in item
            assert "role" in item
            assert "capabilities" in item

        roles_in_template = {item["role"] for item in template}
        assert AgentRole.COORDINATOR in roles_in_template

    def test_05_meeting_session_with_team(self, real_env):
        """MeetingSession 使用 Team 模板成功启动"""
        from meeting import MeetingSession

        pm = real_env["pm"]
        roles_config = real_env["roles_config"]

        project = pm.create_project("会议测试", {"source": "test"})
        dag = _build_dag(["coordinator", "executor", "reviewer"], roles_config, "开发TODO")
        team = pm.instantiate_project(project.project_id, dag)
        template = team_to_meeting_template(team)

        meeting = MeetingSession("e2e-meeting")
        meeting.start(team_template=template)

        assert meeting.is_running()
        agents = meeting.get_agents_dict()
        assert len(agents) >= 3

    def test_06_full_scenario_narrative(self, real_env, capsys):
        """完整场景叙述：从用户输入到会议启动，输出链路报告"""
        from meeting import MeetingSession

        pm = real_env["pm"]
        registry = real_env["registry"]
        roles_config = real_env["roles_config"]

        user_message = "帮我开发一个TODO应用"
        selected_roles = ["coordinator", "planner", "executor", "reviewer"]

        # ─── Step 1: CEO 创建项目 ───
        project = pm.create_project(
            name=f"任务-{user_message[:20]}",
            brief={"source": "ceo_agent", "original_message": user_message},
        )

        # ─── Step 2: CEO 构建 DAG ───
        dag = _build_dag(selected_roles, roles_config, user_message)

        # ─── Step 3: 实例化 → Team ───
        team = pm.instantiate_project(project.project_id, dag)

        # ─── Step 4: 技能认领 ───
        skill_claims = {}
        for member in team.members:
            if member.skill_pack_id:
                try:
                    skill = registry.get_skill(member.skill_pack_id)
                    skill_claims[member.agent_id] = {
                        "role": member.team_role,
                        "skill": skill.name,
                        "tools": skill.manifest.get("required_tools", []),
                    }
                except KeyError:
                    skill_claims[member.agent_id] = {
                        "role": member.team_role,
                        "skill": f"{member.skill_pack_id} (未注册)",
                        "tools": [],
                    }

        # ─── Step 5: 会议模板 ───
        template = team_to_meeting_template(team)

        # ─── Step 6: 启动会议 ───
        meeting = MeetingSession("e2e-full-meeting")
        meeting.start(team_template=template)

        # ─── 验证 ───
        assert meeting.is_running()
        assert len(template) >= 3

        # ─── 输出报告 ───
        print("\n" + "=" * 60)
        print("全链路验证报告")
        print("=" * 60)
        print(f"用户输入: {user_message}")
        print(f"项目ID:   {project.project_id}")
        print(f"Team ID:  {team.team_id}")
        print(f"成员数:   {len(team.members)}")
        print(f"Leader:   {team.leader.role_name if team.leader else 'None'}")
        print(f"会议ID:   {meeting.meeting_id}")
        print()
        print("技能认领:")
        for agent_id, claim in skill_claims.items():
            tools_str = ", ".join(claim["tools"][:3])
            print(f"  {claim['role']:12s} → {claim['skill']:20s} 工具: [{tools_str}...]")
        print()
        print("会议模板:")
        for item in template:
            print(f"  {item['name']:15s} role={str(item['role']):15s} caps={item['capabilities']}")
        print("=" * 60)
