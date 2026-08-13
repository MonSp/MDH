"""工作流集成测试"""

import asyncio
import pytest
import sys
import os

# 添加backend目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from agentscope.message import Msg

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


@pytest.mark.asyncio
async def test_meeting_coordinator_accepts_injected_engine(meeting_coordinator):
    """MeetingCoordinator 支持注入外部共享引擎"""
    from workflow_engine import WorkflowEngine
    shared = WorkflowEngine()
    coordinator = meeting_coordinator
    from meeting_coordinator import MeetingCoordinator
    injected = MeetingCoordinator(
        meeting_session=coordinator.meeting,
        provider=coordinator.provider,
        model_name=coordinator.model_name,
        api_key=coordinator.api_key,
        base_url=coordinator.base_url or "",
        workflow_engine=shared,
    )
    assert injected.workflow_engine is shared


@pytest.mark.asyncio
async def test_execute_workflow_returns_cancelled_on_pause(meeting_coordinator):
    """会议路径工作流被暂停时 _execute_workflow 返回 paused 状态"""
    coordinator = meeting_coordinator

    async def slow_executor(node, input_data):
        await asyncio.sleep(30)
        return {"result": "done"}

    for dept in ("dept-frontend", "dept-backend", "dept-qa"):
        coordinator.workflow_engine.register_node_executor(dept, slow_executor)

    from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge
    wf = WorkflowDefinition(
        workflow_id="pause-test", name="暂停测试", description="",
        nodes=[
            WorkflowNode(node_id="n1", task_description="t1", dept_id="dept-frontend"),
            WorkflowNode(node_id="n2", task_description="t2", dept_id="dept-backend"),
        ],
        edges=[WorkflowEdge(source_node_id="n1", target_node_id="n2")],
    )

    async def on_msg(agent_id, content, kind):
        return None

    async def run():
        return await coordinator._execute_workflow(wf, on_msg)

    runner = asyncio.create_task(run())
    await asyncio.sleep(0.2)
    # 通过引擎暂停（fixture 协调器为本地自建引擎，暂停可取消运行中的任务）
    exec_id = coordinator.workflow_engine._definitions.get("pause-test")
    executions = [e for e in coordinator.workflow_engine._executions.values()]
    execution = executions[0] if executions else None
    assert execution is not None, "工作流未启动"
    await coordinator.workflow_engine.pause_workflow(execution.execution_id)
    result = await runner
    assert result["status"] == "paused"


@pytest.mark.asyncio
async def test_run_agent_execution_loop_writes_code_block(meeting_coordinator, tmp_path):
    """执行循环把 LLM 输出的代码块写入工作区文件"""
    from agent_toolset import create_agent_toolset
    toolset = create_agent_toolset(
        agent_id="node-1", agent_role="executor", workspace_root=str(tmp_path)
    )

    class FakeModel:
        async def reply(self, conversation):
            return Msg(name="assistant", role="assistant",
                       content=[{"type": "text", "text": "```out.txt\nhello workflow\n```\n完成。"}])

    result = await meeting_coordinator._run_agent_execution_loop(
        FakeModel(), "请执行任务", toolset
    )
    assert "out.txt" in result["files_written"]
    assert (tmp_path / "out.txt").read_text() == "hello workflow"


def test_extract_tool_calls_from_text(meeting_coordinator):
    """从 LLM 文本提取工具调用 JSON"""
    text = '先做 A，然后 {"tool": "write_file", "arguments": {"path": "a.txt", "content": "1"}} 再收尾。'
    calls = meeting_coordinator._extract_tool_calls_from_text(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "write_file"


@pytest.mark.asyncio
async def test_run_agent_execution_loop_no_tool_no_blocks(meeting_coordinator):
    """无工具无代码块时返回纯文本结果（不崩溃）"""
    class FakeModel:
        async def reply(self, conversation):
            return Msg(name="assistant", role="assistant",
                       content=[{"type": "text", "text": "方案完成。"}])

    result = await meeting_coordinator._run_agent_execution_loop(FakeModel(), "请执行", None)
    assert result["result"] == "方案完成。"
    assert result["files_written"] == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])