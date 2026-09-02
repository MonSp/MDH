"""工作流集成测试"""

import asyncio
import os
import sys
import types

import pytest

# 添加backend目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator
from protocol import (
    AgentRole,
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowNode,
    WorkflowNodeStatus,
)


class MockRoutingDecision:
    """模拟路由决策（支持构造器传 selected_dept）"""

    def __init__(self, selected_dept="dept-frontend", confidence=0.8, reason="测试"):
        self.selected_dept = selected_dept
        self.confidence = confidence
        self.reason = reason


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
    # 复用模块级 MockRoutingDecision（默认 dept-frontend）
    routing_decision = MockRoutingDecision()

    # 测试生成工作流定义
    workflow_def = await analyzer._generate_workflow_definition(
        "前端和后端一起开发",
        routing_decision,
    )

    assert workflow_def.workflow_id is not None
    assert len(workflow_def.nodes) >= 2
    assert workflow_def.execution_strategy == "parallel"


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

    from protocol import WorkflowDefinition, WorkflowNode
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
            return types.SimpleNamespace(
                content=[{"type": "text", "text": "```out.txt\nhello workflow\n```\n完成。"}]
            )

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


def test_extract_tool_calls_skips_stray_brace(meeting_coordinator):
    """散落/未闭合的大括号不吞掉后续有效工具调用"""
    text = '这里有 { 一个未闭合括号，然后 {"tool": "read_file", "arguments": {"path": "p"}} 收尾。'
    calls = meeting_coordinator._extract_tool_calls_from_text(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "read_file"


def test_extract_tool_calls_skips_brace_paired_with_tool_json(meeting_coordinator):
    """散落 { 与有效工具 JSON 的 } 误配对导致 json.loads 失败时不吞掉有效调用"""
    text = '前言 { 散落括号 {"tool": "read_file", "arguments": {"path": "p"}}} 收尾。'
    calls = meeting_coordinator._extract_tool_calls_from_text(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "read_file"


@pytest.mark.asyncio
async def test_run_agent_execution_loop_no_tool_no_blocks(meeting_coordinator):
    """无工具无代码块时返回纯文本结果（不崩溃）"""
    class FakeModel:
        async def reply(self, conversation):
            return types.SimpleNamespace(
                content=[{"type": "text", "text": "方案完成。"}]
            )

    result = await meeting_coordinator._run_agent_execution_loop(FakeModel(), "请执行", None)
    assert result["result"] == "方案完成。"
    assert result["files_written"] == []


@pytest.mark.asyncio
async def test_generate_workflow_definition_parallel_batch():
    """前端+后端节点无依赖边（可并行），策略为 parallel"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = await analyzer._generate_workflow_definition("前端和后端一起开发", MockRoutingDecision(selected_dept="dept-frontend"))
    depts = [n.dept_id for n in wf.nodes]
    assert "dept-frontend" in depts and "dept-backend" in depts
    edge_pairs = {(e.source_node_id, e.target_node_id) for e in wf.edges}
    by_dept = {n.node_id: n.dept_id for n in wf.nodes}
    for src, tgt in edge_pairs:
        assert not ({by_dept[src], by_dept[tgt]} <= {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"})
    assert wf.execution_strategy == "parallel"


@pytest.mark.asyncio
async def test_generate_workflow_definition_qa_depends_on_impl():
    """qa 节点依赖所有实现类节点"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = await analyzer._generate_workflow_definition("前端和后端以及测试", MockRoutingDecision(selected_dept="dept-frontend"))
    by_dept = {n.node_id: n.dept_id for n in wf.nodes}
    qa_ids = [nid for nid, d in by_dept.items() if d == "dept-qa"]
    impl_ids = [nid for nid, d in by_dept.items() if d in {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"}]
    assert qa_ids and impl_ids
    incoming = {e.source_node_id for e in wf.edges if e.target_node_id == qa_ids[0]}
    assert set(impl_ids) <= incoming


@pytest.mark.asyncio
async def test_generate_workflow_definition_single_node_sequential():
    """单节点工作流策略为 sequential"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = await analyzer._generate_workflow_definition("优化数据库查询", MockRoutingDecision(selected_dept="dept-backend"))
    assert len(wf.nodes) == 1
    assert wf.execution_strategy == "sequential"


@pytest.mark.asyncio
async def test_generate_workflow_definition_devops_depends_on_impl():
    """devops 节点依赖实现类节点"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = await analyzer._generate_workflow_definition("前端和部署", MockRoutingDecision(selected_dept="dept-frontend"))
    by_dept = {n.node_id: n.dept_id for n in wf.nodes}
    devops_ids = [nid for nid, d in by_dept.items() if d == "dept-devops"]
    impl_ids = [nid for nid, d in by_dept.items() if d in {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"}]
    assert devops_ids and impl_ids
    incoming = {e.source_node_id for e in wf.edges if e.target_node_id == devops_ids[0]}
    assert set(impl_ids) <= incoming
    assert wf.execution_strategy == "sequential"


@pytest.mark.asyncio
async def test_generate_workflow_definition_qa_devops_chain():
    """测试+部署：qa→devops 依赖链，策略 sequential"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = await analyzer._generate_workflow_definition("测试和部署", MockRoutingDecision(selected_dept="dept-qa"))
    by_dept = {n.node_id: n.dept_id for n in wf.nodes}
    qa_ids = [nid for nid, d in by_dept.items() if d == "dept-qa"]
    devops_ids = [nid for nid, d in by_dept.items() if d == "dept-devops"]
    assert qa_ids and devops_ids
    assert any(e.source_node_id == qa_ids[0] and e.target_node_id == devops_ids[0] for e in wf.edges)
    assert wf.execution_strategy == "sequential"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
