"""工作流相关协议类型"""

from dataclasses import dataclass, field
from enum import Enum


class WorkflowNodeStatus(str, Enum):
    """工作流节点状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class WorkflowExecutionStatus(str, Enum):
    """工作流执行状态"""
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class WorkflowNode:
    """工作流节点定义"""
    node_id: str
    task_description: str
    dept_id: str
    input_spec: dict = field(default_factory=dict)
    output_spec: dict = field(default_factory=dict)
    status: WorkflowNodeStatus = WorkflowNodeStatus.PENDING
    result: dict | None = None
    gate: dict | None = None
    execution_target: str = "local"  # "local" | "a2a:<agent_id>" | "auto"


@dataclass
class WorkflowEdge:
    """工作流边定义"""
    source_node_id: str
    target_node_id: str
    condition: str | None = None


@dataclass
class WorkflowDefinition:
    """工作流定义"""
    workflow_id: str
    name: str
    description: str
    nodes: list[WorkflowNode] = field(default_factory=list)
    edges: list[WorkflowEdge] = field(default_factory=list)
    execution_strategy: str = "sequential"


@dataclass
class WorkflowExecution:
    """工作流执行实例"""
    execution_id: str
    workflow_id: str
    status: WorkflowExecutionStatus = WorkflowExecutionStatus.CREATED
    started_at: str = ""
    completed_at: str | None = None
    node_states: dict = field(default_factory=dict)
    results: dict = field(default_factory=dict)


# ── 序列化函数 ──

def workflow_node_status_to_dict(status: WorkflowNodeStatus) -> dict:
    return {"status": status.value}


def workflow_execution_status_to_dict(status: WorkflowExecutionStatus) -> dict:
    return {"status": status.value}


def workflow_node_to_dict(node: WorkflowNode) -> dict:
    return {
        "node_id": node.node_id,
        "task_description": node.task_description,
        "dept_id": node.dept_id,
        "input_spec": node.input_spec,
        "output_spec": node.output_spec,
        "status": node.status.value,
        "result": node.result,
        "gate": node.gate,
    }


def workflow_edge_to_dict(edge: WorkflowEdge) -> dict:
    return {
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "condition": edge.condition,
    }


def workflow_definition_to_dict(definition: WorkflowDefinition) -> dict:
    return {
        "workflow_id": definition.workflow_id,
        "name": definition.name,
        "description": definition.description,
        "nodes": [workflow_node_to_dict(n) for n in definition.nodes],
        "edges": [workflow_edge_to_dict(e) for e in definition.edges],
        "execution_strategy": definition.execution_strategy,
    }


def workflow_execution_to_dict(execution: WorkflowExecution) -> dict:
    return {
        "execution_id": execution.execution_id,
        "workflow_id": execution.workflow_id,
        "status": execution.status.value,
        "started_at": execution.started_at,
        "completed_at": execution.completed_at,
        "node_states": {k: v.value for k, v in execution.node_states.items()},
        "results": execution.results,
    }


def dict_to_workflow_node_status(data: str) -> WorkflowNodeStatus:
    return WorkflowNodeStatus(data)


def dict_to_workflow_execution_status(data: str) -> WorkflowExecutionStatus:
    return WorkflowExecutionStatus(data)


def dict_to_workflow_node(data: dict) -> WorkflowNode:
    return WorkflowNode(
        node_id=data["node_id"],
        task_description=data["task_description"],
        dept_id=data["dept_id"],
        input_spec=data.get("input_spec", {}),
        output_spec=data.get("output_spec", {}),
        status=WorkflowNodeStatus(data["status"]) if "status" in data else WorkflowNodeStatus.PENDING,
        result=data.get("result"),
        gate=data.get("gate"),
    )


def dict_to_workflow_edge(data: dict) -> WorkflowEdge:
    return WorkflowEdge(
        source_node_id=data["source_node_id"],
        target_node_id=data["target_node_id"],
        condition=data.get("condition"),
    )


def dict_to_workflow_definition(data: dict) -> WorkflowDefinition:
    return WorkflowDefinition(
        workflow_id=data["workflow_id"],
        name=data["name"],
        description=data["description"],
        nodes=[dict_to_workflow_node(n) for n in data.get("nodes", [])],
        edges=[dict_to_workflow_edge(e) for e in data.get("edges", [])],
        execution_strategy=data.get("execution_strategy", "sequential"),
    )


def dict_to_workflow_execution(data: dict) -> WorkflowExecution:
    return WorkflowExecution(
        execution_id=data["execution_id"],
        workflow_id=data["workflow_id"],
        status=WorkflowExecutionStatus(data["status"]) if "status" in data else WorkflowExecutionStatus.CREATED,
        started_at=data.get("started_at", ""),
        completed_at=data.get("completed_at"),
        node_states={k: WorkflowNodeStatus(v) for k, v in data.get("node_states", {}).items()},
        results=data.get("results", {}),
    )
