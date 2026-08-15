"""把关强制力：gate 拒绝的节点置 FAILED，下游中止，execution FAILED；可重试"""
import sys
import os

# 添加backend目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from protocol import WorkflowDefinition, WorkflowEdge, WorkflowNode, WorkflowNodeStatus, WorkflowExecutionStatus
from workflow_engine import WorkflowEngine


def _chain_definition():
    return WorkflowDefinition(
        workflow_id="wf-gate",
        name="gate",
        description="gate 链路",
        nodes=[
            WorkflowNode(node_id="draft", task_description="撰写", dept_id="dept-docs",
                         gate={"approver": "emp-1", "stage": "review"}),
            WorkflowNode(node_id="proofread", task_description="校对", dept_id="dept-docs"),
        ],
        edges=[WorkflowEdge(source_node_id="draft", target_node_id="proofread")],
        execution_strategy="sequential",
    )


async def test_gate_rejection_fails_node_and_skips_downstream():
    engine = WorkflowEngine()

    async def rejected_executor(node, input_data):
        return {"gate": {"status": "rejected", "reason": "需修改"}}

    async def proofread_executor(node, input_data):
        return {"result": "校对结果"}

    engine.register_node_executor("dept-docs", rejected_executor)
    execution = engine.create_workflow(_chain_definition())
    await engine.execute_workflow(execution.execution_id)
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.FAILED
    assert status.node_states["proofread"] == WorkflowNodeStatus.SKIPPED
    assert status.status == WorkflowExecutionStatus.FAILED
    assert status.results["draft"]["gate"]["status"] == "rejected"


async def test_gate_approved_stays_completed():
    """gate 通过的节点维持 COMPLETED，下游正常执行"""
    engine = WorkflowEngine()
    executed = []

    async def approved_executor(node, input_data):
        executed.append(node.node_id)
        return {"gate": {"status": "approved"}, "result": "ok"}

    engine.register_node_executor("dept-docs", approved_executor)
    execution = engine.create_workflow(_chain_definition())
    await engine.execute_workflow(execution.execution_id)
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.COMPLETED
    assert status.node_states["proofread"] == WorkflowNodeStatus.COMPLETED
    assert status.status == WorkflowExecutionStatus.COMPLETED
    assert executed == ["draft", "proofread"]


async def test_gate_rejected_node_retryable():
    """gate 拒绝的节点可经 retry_node 重跑为 COMPLETED"""
    engine = WorkflowEngine()
    state = {"rejected": True}

    async def flaky_executor(node, input_data):
        if node.node_id == "draft" and state["rejected"]:
            return {"gate": {"status": "rejected", "reason": "需修改"}}
        return {"result": "ok"}

    engine.register_node_executor("dept-docs", flaky_executor)
    execution = engine.create_workflow(_chain_definition())
    await engine.execute_workflow(execution.execution_id)

    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.FAILED
    assert status.status == WorkflowExecutionStatus.FAILED

    # 把关改为通过后重试失败节点
    state["rejected"] = False
    await engine.retry_node(execution.execution_id, "draft")
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.COMPLETED


async def test_retry_node_recovers_only_target_node():
    """锁定 retry 语义：重试成功只恢复目标节点，下游 SKIPPED 与 execution 状态不变。"""
    engine = WorkflowEngine()
    calls = {"rejected": True}

    async def rejected_executor(node, input_data):
        if node.node_id == "draft" and calls["rejected"]:
            return {"gate": {"status": "rejected", "reason": "需修改"}}
        return {"result": f"{node.node_id} done"}

    engine.register_node_executor("dept-docs", rejected_executor)
    execution = engine.create_workflow(_chain_definition())
    await engine.execute_workflow(execution.execution_id)
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.FAILED
    assert status.node_states["proofread"] == WorkflowNodeStatus.SKIPPED

    calls["rejected"] = False
    await engine.retry_node(execution.execution_id, "draft")
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.COMPLETED
    assert status.node_states["proofread"] == WorkflowNodeStatus.SKIPPED  # 下游不随 retry 恢复
