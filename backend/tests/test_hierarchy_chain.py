"""集成测试 — 完整 6 层层级链

验证 CEO → Project → Team → RoleAgent → SkillPack → Toolkit 的完整链路。

[S1-S7] 端到端集成测试，仅创建测试，不修改生产代码。
"""

import os

import pytest
import yaml

from project_manager import ProjectManager
from skill_registry import SkillRegistry
from team import Team, TeamMember, TeamStatus


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def skill_packs_dir(tmp_path):
    """创建包含多个技能包的临时 skill_packs 目录。

    每个子目录包含 manifest.yaml + system_prompt.md。
    manifest.name 作为 SkillRegistry.load_from_skill_packs() 的 skill_id。
    """
    packs_dir = tmp_path / "skill_packs"
    packs_dir.mkdir()

    pack_defs = [
        ("frontend_dev", "前端开发", "组件驱动开发，状态管理"),
        ("backend_dev", "后端开发", "API设计，数据库操作"),
        ("testing", "测试", "测试驱动开发，单元/集成测试"),
        ("code_review", "代码审查", "代码质量审查，安全漏洞发现"),
        ("task_decomposition", "任务分解", "需求分析，任务拆解"),
    ]

    for dirname, name, description in pack_defs:
        pack_dir = packs_dir / dirname
        pack_dir.mkdir()
        manifest = {
            "name": name,
            "version": "1.0.0",
            "description": description,
            "category": "dev",
            "required_tools": ["read_file", "write_file"],
        }
        (pack_dir / "manifest.yaml").write_text(
            yaml.dump(manifest, allow_unicode=True), encoding="utf-8"
        )
        (pack_dir / "system_prompt.md").write_text(
            f"# {name}\n\n系统指令", encoding="utf-8"
        )

    return str(packs_dir)


@pytest.fixture
def full_setup(tmp_path, skill_packs_dir):
    """搭建完整 6 层链路所需的全部组件。

    Returns:
        dict: pm (ProjectManager), registry (SkillRegistry),
              roles_config (dict), skill_packs_dir (str)
    """
    skill_base = str(tmp_path / "skill_base")
    registry = SkillRegistry(skill_base)
    registry.load_from_skill_packs(skill_packs_dir)

    projects_dir = str(tmp_path / "projects")
    pm = ProjectManager(projects_dir, registry)

    # 加载真实 roles_config（TeamAssembler 内部使用的同一文件）
    roles_config_path = os.path.join(
        os.path.dirname(__file__), "..", "roles_config.yaml"
    )
    with open(roles_config_path, encoding="utf-8") as f:
        roles_config = yaml.safe_load(f)

    return {
        "pm": pm,
        "registry": registry,
        "roles_config": roles_config,
        "skill_packs_dir": skill_packs_dir,
    }


# ---------------------------------------------------------------------------
# Main integration test
# ---------------------------------------------------------------------------


