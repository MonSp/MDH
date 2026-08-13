"""durable execution：工作流执行持久化 + 断点恢复跳过已完成节点 + 防重复执行"""

import asyncio
import json

import pytest

from workflow_engine import WorkflowEngine
from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowNodeStatus


def _make_definition(workflow_id="wf-persist"):
    return WorkflowDefinition(
        workflow_id=workflow_id,
        name="持久化测试",
        description="",
        nodes=[
            WorkflowNode(node_id="n1", task_description="t1", dept_id="dept-frontend"),
            WorkflowNode(node_id="n2", task_description="t2", dept_id="dept-backend"),
        ],
        edges=[WorkflowEdge(source_node_id="n1", target_node_id="n2")],
    )


async def test_execution_persisted_to_disk(tmp_path):
    """执行后 execution 状态落盘为 JSON 文件"""
    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    engine.register_node_executor("dept-frontend", exec1)
    engine.register_node_executor("dept-backend", exec1)

    execution = engine.create_workflow(_make_definition())
    await engine.execute_workflow(execution.execution_id)

    disk_file = tmp_path / f"{execution.execution_id}.json"
    assert disk_file.exists()
    data = json.loads(disk_file.read_text())
    assert data["status"] == "completed"
    assert "n1" in data["node_states"]


async def test_reloaded_execution_skips_completed_nodes(tmp_path):
    """恢复持久化 execution 后，已完成节点不重复执行（防重复执行）"""
    first_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    first_engine.register_node_executor("dept-frontend", exec1)
    first_engine.register_node_executor("dept-backend", exec1)

    execution = first_engine.create_workflow(_make_definition())
    # 手动推进 n1 完成并落盘（模拟进程中断在 n1 之后）
    execution.node_states["n1"] = WorkflowNodeStatus.COMPLETED
    execution.results["n1"] = {"result": "done-n1"}
    first_engine.persist_execution(execution.execution_id)

    second_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    second_engine.register_node_executor("dept-frontend", exec1)
    second_engine.register_node_executor("dept-backend", exec1)

    restored = second_engine.load_execution(execution.execution_id)
    assert restored is not None
    assert restored.node_states["n1"] == WorkflowNodeStatus.COMPLETED

    await second_engine.execute_workflow(restored.execution_id)
    # n1 不重复执行，仅执行 n2
    assert executed == ["n2"]
    status = second_engine.get_workflow_status(restored.execution_id)
    assert status.node_states["n2"] == WorkflowNodeStatus.COMPLETED


async def test_checkpoint_manager_persists_to_disk(tmp_path):
    """CheckpointManager 检查点落盘并在新实例中可恢复"""
    from compensation import CheckpointManager

    m1 = CheckpointManager(persistence_dir=str(tmp_path))
    cp = m1.save_checkpoint("task-x", 2, {"progress": "half"})

    m2 = CheckpointManager(persistence_dir=str(tmp_path))
    restored = m2.restore_checkpoint(cp.id)
    assert restored == {"progress": "half"}
