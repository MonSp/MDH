"""WorkflowEngine 测试"""

import asyncio
import pytest
import sys
import os

# 添加backend目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from protocol import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowExecution,
    WorkflowExecutionStatus,
    WorkflowNode,
    WorkflowNodeStatus,
)
from workflow_engine import WorkflowEngine


@pytest.fixture
def workflow_engine():
    """创建WorkflowEngine实例"""
    return WorkflowEngine()


@pytest.fixture
def sample_workflow_definition():
    """创建工作流定义示例"""
    nodes = [
        WorkflowNode(
            node_id="node-1",
            task_description="任务1",
            dept_id="dept-frontend",
            status=WorkflowNodeStatus.PENDING,
        ),
        WorkflowNode(
            node_id="node-2",
            task_description="任务2",
            dept_id="dept-backend",
            status=WorkflowNodeStatus.PENDING,
        ),
        WorkflowNode(
            node_id="node-3",
            task_description="任务3",
            dept_id="dept-qa",
            status=WorkflowNodeStatus.PENDING,
        ),
    ]

    edges = [
        WorkflowEdge(source_node_id="node-1", target_node_id="node-2"),
        WorkflowEdge(source_node_id="node-2", target_node_id="node-3"),
    ]

    return WorkflowDefinition(
        workflow_id="test-workflow",
        name="测试工作流",
        description="这是一个测试工作流",
        nodes=nodes,
        edges=edges,
        execution_strategy="sequential",
    )


@pytest.fixture
def parallel_workflow_definition():
    """创建并行工作流定义示例"""
    nodes = [
        WorkflowNode(
            node_id="node-1",
            task_description="任务1",
            dept_id="dept-frontend",
            status=WorkflowNodeStatus.PENDING,
        ),
        WorkflowNode(
            node_id="node-2",
            task_description="任务2",
            dept_id="dept-backend",
            status=WorkflowNodeStatus.PENDING,
        ),
        WorkflowNode(
            node_id="node-3",
            task_description="任务3",
            dept_id="dept-qa",
            status=WorkflowNodeStatus.PENDING,
        ),
    ]

    # 没有边，表示所有节点都可以并行执行
    return WorkflowDefinition(
        workflow_id="parallel-workflow",
        name="并行工作流",
        description="这是一个并行工作流",
        nodes=nodes,
        edges=[],
        execution_strategy="parallel",
    )


@pytest.mark.asyncio
async def test_create_workflow(workflow_engine, sample_workflow_definition):
    """测试创建工作流"""
    execution = workflow_engine.create_workflow(sample_workflow_definition)

    assert execution.workflow_id == "test-workflow"
    assert execution.status == WorkflowExecutionStatus.CREATED
    assert len(execution.node_states) == 3
    assert all(state == WorkflowNodeStatus.PENDING for state in execution.node_states.values())


@pytest.mark.asyncio
async def test_execute_workflow_sequential(workflow_engine, sample_workflow_definition):
    """测试顺序执行工作流"""
    # 注册节点执行器
    async def mock_executor(node, input_data):
        return {"result": f"完成 {node.task_description}"}

    workflow_engine.register_node_executor("dept-frontend", mock_executor)
    workflow_engine.register_node_executor("dept-backend", mock_executor)
    workflow_engine.register_node_executor("dept-qa", mock_executor)

    # 创建并执行工作流
    execution = workflow_engine.create_workflow(sample_workflow_definition)
    await workflow_engine.execute_workflow(execution.execution_id)

    # 验证执行结果
    status = workflow_engine.get_workflow_status(execution.execution_id)
    assert status.status == WorkflowExecutionStatus.COMPLETED
    assert all(state == WorkflowNodeStatus.COMPLETED for state in status.node_states.values())
    assert len(status.results) == 3


@pytest.mark.asyncio
async def test_execute_workflow_parallel(workflow_engine, parallel_workflow_definition):
    """测试并行执行工作流"""
    # 注册节点执行器
    async def mock_executor(node, input_data):
        await asyncio.sleep(0.1)  # 模拟执行时间
        return {"result": f"完成 {node.task_description}"}

    workflow_engine.register_node_executor("dept-frontend", mock_executor)
    workflow_engine.register_node_executor("dept-backend", mock_executor)
    workflow_engine.register_node_executor("dept-qa", mock_executor)

    # 创建并执行工作流
    execution = workflow_engine.create_workflow(parallel_workflow_definition)
    await workflow_engine.execute_workflow(execution.execution_id)

    # 验证执行结果
    status = workflow_engine.get_workflow_status(execution.execution_id)
    assert status.status == WorkflowExecutionStatus.COMPLETED
    assert all(state == WorkflowNodeStatus.COMPLETED for state in status.node_states.values())
    assert len(status.results) == 3