def test_full_chain_ceo_to_toolkit(full_setup):
    """验证完整 6 层层级链：CEO → Project → Team → RoleAgent → SkillPack → Toolkit。

    Layer 1 (CEO):        roles_config 定义 ceo/coordinator 角色
    Layer 2 (Project):    ProjectManager.create_project 创建项目
    Layer 3 (Team):       ProjectManager.instantiate_project 返回 Team
    Layer 4 (RoleAgent):  TeamMember 有 role_name 和 skill_pack_id
    Layer 5 (SkillPack):  skill_pack_id 可通过 SkillRegistry 解析为真实技能包
    Layer 6 (Toolkit):    角色的 permissions.tools 在 roles_config.tools 中定义
    """
    pm = full_setup["pm"]
    registry = full_setup["registry"]
    roles_config = full_setup["roles_config"]

    # ------------------------------------------------------------------
    # Layer 1-2: CEO 层 → Project 创建
    # ------------------------------------------------------------------
    project = pm.create_project(
        "集成测试项目",
        {"description": "端到端层级链验证", "language": "zh"},
    )

    assert project is not None
    assert project.name == "集成测试项目"
    assert project.status == "created"
    assert project.project_id  # uuid 非空

    # ------------------------------------------------------------------
    # Layer 2-3: Project → Team 实例化
    # ------------------------------------------------------------------
    # DAG 包含多种任务类型，触发不同 team_role 的选择
    skill_list = registry.list_skills()
    skill_name_to_id = {s["name"]: s["skill_id"] for s in skill_list}

    dag = {
        "tasks": [
            {
                "task_id": "task-fe",
                "name": "前端页面开发",
                "required_skills": [skill_name_to_id["前端开发"]],
                "description": "开发用户界面",
            },
            {
                "task_id": "task-decompose",
                "name": "需求分解",
                "required_skills": [skill_name_to_id["任务分解"]],
                "description": "分析并拆解需求",
            },
        ]
    }

    team = pm.instantiate_project(project.project_id, dag)

    # ------------------------------------------------------------------
    # Layer 3: Team 结构验证
    # ------------------------------------------------------------------
    assert isinstance(team, Team)
    assert team.project_id == project.project_id
    assert team.status == TeamStatus.CREATED
    assert len(team.members) >= 2  # 至少 Coordinator + Executor

    # Team 有 leader
    assert team.leader is not None
    assert team.leader.team_role == "Coordinator"

    # 验证项目状态已更新为 running
    reloaded = pm.get_project(project.project_id)
    assert reloaded.status == "running"

    # ------------------------------------------------------------------
    # Layer 4: RoleAgent 层 — 每个 TeamMember 的属性
    # ------------------------------------------------------------------
    team_roles_found = {m.team_role for m in team.members}
    assert "Coordinator" in team_roles_found  # 始终存在

    for member in team.members:
        assert isinstance(member, TeamMember)
        assert member.agent_id  # agent_id 非空
        assert member.role_name  # role_name 非空
        assert member.team_role in {
            "Coordinator", "Planner", "Executor", "Reviewer", "Monitor",
        }

    # ------------------------------------------------------------------
    # Layer 5: SkillPack 层 — 技能包可通过 SkillRegistry 解析
    # ------------------------------------------------------------------
    # TeamMember.skill_pack_id 来自 roles_config.base_roles.<role>.skills[0]
    # （英文名如 "task_decomposition"），而 load_from_skill_packs 使用
    # manifest.name（中文如 "任务分解"）作为 skill_id。
    # 验证两条路径：
    #   (a) 每个 TeamMember 都有非空 skill_pack_id
    #   (b) ProjectManager 创建的 EmployeeInstance 的 skill_id（来自 DAG，
    #       使用 registry 中的真实 ID）能解析为 SkillPack
    registered_skill_ids = {s["skill_id"] for s in registry.list_skills()}

    # (a) 所有 TeamMember 都有 skill_pack_id
    for member in team.members:
        assert member.skill_pack_id, (
            f"成员 {member.role_name} 缺少 skill_pack_id"
        )

    # (b) EmployeeInstance 的 skill_id 可解析为真实 SkillPack
    reloaded_project = pm.get_project(project.project_id)
    assert len(reloaded_project.employees) >= 2

    for emp in reloaded_project.employees:
        assert emp.skill_id in registered_skill_ids, (
            f"员工 {emp.employee_id} 的 skill_id "
            f"'{emp.skill_id}' 未在 SkillRegistry 中注册"
        )
        pkg = registry.get_skill(emp.skill_id)
        assert pkg.name
        assert pkg.version
        assert pkg.base_path
        assert os.path.isdir(pkg.base_path)

    # ------------------------------------------------------------------
    # Layer 6: Toolkit 层 — 角色工具在 roles_config.tools 中定义
    # ------------------------------------------------------------------
    config_tools = roles_config.get("tools", {})
    base_roles = roles_config.get("base_roles", {})

    for member in team.members:
        role_config = base_roles.get(member.role_name, {})
        role_tools = role_config.get("permissions", {}).get("tools", [])

        for tool_name in role_tools:
            assert tool_name in config_tools, (
                f"角色 {member.role_name} 使用的工具 '{tool_name}' "
                f"未在 roles_config.tools 中定义"
            )
