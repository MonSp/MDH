"""durable execution：工作流执行持久化 + 断点恢复跳过已完成节点 + 防重复执行"""

import asyncio
import json

import pytest

from workflow_engine import WorkflowEngine
from protocol import (
    WorkflowDefinition,
    WorkflowNode,
    WorkflowEdge,
    WorkflowNodeStatus,
    WorkflowExecutionStatus,
)


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


async def test_recovery_parallel_skips_completed_nodes(tmp_path):
    """parallel 策略：恢复持久化 execution 后仅执行剩余节点（已完成节点不重复执行）"""
    first_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    # p1 → p3，p2 → p3（第一层并行，p3 依赖两者）
    nodes = [
        WorkflowNode(node_id="p1", task_description="t1", dept_id="dept-frontend"),
        WorkflowNode(node_id="p2", task_description="t2", dept_id="dept-backend"),
        WorkflowNode(node_id="p3", task_description="t3", dept_id="dept-qa"),
    ]
    edges = [
        WorkflowEdge(source_node_id="p1", target_node_id="p3"),
        WorkflowEdge(source_node_id="p2", target_node_id="p3"),
    ]
    definition = WorkflowDefinition(
        workflow_id="wf-parallel-recover", name="并行恢复", description="",
        nodes=nodes, edges=edges, execution_strategy="parallel",
    )
    for dept in ("dept-frontend", "dept-backend", "dept-qa"):
        first_engine.register_node_executor(dept, exec1)

    execution = first_engine.create_workflow(definition)
    # 模拟进程中断在 p3 之前：p1、p2 已完成，p3 仍 PENDING
    execution.node_states["p1"] = WorkflowNodeStatus.COMPLETED
    execution.node_states["p2"] = WorkflowNodeStatus.COMPLETED
    execution.results["p1"] = {"result": "done-p1"}
    execution.results["p2"] = {"result": "done-p2"}
    first_engine.persist_execution(execution.execution_id)

    second_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    for dept in ("dept-frontend", "dept-backend", "dept-qa"):
        second_engine.register_node_executor(dept, exec1)

    restored = second_engine.load_execution(execution.execution_id)
    assert restored is not None
    assert restored.node_states["p1"] == WorkflowNodeStatus.COMPLETED

    await second_engine.execute_workflow(restored.execution_id)
    # p1、p2 不重复执行，仅执行 p3
    assert executed == ["p3"]
    status = second_engine.get_workflow_status(restored.execution_id)
    assert status.status == WorkflowExecutionStatus.COMPLETED
    assert status.node_states["p3"] == WorkflowNodeStatus.COMPLETED


async def test_recovery_mixed_skips_completed_nodes(tmp_path):
    """mixed 策略：恢复持久化 execution 后仅执行剩余节点（已完成节点不重复执行）"""
    first_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    # A、B 无依赖（并行）；D 依赖 A（A→D）
    nodes = [
        WorkflowNode(node_id="A", task_description="t1", dept_id="dept-frontend"),
        WorkflowNode(node_id="B", task_description="t2", dept_id="dept-backend"),
        WorkflowNode(node_id="D", task_description="t3", dept_id="dept-qa"),
    ]
    edges = [WorkflowEdge(source_node_id="A", target_node_id="D")]
    definition = WorkflowDefinition(
        workflow_id="wf-mixed-recover", name="混合恢复", description="",
        nodes=nodes, edges=edges, execution_strategy="mixed",
    )
    for dept in ("dept-frontend", "dept-backend", "dept-qa"):
        first_engine.register_node_executor(dept, exec1)

    execution = first_engine.create_workflow(definition)
    # 模拟进程中断：A 已完成，B、D 未执行
    execution.node_states["A"] = WorkflowNodeStatus.COMPLETED
    execution.results["A"] = {"result": "done-A"}
    first_engine.persist_execution(execution.execution_id)

    second_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    for dept in ("dept-frontend", "dept-backend", "dept-qa"):
        second_engine.register_node_executor(dept, exec1)

    restored = second_engine.load_execution(execution.execution_id)
    assert restored is not None

    await second_engine.execute_workflow(restored.execution_id)
    # A 不重复执行，仅执行 B 和 D
    assert set(executed) == {"B", "D"}
    status = second_engine.get_workflow_status(restored.execution_id)
    assert status.status == WorkflowExecutionStatus.COMPLETED
    assert status.node_states["B"] == WorkflowNodeStatus.COMPLETED
    assert status.node_states["D"] == WorkflowNodeStatus.COMPLETED


def test_load_all_executions_filters_checkpoints_json(tmp_path):
    """load_all_executions 仅返回 execution-id 形态文件，checkpoints.json 不应出现"""
    from compensation import CheckpointManager

    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    execution = engine.create_workflow(_make_definition("wf-list"))

    # 构造 CheckpointManager 落盘的 checkpoints.json（非 execution-id 形态）
    CheckpointManager(persistence_dir=str(tmp_path)).save_checkpoint("task-x", 1, {"s": 1})
    assert (tmp_path / "checkpoints.json").exists()

    ids = engine.load_all_executions()
    assert execution.execution_id in ids
    assert "checkpoints" not in ids
    # 返回的每个 id 均为 8 位十六进制（uuid4[:8] 形态）
    assert all(len(eid) == 8 and all(c in "0123456789abcdefABCDEF" for c in eid) for eid in ids)