@pytest.mark.asyncio
async def test_pause_and_resume_workflow(workflow_engine, sample_workflow_definition):
    """测试暂停和恢复工作流"""
    # 注册节点执行器
    async def mock_executor(node, input_data):
        await asyncio.sleep(0.5)  # 模拟长时间执行
        return {"result": f"完成 {node.task_description}"}

    workflow_engine.register_node_executor("dept-frontend", mock_executor)
    workflow_engine.register_node_executor("dept-backend", mock_executor)
    workflow_engine.register_node_executor("dept-qa", mock_executor)

    # 创建工作流
    execution = workflow_engine.create_workflow(sample_workflow_definition)

    # 开始执行（异步）
    execute_task = asyncio.create_task(workflow_engine.execute_workflow(execution.execution_id))

    # 等待一段时间后暂停
    await asyncio.sleep(0.2)
    await workflow_engine.pause_workflow(execution.execution_id)

    # 验证暂停状态
    status = workflow_engine.get_workflow_status(execution.execution_id)
    assert status.status == WorkflowExecutionStatus.PAUSED

    # 恢复执行
    await workflow_engine.resume_workflow(execution.execution_id)

    # 等待执行完成
    await execute_task

    # 验证最终状态
    final_status = workflow_engine.get_workflow_status(execution.execution_id)
    assert final_status.status == WorkflowExecutionStatus.COMPLETED


@pytest.mark.asyncio
async def test_cancel_workflow(workflow_engine, sample_workflow_definition):
    """测试取消工作流"""
    # 注册节点执行器
    async def mock_executor(node, input_data):
        await asyncio.sleep(1)  # 模拟长时间执行
        return {"result": f"完成 {node.task_description}"}

    workflow_engine.register_node_executor("dept-frontend", mock_executor)
    workflow_engine.register_node_executor("dept-backend", mock_executor)
    workflow_engine.register_node_executor("dept-qa", mock_executor)

    # 创建工作流
    execution = workflow_engine.create_workflow(sample_workflow_definition)

    # 开始执行（异步）
    execute_task = asyncio.create_task(workflow_engine.execute_workflow(execution.execution_id))

    # 等待一段时间后取消
    await asyncio.sleep(0.2)
    await workflow_engine.cancel_workflow(execution.execution_id)

    # 等待任务完成
    try:
        await execute_task
    except asyncio.CancelledError:
        pass

    # 验证取消状态
    status = workflow_engine.get_workflow_status(execution.execution_id)
    assert status.status == WorkflowExecutionStatus.CANCELLED


@pytest.mark.asyncio
async def test_retry_failed_node(workflow_engine, sample_workflow_definition):
    """测试重试失败节点"""
    call_count = 0

    async def failing_executor(node, input_data):
        nonlocal call_count
        call_count += 1
        if node.node_id == "node-2" and call_count <= 2:
            raise Exception("模拟执行失败")
        return {"result": f"完成 {node.task_description}"}

    workflow_engine.register_node_executor("dept-frontend", failing_executor)
    workflow_engine.register_node_executor("dept-backend", failing_executor)
    workflow_engine.register_node_executor("dept-qa", failing_executor)

    # 创建工作流
    execution = workflow_engine.create_workflow(sample_workflow_definition)

    # 执行工作流（应该失败）
    await workflow_engine.execute_workflow(execution.execution_id)

    # 验证失败状态
    status = workflow_engine.get_workflow_status(execution.execution_id)
    assert status.status == WorkflowExecutionStatus.FAILED
    assert status.node_states["node-2"] == WorkflowNodeStatus.FAILED

    # 重试失败节点
    await workflow_engine.retry_node(execution.execution_id, "node-2")

    # 验证重试后状态
    final_status = workflow_engine.get_workflow_status(execution.execution_id)
    assert final_status.node_states["node-2"] == WorkflowNodeStatus.COMPLETED


def test_get_workflow_visualization(workflow_engine, sample_workflow_definition):
    """测试获取工作流可视化数据"""
    execution = workflow_engine.create_workflow(sample_workflow_definition)
    visualization = workflow_engine.get_workflow_visualization(execution.execution_id)

    assert "execution" in visualization
    assert "definition" in visualization
    assert visualization["execution"]["execution_id"] == execution.execution_id
    assert visualization["definition"]["workflow_id"] == "test-workflow"


def test_topological_sort(workflow_engine, sample_workflow_definition):
    """测试拓扑排序"""
    sorted_nodes = workflow_engine._topological_sort(sample_workflow_definition)

    # 验证排序结果
    node_ids = [node.node_id for node in sorted_nodes]
    assert node_ids == ["node-1", "node-2", "node-3"]


def test_build_dependency_graph(workflow_engine, sample_workflow_definition):
    """测试构建依赖图"""
    graph = workflow_engine._build_dependency_graph(sample_workflow_definition)

    assert "node-1" in graph
    assert "node-2" in graph["node-1"]
    assert "node-3" in graph["node-2"]


def test_calculate_in_degree(workflow_engine, sample_workflow_definition):
    """测试计算入度"""
    in_degree = workflow_engine._calculate_in_degree(sample_workflow_definition)

    assert in_degree["node-1"] == 0
    assert in_degree["node-2"] == 1
    assert in_degree["node-3"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])