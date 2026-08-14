"""员工/把关点数据模型：human 成员与节点 gate"""
from protocol import WorkflowNode
from team import AgentLocation, TeamMember


def test_agent_member_defaults():
    m = TeamMember(agent_id="a1", role_name="executor", team_role="Executor", location=AgentLocation.LOCAL)
    assert m.member_type == "agent"
    assert m.approver_for == ()


def test_human_member_fields():
    m = TeamMember(
        agent_id="emp-1",
        role_name="employee",
        team_role="",
        location=AgentLocation.LOCAL,
        member_type="human",
        approver_for=("task-1", "task-2"),
    )
    assert m.member_type == "human"
    assert m.approver_for == ("task-1", "task-2")


def test_member_display_name_defaults_empty():
    m = TeamMember(agent_id="a1", role_name="executor", team_role="Executor", location=AgentLocation.LOCAL)
    assert m.display_name == ""


def test_member_display_name_settable():
    m = TeamMember(
        agent_id="emp-1",
        role_name="employee",
        team_role="",
        location=AgentLocation.LOCAL,
        member_type="human",
        display_name="张三",
    )
    assert m.display_name == "张三"


def test_workflow_node_gate():
    n = WorkflowNode(
        node_id="n1",
        task_description="撰写会议纪要",
        dept_id="dept-doc",
        gate={"approver": "emp-1", "stage": "review"},
    )
    assert n.gate == {"approver": "emp-1", "stage": "review"}


def test_workflow_node_gate_default_none():
    n = WorkflowNode(node_id="n1", task_description="t", dept_id="d")
    assert n.gate is None


from protocol import dict_to_workflow_node, workflow_node_to_dict


def test_gate_roundtrip_preserved():
    n = WorkflowNode(
        node_id="n1", task_description="撰写纪要", dept_id="dept-docs",
        gate={"approver": "emp-1", "stage": "review"},
    )
    restored = dict_to_workflow_node(workflow_node_to_dict(n))
    assert restored.gate == {"approver": "emp-1", "stage": "review"}


def test_gate_none_roundtrip():
    n = WorkflowNode(node_id="n1", task_description="t", dept_id="d")
    restored = dict_to_workflow_node(workflow_node_to_dict(n))
    assert restored.gate is None