async def test_persist_execution_atomic_leaves_no_tmp(tmp_path):
    """原子写：持久化后不残留 .tmp 文件，目标文件完整可读"""
    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    execution = engine.create_workflow(_make_definition("wf-atomic"))
    engine.persist_execution(execution.execution_id)

    assert not [p.name for p in tmp_path.iterdir() if p.name.endswith(".tmp")]
    data = json.loads((tmp_path / f"{execution.execution_id}.json").read_text())
    assert data["workflow_id"] == "wf-atomic"


async def test_load_execution_corrupt_file_returns_none(tmp_path):
    """损坏/截断的 execution JSON 返回 None 而非抛异常"""
    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    execution = engine.create_workflow(_make_definition("wf-corrupt"))
    path = tmp_path / f"{execution.execution_id}.json"
    path.write_text('{"status": "running", "node_states": {')  # 截断 JSON

    restored = engine.load_execution(execution.execution_id)
    assert restored is None


def test_checkpoint_manager_load_corrupt_file_skips(tmp_path):
    """损坏的 checkpoints.json 不导致 CheckpointManager 崩溃"""
    from compensation import CheckpointManager

    (tmp_path / "checkpoints.json").write_text('{"task-x": [')
    m = CheckpointManager(persistence_dir=str(tmp_path))
    assert m.get_latest_checkpoint("task-x") is None


async def test_reloaded_execution_reruns_failed_nodes(tmp_path):
    """恢复含 FAILED 节点的工作流：FAILED 节点按重试语义重新执行（仅跳过 COMPLETED）"""
    engine1 = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": "ok"}

    engine1.register_node_executor("dept-frontend", exec1)
    engine1.register_node_executor("dept-backend", exec1)

    execution = engine1.create_workflow(_make_definition())
    # 模拟进程中断在 n1 完成、n2 失败之后
    execution.node_states["n1"] = WorkflowNodeStatus.COMPLETED
    execution.results["n1"] = {"result": "ok"}
    execution.node_states["n2"] = WorkflowNodeStatus.FAILED
    execution.results["n2"] = {"error": "boom"}
    engine1.persist_execution(execution.execution_id)

    engine2 = WorkflowEngine(persistence_dir=str(tmp_path))
    engine2.register_node_executor("dept-frontend", exec1)
    engine2.register_node_executor("dept-backend", exec1)

    restored = engine2.load_execution(execution.execution_id)
    assert restored is not None
    assert restored.node_states["n2"] == WorkflowNodeStatus.FAILED

    await engine2.execute_workflow(restored.execution_id)
    # 仅重跑 FAILED 的 n2，COMPLETED 的 n1 跳过
    assert executed == ["n2"]
    status = engine2.get_workflow_status(restored.execution_id)
    assert status.status == WorkflowExecutionStatus.COMPLETED
    assert status.node_states["n1"] == WorkflowNodeStatus.COMPLETED
    assert status.node_states["n2"] == WorkflowNodeStatus.COMPLETED


def test_persist_execution_unserializable_result_returns_false(tmp_path):
    """executor 结果含不可序列化对象时 persist_execution 返回 False 而非抛 TypeError"""
    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    execution = engine.create_workflow(_make_definition("wf-typeerror"))
    # 注入不可序列化的结果（函数对象无法被 json.dump）
    execution.node_states["n1"] = WorkflowNodeStatus.COMPLETED
    execution.results["n1"] = {"bad": lambda x: x}

    assert engine.persist_execution(execution.execution_id) is False


async def test_parallel_execution_persists_all_node_states(tmp_path):
    """并行 DAG：两节点均完成后落盘文件包含两节点 COMPLETED 状态（原子写完整性）"""
    engine = WorkflowEngine(persistence_dir=str(tmp_path))

    async def exec1(node, input_data):
        return {"result": f"done-{node.node_id}"}

    # p1、p2 无依赖（同一层并行）
    nodes = [
        WorkflowNode(node_id="p1", task_description="t1", dept_id="dept-frontend"),
        WorkflowNode(node_id="p2", task_description="t2", dept_id="dept-backend"),
    ]
    definition = WorkflowDefinition(
        workflow_id="wf-parallel-persist", name="并行落盘", description="",
        nodes=nodes, edges=[], execution_strategy="parallel",
    )
    engine.register_node_executor("dept-frontend", exec1)
    engine.register_node_executor("dept-backend", exec1)

    execution = engine.create_workflow(definition)
    await engine.execute_workflow(execution.execution_id)

    data = json.loads((tmp_path / f"{execution.execution_id}.json").read_text())
    assert data["node_states"]["p1"] == WorkflowNodeStatus.COMPLETED.value
    assert data["node_states"]["p2"] == WorkflowNodeStatus.COMPLETED.value
