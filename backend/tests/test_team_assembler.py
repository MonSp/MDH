import pytest
import yaml
from team import TeamRuntime, RuntimeType, TeamStatus
from team_assembler import TeamAssembler


@pytest.fixture
def runtime():
    return TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )


@pytest.fixture
def roles_config(tmp_path):
    config = {
        "base_roles": {
            "coordinator": {
                "name": "产品经理",
                "team_role": "Coordinator",
                "tools": ["read_file", "list_directory", "git_status"],
                "dangerous_tools": [],
                "skills": ["task_decomposition"],
                "prompt_template": "coordinator",
            },
            "executor": {
                "name": "全栈开发工程师",
                "team_role": "Executor",
                "tools": ["read_file", "write_file", "edit_file", "bash"],
                "dangerous_tools": ["bash"],
                "skills": ["frontend_dev", "backend_dev"],
                "prompt_template": "executor",
            },
            "reviewer": {
                "name": "QA工程师",
                "team_role": "Reviewer",
                "tools": ["read_file", "bash", "run_tests"],
                "dangerous_tools": ["bash"],
                "skills": ["testing", "code_review"],
                "prompt_template": "reviewer",
            },
        }
    }
    config_path = tmp_path / "roles_config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(config, f)
    return str(config_path)


def test_assemble_creates_team(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            }
        ]
    }
    team = assembler.assemble_from_dag(dag, "proj-1", runtime)
    assert team.team_id.startswith("team-")
    assert team.project_id == "proj-1"
    assert team.runtime == runtime
    assert team.status == TeamStatus.CREATED
    assert len(team.members) >= 1


def test_assemble_assigns_leader(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            }
        ]
    }
    team = assembler.assemble_from_dag(dag, "proj-1", runtime)
    assert team.leader is not None
    assert team.leader.team_role == "Coordinator"


def test_assemble_multiple_tasks(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            },
            {
                "task_id": "task-2",
                "name": "后端开发",
                "required_skills": ["backend_dev"],
                "description": "开发API",
            },
        ]
    }
    team = assembler.assemble_from_dag(dag, "proj-1", runtime)
    team_roles = {m.team_role for m in team.members}
    assert "Coordinator" in team_roles
    assert "Executor" in team_roles
