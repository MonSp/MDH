"""混合团队组装：agent 成员 + human 把关成员"""
import yaml
import pytest
from team import RuntimeType, TeamRuntime
from team_assembler import TeamAssembler


@pytest.fixture
def runtime():
    return TeamRuntime(runtime_id="rt-1", runtime_type=RuntimeType.LOCAL_DOCKER, root_path="/tmp/workspace")


@pytest.fixture
def roles_config(tmp_path):
    config = {
        "base_roles": {
            "coordinator": {
                "name": "产品经理", "team_role": "Coordinator",
                "tools": ["read_file"], "dangerous_tools": [],
                "skills": ["task_decomposition"], "prompt_template": "coordinator",
            },
            "executor": {
                "name": "文档撰写员", "team_role": "Executor",
                "tools": ["read_file", "write_file"], "dangerous_tools": [],
                "skills": ["frontend_dev"], "prompt_template": "executor",
            },
        }
    }
    path = tmp_path / "roles_config.yaml"
    path.write_text(yaml.dump(config), encoding="utf-8")
    return str(path)


DAG = {
    "tasks": [
        {"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "从速记生成纪要"},
    ]
}


def test_hybrid_team_has_agent_and_human_members(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(
        DAG, "proj-1", runtime,
        humans=[{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    )
    agents = [m for m in team.members if m.member_type == "agent"]
    humans = [m for m in team.members if m.member_type == "human"]
    assert len(agents) >= 1
    assert len(humans) == 1
    assert humans[0].agent_id == "emp-1"
    assert humans[0].approver_for == ("task-1",)
    assert humans[0].team_role == ""


def test_hybrid_team_without_humans_is_pure_agent(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(DAG, "proj-1", runtime, humans=[])
    assert len(team.members) >= 1
    assert all(m.member_type == "agent" for m in team.members)


def test_hybrid_team_human_display_name(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(
        DAG, "proj-1", runtime,
        humans=[{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    )
    human = next(m for m in team.members if m.member_type == "human")
    assert human.display_name == "张三"


def test_hybrid_team_human_display_name_default_empty(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(
        DAG, "proj-1", runtime,
        humans=[{"employee_id": "emp-1", "approver_for": ["task-1"]}],
    )
    human = next(m for m in team.members if m.member_type == "human")
    assert human.display_name == ""


def test_hybrid_team_agent_display_name_default_empty(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(DAG, "proj-1", runtime, humans=[])
    assert all(m.display_name == "" for m in team.members)
