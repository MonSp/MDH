import pytest
from team import (
    Team, TeamRuntime, TeamStatus, RuntimeType, AgentLocation,
    TeamMember,
)


def test_team_runtime_create_local(tmp_path):
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path=str(tmp_path / "workspace"),
    )
    assert runtime.runtime_id == "rt-1"
    assert runtime.runtime_type == RuntimeType.LOCAL_DOCKER


def test_team_create():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(
        team_id="team-1",
        project_id="proj-1",
        runtime=runtime,
    )
    assert team.team_id == "team-1"
    assert team.project_id == "proj-1"
    assert team.runtime == runtime
    assert team.members == []
    assert team.leader is None
    assert team.status == TeamStatus.CREATED


def test_team_add_member():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    member = TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    )
    team.add_member(member)
    assert len(team.members) == 1
    assert team.members[0].agent_id == "agent-executor"


def test_team_set_leader():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    leader = TeamMember(
        agent_id="agent-coordinator",
        role_name="coordinator",
        team_role="Coordinator",
        location=AgentLocation.LOCAL,
    )
    member = TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    )
    team.add_member(leader)
    team.add_member(member)
    team.set_leader("agent-coordinator")
    assert team.leader.agent_id == "agent-coordinator"


def test_team_status_transitions():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    assert team.status == TeamStatus.CREATED
    team.set_status(TeamStatus.RUNNING)
    assert team.status == TeamStatus.RUNNING
    team.set_status(TeamStatus.COMPLETED)
    assert team.status == TeamStatus.COMPLETED


def test_team_get_member_by_role():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    team.add_member(TeamMember(
        agent_id="agent-coordinator",
        role_name="coordinator",
        team_role="Coordinator",
        location=AgentLocation.LOCAL,
    ))
    team.add_member(TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    ))
    coord = team.get_member_by_team_role("Coordinator")
    assert coord is not None
    assert coord.agent_id == "agent-coordinator"
    executor = team.get_member_by_team_role("Executor")
    assert executor is not None
    assert executor.agent_id == "agent-executor"
    assert team.get_member_by_team_role("Reviewer") is None


def test_team_get_member_by_id():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    team.add_member(TeamMember(
        agent_id="agent-coordinator",
        role_name="coordinator",
        team_role="Coordinator",
        location=AgentLocation.LOCAL,
    ))
    team.add_member(TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    ))
    assert team.get_member_by_id("agent-executor") is not None
    assert team.get_member_by_id("agent-executor").agent_id == "agent-executor"
    assert team.get_member_by_id("nonexistent") is None


def test_team_set_leader_nonexistent_raises():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    team.add_member(TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    ))
    with pytest.raises(ValueError, match="成员不存在"):
        team.set_leader("nonexistent-agent")
