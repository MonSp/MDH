"""工作流集成测试"""

import asyncio
import pytest
import sys
import os

# 添加backend目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from protocol import (
    AgentRole,
    MeetingAgentStatus,
    SemanticAnalysisResult,
    WorkflowDefinition,
    WorkflowNode,
    WorkflowEdge,
    WorkflowNodeStatus,
)
from meeting_coordinator import MeetingCoordinator
from meeting import MeetingSession


@pytest.fixture
def meeting_session():
    """创建会议会话"""
    session = MeetingSession("test-meeting")
    session.start()

    # 添加Agent
    session.add_agent("agent-ceo", "CEO", AgentRole.CEO, ["semantic_analysis", "task_delegation"])
    session.add_agent("agent-planner", "Planner", AgentRole.PLANNER, ["task_decomposition"])
    session.add_agent("agent-executor", "Executor", AgentRole.EXECUTOR, ["code_generation"])
    session.add_agent("agent-reviewer", "Reviewer", AgentRole.REVIEWER, ["code_review"])
    session.add_agent("agent-monitor", "Monitor", AgentRole.MONITOR, ["monitoring"])

    yield session
    session.stop()
    session.cleanup()


@pytest.fixture
def meeting_coordinator(meeting_session):
    """创建会议协调器"""
    coordinator = MeetingCoordinator(
        meeting_session=meeting_session,
        provider="deepseek",
        model_name="deepseek-chat",
        api_key="test-key",
        base_url="",
    )
    return coordinator


@pytest.mark.asyncio
async def test_detect_complex_task(meeting_coordinator):
    """测试复杂任务检测"""
    analyzer = meeting_coordinator._semantic_analyzer
    # 测试多步骤任务
    assert analyzer._detect_complex_task("首先设计数据库，然后实现API，最后测试") == True

    # 测试多部门协作
    assert analyzer._detect_complex_task("前端和后端和测试一起做") == True

    # 测试依赖关系
    assert analyzer._detect_complex_task("完成后开始下一步") == True

    # 测试简单任务
    assert analyzer._detect_complex_task("帮我写一个函数") == False


@pytest.mark.asyncio
async def test_generate_workflow_definition(meeting_coordinator):
    """测试工作流定义生成"""
    analyzer = meeting_coordinator._semantic_analyzer
    # 模拟路由决策
    class MockRoutingDecision:
        selected_dept = "dept-frontend"
        confidence = 0.8
        reason = "测试"

    routing_decision = MockRoutingDecision()

    # 测试生成工作流定义
    workflow_def = analyzer._generate_workflow_definition(
        "前端和后端一起开发",
        routing_decision,
    )

    assert workflow_def.workflow_id is not None
    assert len(workflow_def.nodes) >= 2
    assert workflow_def.execution_strategy == "mixed"


@pytest.mark.asyncio
async def test_semantic_analyze_workflow(meeting_coordinator):
    """测试语义分析工作流模式"""
    # 测试复杂任务识别
    result = await meeting_coordinator.semantic_analyze("首先设计数据库，然后实现API，最后测试")

    assert result.is_task == True
    assert result.is_workflow == True
    assert result.workflow_definition is not None
    assert len(result.workflow_definition.nodes) >= 2


@pytest.mark.asyncio
async def test_workflow_engine_integration(meeting_coordinator):
    """测试WorkflowEngine集成"""
    # 创建简单的工作流定义
    nodes = [
        WorkflowNode(
            node_id="node-1",
            task_description="测试任务",
            dept_id="dept-frontend",
            status=WorkflowNodeStatus.PENDING,
        ),
    ]

    workflow_def = WorkflowDefinition(
        workflow_id="test-workflow",
        name="测试工作流",
        description="测试",
        nodes=nodes,
        edges=[],
        execution_strategy="sequential",
    )

    # 测试工作流执行
    async def mock_on_message(agent_id, content, delta):
        pass

    result = await meeting_coordinator._execute_workflow(workflow_def, mock_on_message)

    assert "execution_id" in result
    assert "status" in result
    assert result["status"] in ["completed", "failed"]


@pytest.mark.asyncio
async def test_process_user_message_workflow(meeting_coordinator):
    """测试处理用户消息工作流模式"""
    async def mock_on_message(agent_id, content, delta):
        pass

    # 测试复杂任务处理
    result = await meeting_coordinator.process_user_message(
        "首先设计数据库，然后实现API，最后测试",
        mock_on_message,
    )

    assert result["type"] == "workflow_executed"
    assert "workflow_result" in result


def test_workflow_engine_setup(meeting_coordinator):
    """测试WorkflowEngine设置"""
    assert meeting_coordinator.workflow_engine is not None
    assert hasattr(meeting_coordinator.workflow_engine, '_node_executors')
    assert len(meeting_coordinator.workflow_engine._node_executors) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])