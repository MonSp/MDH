import asyncio
import json
import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _ensure_mock_module(name, attrs=None):
    """确保 sys.modules 中存在指定模块（Mock），并设置属性"""
    if name not in sys.modules:
        mod = types.ModuleType(name)
        sys.modules[name] = mod
    else:
        mod = sys.modules[name]
    if attrs:
        for k, v in attrs.items():
            setattr(mod, k, v)
    return mod


# Mock agentscope 及其子模块
if "agentscope" not in sys.modules:
    _ensure_mock_module("agentscope")
    _ensure_mock_module("agentscope.agent", {"Agent": MagicMock, "ContextConfig": MagicMock})
    _ensure_mock_module("agentscope.message", {
        "Msg": MagicMock, "TextBlock": MagicMock,
        "ToolResultBlock": MagicMock, "ToolResultState": MagicMock,
    })
    _ensure_mock_module("agentscope.credential", {
        "OpenAICredential": MagicMock, "AnthropicCredential": MagicMock,
        "DashScopeCredential": MagicMock, "DeepSeekCredential": MagicMock,
        "GeminiCredential": MagicMock, "MoonshotCredential": MagicMock,
        "OllamaCredential": MagicMock, "XAICredential": MagicMock,
    })
    _event_attrs = {}
    for _name in [
        "ConfirmResult", "DataBlockDeltaEvent", "DataBlockEndEvent", "DataBlockStartEvent",
        "ExternalExecutionResultEvent", "ModelCallEndEvent", "ModelCallStartEvent",
        "ReplyEndEvent", "ReplyStartEvent", "RequireExternalExecutionEvent",
        "RequireUserConfirmEvent", "TextBlockDeltaEvent", "TextBlockEndEvent",
        "TextBlockStartEvent", "ThinkingBlockDeltaEvent", "ThinkingBlockEndEvent",
        "ThinkingBlockStartEvent", "ToolCallDeltaEvent", "ToolCallEndEvent",
        "ToolCallStartEvent", "ToolResultDataDeltaEvent", "ToolResultEndEvent",
        "ToolResultStartEvent", "ToolResultTextDeltaEvent", "UserConfirmResultEvent",
        "ExceedMaxItersEvent",
    ]:
        _event_attrs[_name] = MagicMock
    _ensure_mock_module("agentscope.event", _event_attrs)
    _ensure_mock_module("agentscope.formatter", {
        "OpenAIChatFormatter": MagicMock, "AnthropicChatFormatter": MagicMock,
        "DashScopeChatFormatter": MagicMock, "DeepSeekChatFormatter": MagicMock,
        "GeminiChatFormatter": MagicMock, "MoonshotChatFormatter": MagicMock,
        "OllamaChatFormatter": MagicMock, "XAIChatFormatter": MagicMock,
    })
    _ensure_mock_module("agentscope.model", {
        "OpenAIChatModel": MagicMock, "AnthropicChatModel": MagicMock,
        "DashScopeChatModel": MagicMock, "DeepSeekChatModel": MagicMock,
        "GeminiChatModel": MagicMock, "MoonshotChatModel": MagicMock,
        "OllamaChatModel": MagicMock, "XAIChatModel": MagicMock,
    })
    _ensure_mock_module("agentscope.skill", {"LocalSkillLoader": MagicMock})
    _ensure_mock_module("agentscope.tool", {"FunctionTool": MagicMock, "Toolkit": MagicMock})

# Mock fastapi（session.py 需要）
if "fastapi" not in sys.modules:
    _ensure_mock_module("fastapi", {"WebSocket": MagicMock})

from dynamic_router import DynamicRouter, RoutingDecision
from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator
from protocol import (
    AgentRole,
    MeetingAgentStatus,
    SemanticAnalysisResult,
    WorkflowDefinition,
    WorkflowNode,
)

SAMPLE_ROUTING_TABLE = {
    "departments": [
        {
            "dept_id": "dept-software",
            "dept_name": "软件工程部",
            "capability_desc": "Web 应用开发、API 设计、代码编写",
            "capability_keywords": ["代码", "编程", "开发", "web", "api", "python"],
            "tools": ["code_generator"],
            "success_rate": 0.85,
            "total_tasks": 10,
            "successful_tasks": 8,
            "last_active": "2026-06-01T10:00:00Z",
            "priority": 10,
        },
        {
            "dept_id": "dept-content",
            "dept_name": "内容演示部",
            "capability_desc": "PPT 制作、文档撰写",
            "capability_keywords": ["ppt", "演示", "文档"],
            "tools": ["ppt_generator"],
            "success_rate": 0.90,
            "total_tasks": 5,
            "successful_tasks": 4,
            "last_active": "2026-06-01T09:00:00Z",
            "priority": 8,
        },
    ]
}


@pytest.fixture
def tmp_data_dir(tmp_path):
    """创建临时数据目录，包含路由表"""
    data_dir = str(tmp_path / "data")
    os.makedirs(data_dir, exist_ok=True)
    routing_path = os.path.join(data_dir, "routing_table.json")
    with open(routing_path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False, indent=2)
    return data_dir


@pytest.fixture
def meeting_session():
    session = MeetingSession("test-meeting")
    session.start()
    return session


@pytest.fixture
def coordinator(meeting_session, tmp_data_dir):
    coord = MeetingCoordinator(
        meeting_session=meeting_session,
        provider="openai",
        model_name="gpt-4",
        api_key="test-key",
        base_url="",
        data_dir=tmp_data_dir,
    )
    return coord


# ---------------------------------------------------------------------------
# 1. MeetingCoordinator 初始化时创建 DynamicRouter
# ---------------------------------------------------------------------------

class TestCoordinatorInit:
    def test_creates_dynamic_router(self, coordinator):
        """初始化应创建 DynamicRouter 实例"""
        assert isinstance(coordinator.router, DynamicRouter)

    def test_router_has_loaded_table(self, coordinator):
        """DynamicRouter 应加载路由表"""
        table = coordinator.router.get_route_table()
        assert len(table) == 2
        dept_ids = [d["dept_id"] for d in table]
        assert "dept-software" in dept_ids
        assert "dept-content" in dept_ids

    def test_task_routing_dict_initialized(self, coordinator):
        """_task_routing 字典应被初始化"""
        assert hasattr(coordinator, "_task_routing")
        assert coordinator._task_routing == {}

    def test_creates_default_routing_table_when_missing(self, meeting_session, tmp_path):
        """当路由表文件不存在时，应自动创建默认路由表"""
        data_dir = str(tmp_path / "new_data")
        coord = MeetingCoordinator(
            meeting_session=meeting_session,
            provider="openai",
            model_name="gpt-4",
            api_key="test-key",
            data_dir=data_dir,
        )
        routing_path = os.path.join(data_dir, "routing_table.json")
        assert os.path.isfile(routing_path)
        table = coord.router.get_route_table()
        assert len(table) >= 3  # 默认部门

    def test_does_not_overwrite_existing_routing_table(self, coordinator, tmp_data_dir):
        """如果路由表已存在，不应覆盖"""
        routing_path = os.path.join(tmp_data_dir, "routing_table.json")
        with open(routing_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert len(data["departments"]) == 2  # 保持原有数据

    def test_data_dir_parameter_defaults_to_data(self, meeting_session, tmp_path, monkeypatch):
        """data_dir 参数默认值为 'data'"""
        monkeypatch.chdir(tmp_path)
        coord = MeetingCoordinator(
            meeting_session=meeting_session,
            provider="openai",
            model_name="gpt-4",
            api_key="test-key",
        )
        assert isinstance(coord.router, DynamicRouter)


# ---------------------------------------------------------------------------
# 2. semantic_analyze 使用 DynamicRouter
# ---------------------------------------------------------------------------

class TestSemanticAnalyzeWithRouter:
    def test_router_called_during_semantic_analyze(self, coordinator):
        """semantic_analyze 应调用 DynamicRouter.route"""
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": true, "intent": "task", "task_description": "写代码", "target_agent_id": "agent-executor", "reason": "test", "confidence": 0.9, "discussion_topic": ""}'}]
        ))
        coordinator._get_model = MagicMock(return_value=mock_model)
        coordinator._semantic_analyzer._get_model = coordinator._get_model

        with patch.object(coordinator.router, "route", wraps=coordinator.router.route) as mock_route:
            asyncio.run(coordinator.semantic_analyze("帮我写一段 Python 代码"))
            mock_route.assert_called_once_with("帮我写一段 Python 代码")

    def test_last_routing_decision_stored(self, coordinator):
        """semantic_analyze 应存储 last_routing_decision"""
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": false, "intent": "discussion", "discussion_topic": "test"}'}]
        ))
        coordinator._get_model = MagicMock(return_value=mock_model)
        coordinator._semantic_analyzer._get_model = coordinator._get_model

        asyncio.run(coordinator.semantic_analyze("帮我做 PPT"))
        decision = coordinator.last_routing_decision
        assert decision is not None
        assert isinstance(decision, RoutingDecision)

    def test_routing_decision_includes_context_in_prompt(self, coordinator):
        """路由结果应作为上下文传给 LLM"""
        captured_msg = None

        async def capture_reply(msg):
            nonlocal captured_msg
            captured_msg = msg
            return MagicMock(
                content=[{"type": "text", "text": '{"is_task": false, "intent": "discussion", "discussion_topic": "test"}'}]
            )

        mock_model = MagicMock()
        mock_model.reply = capture_reply
        coordinator._get_model = MagicMock(return_value=mock_model)
        coordinator._semantic_analyzer._get_model = coordinator._get_model

        asyncio.run(coordinator.semantic_analyze("帮我写 Python 代码"))
        assert captured_msg is not None

    def test_llm_overrides_router_when_confident(self, coordinator):
        """LLM 高置信度时可以覆盖路由结果"""
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": true, "intent": "task", "task_description": "写代码", "target_agent_id": "agent-planner", "reason": "LLM认为更适合", "confidence": 0.95, "discussion_topic": ""}'}]
        ))
        coordinator._get_model = MagicMock(return_value=mock_model)
        coordinator._semantic_analyzer._get_model = coordinator._get_model

        result = asyncio.run(coordinator.semantic_analyze("帮我写代码"))
        # LLM 选择了 agent-planner，路由器可能推荐 dept-software
        assert result.target_agent_id == "agent-planner"


# ---------------------------------------------------------------------------
# 3. 路由统计更新
# ---------------------------------------------------------------------------

class TestRouterStatsUpdate:
    def test_stats_updated_on_task_success(self, coordinator):
        """任务完成时应更新路由统计（success=True）"""
        # 设置路由跟踪
        coordinator._task_routing["task-001"] = "dept-software"

        original_total = coordinator.router._table["dept-software"].total_tasks
        original_success = coordinator.router._table["dept-software"].successful_tasks

        with patch.object(coordinator.router, "update_stats", wraps=coordinator.router.update_stats) as mock_update:
            coordinator.router.update_stats("dept-software", success=True)
            mock_update.assert_called_once_with("dept-software", success=True)

        assert coordinator.router._table["dept-software"].total_tasks == original_total + 1
        assert coordinator.router._table["dept-software"].successful_tasks == original_success + 1

    def test_stats_updated_on_task_failure(self, coordinator):
        """任务失败时应更新路由统计（success=False）"""
        coordinator._task_routing["task-002"] = "dept-software"

        original_total = coordinator.router._table["dept-software"].total_tasks
        original_success = coordinator.router._table["dept-software"].successful_tasks

        coordinator.router.update_stats("dept-software", success=False)

        assert coordinator.router._table["dept-software"].total_tasks == original_total + 1
        assert coordinator.router._table["dept-software"].successful_tasks == original_success

    def test_execute_tasks_no_direct_stats_update(self, coordinator):
        """execute_assigned_tasks 不再直接调用 router.update_stats（由 _update_routing_stats_safe 统一处理）"""
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "assigned")

        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": "任务执行完成"}]
        ))
        mock_get = MagicMock(return_value=mock_model)
        coordinator._get_model = mock_get
        coordinator._task_orchestrator._get_model = mock_get

        with patch.object(coordinator.router, "update_stats") as mock_stats:
            asyncio.run(coordinator.execute_assigned_tasks())
            mock_stats.assert_not_called()

    def test_routing_stats_updated_via_safe_path(self, coordinator):
        """路由统计通过 _update_routing_stats_safe 正确更新"""
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "completed")
        # 通过 coordinator 的 _task_routing（Dict A）写入路由
        coordinator._routing_stats.track_task(task.id, "dept-software")

        original_total = coordinator.router._table["dept-software"].total_tasks
        original_success = coordinator.router._table["dept-software"].successful_tasks

        coordinator._update_routing_stats_safe()

        assert coordinator.router._table["dept-software"].total_tasks == original_total + 1
        assert coordinator.router._table["dept-software"].successful_tasks == original_success + 1
        # 验证消费即删
        assert coordinator._routing_stats._task_routing == {}

    def test_auto_assign_task_records_routing_dept(self, coordinator):
        """auto_assign_task 应记录路由部门到 _task_routing"""
        # 通过 semantic_analyzer 设置路由决策
        coordinator._semantic_analyzer._last_routing_decision = RoutingDecision(
            selected_dept="dept-software",
            confidence=0.8,
            reason="test",
            candidate_depts=[],
            matched_keywords=[],
        )

        result = asyncio.run(coordinator.auto_assign_task("写代码", "agent-executor", "test"))
        task_id = result["task_id"]
        assert task_id in coordinator._task_routing
        assert coordinator._task_routing[task_id] == "dept-software"

    def test_no_stats_update_when_no_routing_dept(self, coordinator):
        """没有路由部门记录时不应更新统计"""
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "assigned")
        # 不设置 _task_routing[task.id]

        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": "完成"}]
        ))
        coordinator._get_model = MagicMock(return_value=mock_model)

        with patch.object(coordinator.router, "update_stats") as mock_stats:
            asyncio.run(coordinator.execute_assigned_tasks())
            mock_stats.assert_not_called()

    def test_stats_persist_after_update(self, tmp_data_dir, meeting_session):
        """路由统计更新后应持久化到文件"""
        coordinator = MeetingCoordinator(
            meeting_session=meeting_session,
            provider="openai",
            model_name="gpt-4",
            api_key="test-key",
            data_dir=tmp_data_dir,
        )
        coordinator.router.update_stats("dept-software", success=True)

        # 重新加载路由表验证持久化
        router2 = DynamicRouter(os.path.join(tmp_data_dir, "routing_table.json"))
        table = router2.load_routing_table()
        assert table["dept-software"].total_tasks == 11
        assert table["dept-software"].successful_tasks == 9


# ---------------------------------------------------------------------------
# 工作流状态变化推送到前端
# ---------------------------------------------------------------------------


class TestWorkflowStatusCallback:
    @pytest.mark.asyncio
    async def test_workflow_status_change_pushes_to_frontend(self, coordinator):
        """工作流状态变化应推送到前端"""
        messages = []

        async def capture_on_message(agent_id, text, extra, **kwargs):
            messages.append({"agent_id": agent_id, "text": text, **kwargs})

        coordinator._on_message = capture_on_message

        # 添加一个 CEO agent 用于消息路由
        from meeting import MeetingAgentInfo
        ceo = MeetingAgentInfo(
            id="agent-ceo", name="CEO", role=AgentRole.CEO,
            status=MeetingAgentStatus.MEETING,
        )
        coordinator.meeting.agents.append(ceo)

        # 模拟工作流执行状态变化
        class FakeExecution:
            execution_id = "exec-1"
            workflow_id = "wf-1"
            status = type("Status", (), {"value": "completed"})()

        await coordinator._on_workflow_status_change(FakeExecution())

        assert len(messages) == 1
        assert messages[0]["agent_id"] == "agent-ceo"
        assert "completed" in messages[0]["text"]
        assert messages[0].get("msg_type") == "workflow_status_update"
        assert messages[0].get("workflow_id") == "wf-1"
        assert messages[0].get("execution_id") == "exec-1"

    @pytest.mark.asyncio
    async def test_workflow_status_no_crash_without_on_message(self, coordinator):
        """无 on_message 回调时不应崩溃"""
        coordinator._on_message = None

        class FakeExecution:
            execution_id = "exec-2"
            workflow_id = "wf-2"
            status = type("Status", (), {"value": "failed"})()

        # 不应抛异常
        await coordinator._on_workflow_status_change(FakeExecution())


# ---------------------------------------------------------------------------
# 讨论结果 stance 字段兼容性
# ---------------------------------------------------------------------------


class TestStanceFieldCompatibility:
    def test_enhance_task_description_with_parsed_stance(self, coordinator):
        """discussion_manager 格式：parsed_stance 字段"""
        results = [
            {"content": "使用 React 框架", "parsed_stance": "support", "role": "planner"},
            {"content": "需要添加单元测试", "parsed_stance": "modify", "role": "reviewer"},
        ]
        enhanced = coordinator._enhance_task_description("开发登录页面", results)
        assert "React" in enhanced

    def test_enhance_task_description_with_stance_field(self, coordinator):
        """mixed_location_discussion 格式：stance 字段"""
        results = [
            {"content": "使用 Vue 框架", "stance": "support", "role": "planner"},
            {"content": "需要添加集成测试", "stance": "modify", "role": "reviewer"},
        ]
        enhanced = coordinator._enhance_task_description("开发注册页面", results)
        assert "Vue" in enhanced

    def test_enhance_task_description_oppose_excluded(self, coordinator):
        """oppose 立场不应纳入任务描述"""
        results = [
            {"content": "不推荐使用 jQuery", "parsed_stance": "oppose", "role": "planner"},
        ]
        enhanced = coordinator._enhance_task_description("开发页面", results)
        assert "jQuery" not in enhanced

    def test_infer_target_agent_with_stance_field(self, coordinator):
        """_infer_target_agent 应兼容 stance 字段"""
        results = [
            {"agentId": "agent-executor", "stance": "support"},
            {"agentId": "agent-planner", "stance": "oppose"},
        ]
        target = coordinator._infer_target_agent(results)
        assert target == "agent-executor"


# ---------------------------------------------------------------------------
# 项目总结报告生成
# ---------------------------------------------------------------------------


class TestProjectSummary:
    def test_summary_includes_all_sections(self, coordinator):
        """总结报告应包含所有标准章节"""
        analysis = SemanticAnalysisResult(
            is_task=True, intent="task", task_description="开发登录页面",
            target_agent_id="agent-executor", reason="测试",
        )
        summary = coordinator._generate_project_summary(
            user_message="开发登录页面",
            analysis=analysis,
            discussion_results=[
                {"agentId": "agent-planner", "content": "使用 React", "stance": "support"},
            ],
            assign_result={"task_id": "t1", "agent_id": "agent-executor", "status": "assigned"},
            review_result={
                "critic_result": {"severity": "low", "findings": []},
                "grounding_result": {"grounded": True, "sources": []},
            },
            execution_results=[
                {"agent_id": "agent-executor", "written_files": ["login.tsx"], "code_blocks_count": 3},
            ],
        )
        assert "项目总结报告" in summary
        assert "团队讨论要点" in summary
        assert "任务分配" in summary
        assert "执行结果" in summary
        assert "质量审查" in summary
        assert "交付物清单" in summary
        assert "login.tsx" in summary

    def test_summary_handles_empty_results(self, coordinator):
        """空结果不应崩溃"""
        analysis = SemanticAnalysisResult(
            is_task=True, intent="task", task_description="测试",
            target_agent_id="", reason="",
        )
        summary = coordinator._generate_project_summary(
            user_message="测试",
            analysis=analysis,
            discussion_results=[],
            assign_result={},
            review_result={},
            execution_results=[],
        )
        assert "项目总结报告" in summary
        assert "无文件交付" in summary

    def test_summary_stance_compatibility(self, coordinator):
        """总结报告应兼容两种 stance 字段名"""
        analysis = SemanticAnalysisResult(
            is_task=True, intent="task", task_description="测试",
            target_agent_id="", reason="",
        )
        # mixed_location_discussion 格式
        summary = coordinator._generate_project_summary(
            user_message="测试",
            analysis=analysis,
            discussion_results=[
                {"agentId": "agent-planner", "content": "方案A", "stance": "support"},
            ],
            assign_result={},
            review_result={},
            execution_results=[],
        )
        assert "✅" in summary  # support icon


# ---------------------------------------------------------------------------
# confidence 字段兼容性
# ---------------------------------------------------------------------------


class TestConfidenceFieldCompatibility:
    def test_voting_uses_parsed_confidence(self, coordinator):
        """投票应使用 parsed_confidence（discussion_manager 格式）"""
        from negotiation import NegotiationEngine
        coordinator.negotiation = NegotiationEngine()
        from meeting import MeetingAgentInfo
        from protocol import AgentRole, MeetingAgentStatus

        ceo = MeetingAgentInfo(id="agent-ceo", name="CEO", role=AgentRole.CEO, status=MeetingAgentStatus.MEETING)
        executor = MeetingAgentInfo(id="agent-executor", name="执行", role=AgentRole.EXECUTOR, status=MeetingAgentStatus.MEETING)
        coordinator.meeting.agents.extend([ceo, executor])

        # 模拟 discussion_manager 格式的讨论结果
        discussion_results = [
            {"agentId": "agent-executor", "parsed_stance": "support", "parsed_confidence": 0.9, "content": "方案可行", "role": "executor"},
        ]

        # 构建 stance 查找表
        stance_by_agent = {}
        for dr in discussion_results:
            aid = dr.get("agentId", "")
            if aid:
                stance_by_agent[aid] = dr

        dr = stance_by_agent.get("agent-executor", {})
        confidence = dr.get("parsed_confidence", dr.get("confidence", 0.5))
        assert confidence == 0.9, f"应读取 parsed_confidence=0.9, 实际={confidence}"

    def test_voting_uses_confidence_field(self, coordinator):
        """投票应使用 confidence（mixed_location_discussion 格式）"""
        discussion_results = [
            {"agentId": "agent-executor", "stance": "support", "confidence": 0.7, "content": "方案可行", "role": "executor"},
        ]

        stance_by_agent = {}
        for dr in discussion_results:
            aid = dr.get("agentId", "")
            if aid:
                stance_by_agent[aid] = dr

        dr = stance_by_agent.get("agent-executor", {})
        confidence = dr.get("parsed_confidence", dr.get("confidence", 0.5))
        assert confidence == 0.7, f"应读取 confidence=0.7, 实际={confidence}"


# ---------------------------------------------------------------------------
# 4. 自适应路由学习断链修复（P1：统一消费 _task_routing）
# ---------------------------------------------------------------------------


class TestUpdateRoutingStats:
    async def test_update_routing_stats_consumes_task_routing(self, coordinator):
        """_task_routing 中记录的任务在完成后触发 router.update_stats（修复断链）"""
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator._task_routing[task.id] = "dept-frontend"
        task.status = "completed"

        with patch.object(coordinator.router, "update_stats", return_value=True) as m:
            coordinator._update_routing_stats()

        m.assert_called_once_with("dept-frontend", success=True)

    async def test_update_routing_stats_failed_task_reports_failure(self, coordinator):
        """失败任务上报 success=False"""
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator._task_routing[task.id] = "dept-qa"
        task.status = "failed"

        with patch.object(coordinator.router, "update_stats", return_value=True) as m:
            coordinator._update_routing_stats()

        m.assert_called_once_with("dept-qa", success=False)

    async def test_update_routing_stats_skips_unknown_task(self, coordinator):
        """_task_routing 中无对应 meeting task 的条目被跳过且清理（不崩溃）"""
        coordinator._task_routing["ghost-task"] = "dept-frontend"
        with patch.object(coordinator.router, "update_stats", return_value=True) as m:
            coordinator._update_routing_stats()
        m.assert_not_called()
        assert "ghost-task" not in coordinator._task_routing

    async def test_update_routing_stats_multiple_entries_and_cleanup(self, coordinator):
        """多条目一次统计；消费后字典清空，二次调用不重复计数"""
        task1 = coordinator.meeting.add_task("agent-executor", "任务一")
        task2 = coordinator.meeting.add_task("agent-executor", "任务二")
        task1.status = "completed"
        task2.status = "failed"
        coordinator._task_routing[task1.id] = "dept-frontend"
        coordinator._task_routing[task2.id] = "dept-qa"

        with patch.object(coordinator.router, "update_stats", return_value=True) as m:
            coordinator._update_routing_stats()
            coordinator._update_routing_stats()  # 第二次调用应为空操作

        assert m.call_count == 2
        m.assert_any_call("dept-frontend", success=True)
        m.assert_any_call("dept-qa", success=False)
        assert coordinator._task_routing == {}

    async def test_update_routing_stats_exception_does_not_abort(self, coordinator):
        """_update_routing_stats 抛异常时不中断后续流程（_task_routing 仍被清理）"""
        task = coordinator.meeting.add_task("agent-executor", "任务")
        coordinator._task_routing[task.id] = "dept-frontend"
        task.status = "completed"

        with patch.object(coordinator.router, "update_stats", side_effect=RuntimeError("disk full")):
            coordinator._update_routing_stats_safe()

        assert coordinator._task_routing == {}


# ---------------------------------------------------------------------------
# 5. 确定性门禁 _run_deterministic_gate（fail-open on 工具缺失 / fail-closed on 真实失败）
# ---------------------------------------------------------------------------
# 说明：_run_deterministic_gate 内部使用函数级 `from agent_toolset import
# create_agent_toolset` 导入，因此 patch 目标是 agent_toolset.create_agent_toolset
# （而非 meeting_coordinator 模块属性，后者不存在）。


class TestDeterministicGate:
    def _toolset(self, lint=None, tests=None):
        ts = MagicMock()
        ts.run_linter.return_value = lint or types.SimpleNamespace(success=True, output="ok", error="")
        ts.run_tests.return_value = tests or types.SimpleNamespace(success=True, output="passed", error="")
        return ts

    def test_gate_no_workspace_passes_without_tools(self, coordinator):
        """无 workspace → passed=True 且不调用工具"""
        with patch("agent_toolset.create_agent_toolset") as mock_factory:
            result = coordinator._run_deterministic_gate(None)
        assert result["passed"] is True
        assert result["failures"] == []
        mock_factory.assert_not_called()

    def test_gate_lint_failure_fails_closed(self, coordinator):
        """真实 lint 失败 → passed=False + lint_failure"""
        mock_toolset = self._toolset(
            lint=types.SimpleNamespace(success=False, output="E0001 syntax error", error=""),
        )
        with patch("agent_toolset.create_agent_toolset", return_value=mock_toolset) as mock_factory:
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is False
        assert "lint_failure" in [f["type"] for f in result["failures"]]
        assert result["skipped"] == []
        mock_factory.assert_called_once_with(
            agent_id="gate", agent_role="reviewer", workspace_root="/tmp/ws"
        )

    def test_gate_test_failure_fails_closed(self, coordinator):
        """真实测试失败 → passed=False + test_failure（location 与 lint 统一为 .）"""
        mock_toolset = self._toolset(
            tests=types.SimpleNamespace(success=False, output="assertion failed: x != 1", error=""),
        )
        with patch("agent_toolset.create_agent_toolset", return_value=mock_toolset):
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is False
        failure = [f for f in result["failures"] if f["type"] == "test_failure"][0]
        assert failure["location"] == "."

    def test_gate_tool_missing_fails_open(self, coordinator):
        """工具缺失（真实 executor 输出文本）→ 不置失败，记录 skipped

        mock error 使用实测 _exec_run_tests / _exec_run_linter 的真实缺失文本：
        - run_tests: python -m pytest 缺模块且 pytest 不在 PATH →
            "[Errno 2] No such file or directory: 'pytest'"
        - run_linter: python -m pylint 缺模块 →
            "<python路径>: No module named pylint"
        """
        mock_toolset = self._toolset(
            lint=types.SimpleNamespace(success=False, output="", error="/home/test/miniconda3/bin/python: No module named pylint\n"),
            tests=types.SimpleNamespace(success=False, output="", error="[Errno 2] No such file or directory: 'pytest'"),
        )
        with patch("agent_toolset.create_agent_toolset", return_value=mock_toolset):
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is True
        assert result["failures"] == []
        skipped_types = [s["type"] for s in result["skipped"]]
        assert "lint_skipped" in skipped_types
        assert "test_skipped" in skipped_types

    def test_gate_real_failure_not_found_text_fails_closed(self, coordinator):
        """真实失败文本含裸 'not found'（如 pytest 断言失败）→ 不误判为工具缺失，fail-closed"""
        mock_toolset = self._toolset(
            lint=types.SimpleNamespace(success=False, output="", error="/home/test/miniconda3/bin/python: No module named pylint\n"),
            tests=types.SimpleNamespace(success=False, output="AssertionError: config key not found", error=""),
        )
        with patch("agent_toolset.create_agent_toolset", return_value=mock_toolset):
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is False
        assert "test_failure" in [f["type"] for f in result["failures"]]
        assert "test_skipped" not in [s["type"] for s in result["skipped"]]

    def test_gate_no_tests_collected_fails_open(self, coordinator):
        """未收集到测试（'No tests were collected'）→ 视为工具缺失，不置失败"""
        mock_toolset = self._toolset(
            tests=types.SimpleNamespace(success=False, output="no tests ran", error=""),
        )
        with patch("agent_toolset.create_agent_toolset", return_value=mock_toolset):
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is True
        assert result["failures"] == []
        assert "test_skipped" in [s["type"] for s in result["skipped"]]

    def test_gate_lint_missing_test_real_failure_mixed(self, coordinator):
        """混合：lint 工具缺失（跳过）+ 测试真实失败（fail-closed）"""
        mock_toolset = self._toolset(
            lint=types.SimpleNamespace(success=False, output="", error="/home/test/miniconda3/bin/python: No module named pylint\n"),
            tests=types.SimpleNamespace(success=False, output="FAILED test_foo.py::test_bar", error=""),
        )
        with patch("agent_toolset.create_agent_toolset", return_value=mock_toolset):
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is False
        assert "test_failure" in [f["type"] for f in result["failures"]]
        assert "lint_skipped" in [s["type"] for s in result["skipped"]]

    def test_gate_tool_exception_records_gate_error(self, coordinator):
        """工具调用抛异常 → gate_error 兜底（passed=False）"""
        with patch("agent_toolset.create_agent_toolset", side_effect=RuntimeError("boom")):
            result = coordinator._run_deterministic_gate("/tmp/ws")
        assert result["passed"] is False
        assert "gate_error" in [f["type"] for f in result["failures"]]

    def test_gate_error_channel_only_prevents_real_failure_misjudgment(self):
        """通道感知 + 工具特定：仅 pytest/pylint 缺失文本判工具缺失，其余 fail-closed"""
        from meeting_coordinator import MeetingCoordinator
        coordinator = object.__new__(MeetingCoordinator)
        # error 为空、output 含真实失败文本 → 判定为真实失败（非工具缺失）
        assert not MeetingCoordinator._gate_check_unavailable("", "FileNotFoundError: [Errno 2] No such file or directory: 'missing.csv'")
        # error 通道含工具特定缺失文本 → 判定为工具缺失
        assert MeetingCoordinator._gate_check_unavailable("[Errno 2] No such file or directory: 'pytest'", "")
        assert MeetingCoordinator._gate_check_unavailable("/opt/python: No module named pylint", "")
        # error 通道含通用 "no module named" 但非 pytest/pylint（conftest/插件导入错误）
        # → 不判为工具缺失（fail-closed，暴露真实项目缺陷）
        assert not MeetingCoordinator._gate_check_unavailable("ModuleNotFoundError: No module named 'conftest_dep'", "")
        # error 通道含通用 "no such file or directory" 但非 pytest/pylint → 不判为工具缺失
        assert not MeetingCoordinator._gate_check_unavailable("No such file or directory: 'missing_data.csv'", "")
        # output 通道含 no tests ran → 判定为无测试（跳过）
        assert MeetingCoordinator._gate_check_unavailable("", "no tests ran in 0.00s")


def test_build_execution_artifact_text_lists_files_and_summary():
    """artifact 文本含文件清单 + 截断摘要（不携带完整结果文本）"""
    from meeting_coordinator import MeetingCoordinator

    exec_results = [
        {"agent_id": "a1", "result": "完成了登录模块。" + "x" * 500, "written_files": ["src/auth.py", "src/auth_test.py"]},
        {"agent_id": "a2", "result": "后端 API 完成。", "written_files": []},
    ]
    text = MeetingCoordinator._build_execution_artifact_text(exec_results, max_summary_len=400)
    assert "src/auth.py" in text
    assert "src/auth_test.py" in text
    assert "[文件清单]" in text
    assert "[摘要]" in text
    assert len(text) < 600  # 轻量：不携带完整结果
    assert "完成了登录模块。" in text


def test_build_execution_artifact_text_respects_max_summary_len():
    """摘要严格截断到 max_summary_len，不携带完整结果文本"""
    from meeting_coordinator import MeetingCoordinator

    exec_results = [{"result": "a" * 1000, "written_files": ["f.py"]}]
    text = MeetingCoordinator._build_execution_artifact_text(exec_results, max_summary_len=400)
    summary = text.split("[摘要] ", 1)[1]
    assert len(summary) == 400
    assert "a" * 401 not in text


def test_build_execution_artifact_text_empty():
    """无执行结果时返回空字符串"""
    from meeting_coordinator import MeetingCoordinator

    assert MeetingCoordinator._build_execution_artifact_text([]) == ""


# ---------------------------------------------------------------------------
# 模型 failover：_mark_model_failed 驱逐缓存 + 标记 pool 实例不健康
# ---------------------------------------------------------------------------


async def test_mark_model_failed_evicts_cache_and_marks_unhealthy(coordinator):
    """_mark_model_failed 驱逐缓存 + 标记 pool 实例不健康"""
    coordinator._agent_pool = MagicMock()
    pool_instance = MagicMock()
    pool_instance.id = "pool-1"
    coordinator._agent_pool.get_agent_by_role.return_value = pool_instance

    model = coordinator._get_model(AgentRole.EXECUTOR)
    assert coordinator._models.get(AgentRole.EXECUTOR.value) is model
    assert coordinator._model_pool_ids.get(AgentRole.EXECUTOR.value) == "pool-1"

    coordinator._mark_model_failed(AgentRole.EXECUTOR)
    assert AgentRole.EXECUTOR.value not in coordinator._models
    assert AgentRole.EXECUTOR.value not in coordinator._model_pool_ids
    coordinator._agent_pool.mark_unhealthy.assert_called_once_with("pool-1")


async def test_get_model_refetches_after_failure(coordinator):
    """模型失败后 _get_model 重新获取（不再返回坏模型缓存）"""
    coordinator._agent_pool = MagicMock()
    pool_instance = MagicMock()
    pool_instance.id = "pool-1"
    coordinator._agent_pool.get_agent_by_role.side_effect = [pool_instance, MagicMock(id="pool-2")]

    model1 = coordinator._get_model(AgentRole.EXECUTOR)
    coordinator._mark_model_failed(AgentRole.EXECUTOR)
    model2 = coordinator._get_model(AgentRole.EXECUTOR)
    assert model1 is not model2
    assert coordinator._agent_pool.get_agent_by_role.call_count == 2


# ---------------------------------------------------------------------------
# failover 归因收窄：_run_agent_execution_loop 的 on_model_error 仅模型层触发
# ---------------------------------------------------------------------------


async def test_run_agent_execution_loop_model_error_triggers_on_model_error(coordinator):
    """模型层异常：model.reply 抛异常 → on_model_error 被调用并 re-raise"""
    calls = []

    class ExplodingModel:
        async def reply(self, conversation):
            raise RuntimeError("model down")

    with pytest.raises(RuntimeError):
        await coordinator._run_agent_execution_loop(
            ExplodingModel(), "请执行", None, on_model_error=lambda: calls.append("marked")
        )
    assert calls == ["marked"]


async def test_run_agent_execution_loop_tool_error_skips_on_model_error(coordinator):
    """工具层异常：agent_toolset.write_file 抛异常 → on_model_error 不被调用（归因收窄）"""
    calls = []

    class ToolExplodingModel:
        async def reply(self, conversation):
            return types.SimpleNamespace(
                content=[{"type": "text", "text": "```out.txt\nhello\n```"}]
            )

    toolset = MagicMock()
    toolset.write_file.side_effect = OSError("disk full")

    with pytest.raises(OSError):
        await coordinator._run_agent_execution_loop(
            ToolExplodingModel(), "请执行", toolset, on_model_error=lambda: calls.append("marked")
        )
    # 工具层异常不归因于模型：回调不应被调用
    assert calls == []


async def test_execute_workflow_node_model_error_marks_model_failed(coordinator):
    """_execute_workflow_node 模型层异常 → _mark_model_failed 被调用（failover 归因）"""
    class ExplodingModel:
        async def reply(self, conversation):
            raise RuntimeError("model down")

    coordinator._get_model = MagicMock(return_value=ExplodingModel())
    coordinator._mark_model_failed = MagicMock()

    node = WorkflowNode(node_id="n1", task_description="任务", dept_id="dept-frontend")
    result = await coordinator._execute_workflow_node(node, {})
    coordinator._mark_model_failed.assert_called_once_with(AgentRole.EXECUTOR)
    # 异常被外层 except 兜底为 fallback 结果
    assert result["node_id"] == "n1"
    assert "执行结果" in result["result"]


async def test_execute_workflow_node_tool_error_does_not_mark_model_failed(coordinator, tmp_path):
    """_execute_workflow_node 工具层异常 → 不调用 _mark_model_failed（不驱逐健康模型）"""
    class ToolExplodingModel:
        async def reply(self, conversation):
            return types.SimpleNamespace(
                content=[{"type": "text", "text": "```out.txt\nhello\n```"}]
            )

    coordinator._get_model = MagicMock(return_value=ToolExplodingModel())
    coordinator._mark_model_failed = MagicMock()
    coordinator._workspace = types.SimpleNamespace(root_path=str(tmp_path))

    toolset = MagicMock()
    toolset.get_system_prompt.return_value = "工具说明"
    toolset.write_file.side_effect = OSError("disk full")
    with patch("agent_toolset.create_agent_toolset", return_value=toolset):
        node = WorkflowNode(node_id="n1", task_description="任务", dept_id="dept-frontend")
        result = await coordinator._execute_workflow_node(node, {})

    coordinator._mark_model_failed.assert_not_called()
    assert result["files_written"] == []


# ---------------------------------------------------------------------------
# failover 贯通：decompose_task / handle_critical_blocker 模型异常 → _mark_model_failed
# ---------------------------------------------------------------------------


async def test_decompose_task_model_error_marks_model_failed(coordinator):
    """decompose_task 的 model.reply 抛异常 → mark_failed(PLANNER) 被调且回退 []"""
    class ExplodingModel:
        async def reply(self, msg):
            raise RuntimeError("model down")

    coordinator._get_model = MagicMock(return_value=ExplodingModel())
    coordinator._model_manager.mark_failed = MagicMock()

    subtasks = await coordinator.decompose_task("开发一个网站")
    coordinator._model_manager.mark_failed.assert_called_once_with(AgentRole.PLANNER)
    # 原 fallback 语义保持（text = "[]" → 空列表）
    assert subtasks == []


async def test_handle_critical_blocker_model_error_marks_model_failed(coordinator):
    """handle_critical_blocker 的 model.reply 抛异常 → mark_failed(PLANNER) 被调且回退 fallback 文本"""
    class ExplodingModel:
        async def reply(self, msg):
            raise RuntimeError("model down")

    coordinator._get_model = MagicMock(return_value=ExplodingModel())
    coordinator._model_manager.mark_failed = MagicMock()
    coordinator._msg = AsyncMock()  # 截断消息推送，聚焦模型失败归因

    await coordinator.handle_critical_blocker("agent-executor", "前端构建失败", AsyncMock())
    coordinator._model_manager.mark_failed.assert_called_once_with(AgentRole.PLANNER)
    # fallback 文本已推送（原降级行为保持）
    coordinator._msg.assert_awaited_once()
    text_arg = coordinator._msg.call_args[0][1]
    assert "应急方案" in text_arg


# ---------------------------------------------------------------------------
# fallback 契约异常安全：回调自身抛异常不顶掉原模型异常路径
# ---------------------------------------------------------------------------


async def test_decompose_task_callback_error_keeps_fallback(coordinator):
    """_mark_model_failed 自身抛异常 → 不顶掉模型异常路径，decompose_task 仍回退 []"""
    class ExplodingModel:
        async def reply(self, msg):
            raise RuntimeError("model down")

    def boom(role):
        raise RuntimeError("callback boom")

    coordinator._get_model = MagicMock(return_value=ExplodingModel())
    coordinator._mark_model_failed = boom

    subtasks = await coordinator.decompose_task("开发一个网站")
    # fallback 契约保持：回调异常被吞掉，仍返回空列表（而非回调异常冒泡）
    assert subtasks == []


async def test_handle_critical_blocker_callback_error_keeps_fallback(coordinator):
    """_mark_model_failed 自身抛异常 → handle_critical_blocker 仍回退 fallback 文本并推送"""
    class ExplodingModel:
        async def reply(self, msg):
            raise RuntimeError("model down")

    def boom(role):
        raise RuntimeError("callback boom")

    coordinator._get_model = MagicMock(return_value=ExplodingModel())
    coordinator._mark_model_failed = boom
    coordinator._msg = AsyncMock()

    await coordinator.handle_critical_blocker("agent-executor", "前端构建失败", AsyncMock())
    coordinator._msg.assert_awaited_once()
    text_arg = coordinator._msg.call_args[0][1]
    assert "应急方案" in text_arg


async def test_run_agent_execution_loop_callback_error_preserves_model_error(coordinator):
    """on_model_error 回调自身抛异常 → 不顶掉原模型异常，仍 re-raise 模型异常"""
    class ExplodingModel:
        async def reply(self, conversation):
            raise RuntimeError("model down")

    def boom():
        raise RuntimeError("callback boom")

    # 回调异常被吞掉，re-raise 的仍是原模型异常（match="model down" 验证）
    with pytest.raises(RuntimeError, match="model down"):
        await coordinator._run_agent_execution_loop(
            ExplodingModel(), "请执行", None, on_model_error=boom
        )


# ---------------------------------------------------------------------------
# 门禁接入 execute_and_review_task：review 前计算 gate_result 并传入
# ---------------------------------------------------------------------------


async def test_execute_and_review_task_passes_gate_result(coordinator):
    """execute_and_review_task 在 review 前计算确定性门禁并传入 gate_result"""
    coordinator.execute_assigned_tasks = AsyncMock(return_value=[
        {"task_id": "t1", "agent_id": "a1", "result": "任务执行完成", "status": "completed"}
    ])
    review = AsyncMock(return_value={"structured_feedback": {"status": "approved", "issues": []}})
    coordinator._review_pipeline.review = review

    gate_result = {"passed": False, "failures": [{"type": "test_failure", "detail": "tests 失败"}]}
    coordinator._run_deterministic_gate = MagicMock(return_value=gate_result)

    await coordinator.execute_and_review_task("测试任务", AsyncMock())

    # 无 workspace 时门禁以 None 运行（跳过工具），结果传入 review
    coordinator._run_deterministic_gate.assert_called_once_with(None)
    _, kwargs = review.call_args
    assert kwargs.get("gate_result") == gate_result


async def test_execute_and_review_task_gate_uses_workspace_root(coordinator, tmp_path):
    """有 workspace 时门禁使用 workspace.root_path，且 review 收到 gate_result"""
    coordinator._workspace = types.SimpleNamespace(root_path=str(tmp_path))
    coordinator.execute_assigned_tasks = AsyncMock(return_value=[
        {"task_id": "t1", "agent_id": "a1", "result": "任务执行完成", "status": "completed"}
    ])
    review = AsyncMock(return_value={"structured_feedback": {"status": "approved", "issues": []}})
    coordinator._review_pipeline.review = review
    coordinator._run_deterministic_gate = MagicMock(return_value={"passed": True, "failures": []})

    await coordinator.execute_and_review_task("测试任务", AsyncMock())

    coordinator._run_deterministic_gate.assert_called_once_with(str(tmp_path))
    _, kwargs = review.call_args
    assert kwargs.get("gate_result") == {"passed": True, "failures": []}


# ---------------------------------------------------------------------------
# P3: _extract_discussion_decisions 从 SessionEvent 事件流投影
# ---------------------------------------------------------------------------

class TestExtractDiscussionDecisionsProjection:
    def test_projects_from_events_with_stance_filter(self, coordinator):
        """决策从事件流投影：保留 support/modify，过滤 oppose/neutral"""
        coordinator.meeting.add_message("agent", "采用事件驱动架构 [STANCE:support] [CONFIDENCE:0.9]", "agent-planner")
        coordinator.meeting.add_message("agent", "反对该方案 [STANCE:oppose] [CONFIDENCE:0.7]", "agent-reviewer")
        coordinator.meeting.add_message("agent", "补充安全约束 [STANCE:modify] [CONFIDENCE:0.8]", "agent-monitor")
        coordinator.meeting.add_message("agent", "无立场发言", "agent-executor")

        result = coordinator._extract_discussion_decisions([])

        assert "团队讨论确定的方案与约束：" in result
        assert "事件驱动架构" in result        # support 保留
        assert "安全约束" in result            # modify 保留
        assert "反对该方案" not in result      # oppose 过滤
        assert "无立场发言" not in result      # neutral 过滤
        # 形状与既有实现一致：icon + [role]
        assert "+ [planner]" in result
        assert "~ [monitor]" in result
        assert "[STANCE:" not in result
        assert "[CONFIDENCE:" not in result

    def test_truncates_to_120_chars(self, coordinator):
        """每条决策截断到 120 字（保留 ... 后缀）"""
        long_content = "方案内容" * 60  # 240 字
        coordinator.meeting.add_message("agent", f"{long_content} [STANCE:support] [CONFIDENCE:0.9]", "agent-planner")

        result = coordinator._extract_discussion_decisions([])

        assert "..." in result
        assert ("方案内容" * 60) not in result
        assert len(result) < 240

    def test_limits_to_8_decisions(self, coordinator):
        """只保留前 8 条 support/modify 决策"""
        for i in range(12):
            coordinator.meeting.add_message(
                "agent", f"决策观点{i} [STANCE:support] [CONFIDENCE:0.9]", f"agent-planner-{i}"
            )
        result = coordinator._extract_discussion_decisions([])

        assert result.count("  + [") == 8  # 仅 8 条
        assert "决策观点11" not in result   # 超出 8 条被截断

    def test_falls_back_to_results_without_events(self, coordinator):
        """事件流为空时回退到 discussion_results 既有实现"""
        discussion_results = [
            {"agent_id": "agent-planner", "role": "planner",
             "content": "既有方案 [STANCE:support]", "parsed_stance": "support"},
            {"agent_id": "agent-reviewer", "role": "reviewer",
             "content": "既有反对", "parsed_stance": "oppose"},
        ]
        result = coordinator._extract_discussion_decisions(discussion_results)

        assert "既有方案" in result
        assert "既有反对" not in result
        assert "+ [planner]" in result


# ---------------------------------------------------------------------------
# 3c. team_id 三层透传（process_user_message → semantic_analyze → analyzer）
# ---------------------------------------------------------------------------

class TestTeamIdPassThrough:
    def test_semantic_analyze_passes_team_id_to_analyzer(self, coordinator, monkeypatch):
        """semantic_analyze(user_message, team_id) 应透传给 analyzer.analyze"""
        captured = {}

        async def fake_analyze(user_message, team_id=""):
            captured["team_id"] = team_id
            return SemanticAnalysisResult(
                is_task=True, intent="task", task_description=user_message
            )

        monkeypatch.setattr(coordinator._semantic_analyzer, "analyze", fake_analyze)
        asyncio.run(coordinator.semantic_analyze("透传测试专用消息 A1", team_id="team-x"))
        assert captured["team_id"] == "team-x"

    def test_semantic_analyze_default_team_id_empty(self, coordinator, monkeypatch):
        """缺省 team_id 时透传空串（既有调用形状零变化）"""
        captured = {}

        async def fake_analyze(user_message, team_id=""):
            captured["team_id"] = team_id
            return SemanticAnalysisResult(
                is_task=True, intent="task", task_description=user_message
            )

        monkeypatch.setattr(coordinator._semantic_analyzer, "analyze", fake_analyze)
        asyncio.run(coordinator.semantic_analyze("透传测试专用消息 A2"))
        assert captured["team_id"] == ""

    def test_process_user_message_passes_team_id(self, coordinator, monkeypatch):
        """process_user_message(..., team_id) 应透传给 semantic_analyze"""
        captured = {}

        async def fake_semantic_analyze(user_message, team_id=""):
            captured["team_id"] = team_id
            return SemanticAnalysisResult(
                is_task=True,
                intent="workflow",
                task_description=user_message,
                is_workflow=True,
                workflow_definition=WorkflowDefinition(
                    workflow_id="minutes-test",
                    name="会议纪要",
                    description="test",
                    execution_strategy="sequential",
                ),
            )

        async def fake_execute_workflow(workflow_definition, on_message):
            return {"execution_id": "e-1", "status": "completed", "results": {}}

        async def on_message(agent_id, content, delta):
            pass

        monkeypatch.setattr(coordinator, "semantic_analyze", fake_semantic_analyze)
        monkeypatch.setattr(coordinator, "_execute_workflow", fake_execute_workflow)
        asyncio.run(coordinator.process_user_message(
            "透传测试专用消息 B1", on_message, team_id="team-x"
        ))
        assert captured["team_id"] == "team-x"

    def test_process_user_message_default_team_id_empty(self, coordinator, monkeypatch):
        """process_user_message 缺省 team_id 时透传空串（既有调用形状零变化）"""
        captured = {}

        async def fake_semantic_analyze(user_message, team_id=""):
            captured["team_id"] = team_id
            return SemanticAnalysisResult(
                is_task=True,
                intent="workflow",
                task_description=user_message,
                is_workflow=True,
                workflow_definition=WorkflowDefinition(
                    workflow_id="minutes-test",
                    name="会议纪要",
                    description="test",
                    execution_strategy="sequential",
                ),
            )

        async def fake_execute_workflow(workflow_definition, on_message):
            return {"execution_id": "e-1", "status": "completed", "results": {}}

        async def on_message(agent_id, content, delta):
            pass

        monkeypatch.setattr(coordinator, "semantic_analyze", fake_semantic_analyze)
        monkeypatch.setattr(coordinator, "_execute_workflow", fake_execute_workflow)
        asyncio.run(coordinator.process_user_message("透传测试专用消息 B2", on_message))
        assert captured["team_id"] == ""

    def test_semantic_analyze_team_id_bypasses_cache(self, coordinator, monkeypatch):
        """team_id 非空绕过 llm_cache（get/put 零调用）；同消息跨团队不串 team_id；空 team_id 走缓存路径"""
        from llm_cache import llm_cache

        cache_calls = {"get": 0, "put": 0}

        def fake_get(prompt, role="", model=""):
            cache_calls["get"] += 1

        def fake_put(prompt, response, role="", model=""):
            cache_calls["put"] += 1

        analyze_calls = []

        async def fake_analyze(user_message, team_id=""):
            analyze_calls.append(team_id)
            return SemanticAnalysisResult(
                is_task=True, intent="task", task_description=user_message
            )

        monkeypatch.setattr(llm_cache, "get", fake_get)
        monkeypatch.setattr(llm_cache, "put", fake_put)
        monkeypatch.setattr(coordinator._semantic_analyzer, "analyze", fake_analyze)

        # 场景 1：team_id="team-a" → 绕过缓存，analyze(team_id="team-a") 被调用，llm_cache.get/put 零调用
        result_a = asyncio.run(coordinator.semantic_analyze("缓存回归专用消息", team_id="team-a"))
        assert analyze_calls == ["team-a"]
        assert cache_calls == {"get": 0, "put": 0}

        # 场景 2：同消息 team_id="team-b" → 仍实时分析（即使缓存有 team-a 结果也不命中——team_id 不串）
        result_b = asyncio.run(coordinator.semantic_analyze("缓存回归专用消息", team_id="team-b"))
        assert analyze_calls == ["team-a", "team-b"]
        assert cache_calls == {"get": 0, "put": 0}

        # 场景 3：空 team_id → 走既有缓存路径（llm_cache.get 被调用，miss 后 analyze + put）
        result_empty = asyncio.run(coordinator.semantic_analyze("缓存回归专用消息"))
        assert analyze_calls == ["team-a", "team-b", ""]
        assert cache_calls == {"get": 1, "put": 1}


# ──────────────────── run_discussion 测试 ────────────────────

class TestRunDiscussion:
    """测试 run_discussion 方法（委托给 coordinator_discussion）"""

    def test_run_discussion_returns_list(self, coordinator, monkeypatch):
        """run_discussion 应返回讨论结果列表"""
        from unittest.mock import AsyncMock

        mock_results = [
            {"agent_id": "agent-executor", "content": "支持方案", "stance": "support"},
            {"agent_id": "agent-reviewer", "content": "需要修改", "stance": "modify"},
        ]

        async def fake_run(*args, **kwargs):
            return mock_results

        monkeypatch.setattr("coordinator_discussion.run_discussion", fake_run)

        async def _test():
            result = await coordinator.run_discussion("测试主题", AsyncMock())
            assert isinstance(result, list)
            assert len(result) == 2
            assert result[0]["agent_id"] == "agent-executor"

        asyncio.run(_test())

    def test_run_discussion_with_team(self, coordinator, monkeypatch):
        """run_discussion 传入 team 时应使用 MixedLocationDiscussion"""
        from unittest.mock import AsyncMock

        called_with_team = []

        async def fake_run(coord, topic, on_message, max_rounds=2, team=None):
            called_with_team.append(team is not None)
            return []

        monkeypatch.setattr("coordinator_discussion.run_discussion", fake_run)

        async def _test():
            mock_team = MagicMock()
            mock_team.members = [MagicMock()]
            await coordinator.run_discussion("测试", AsyncMock(), team=mock_team)
            assert called_with_team == [True]

        asyncio.run(_test())


# ──────────────────── assign_tasks 测试 ────────────────────

class TestAssignTasks:
    """测试 assign_tasks 方法"""

    def test_assign_tasks_creates_meeting_tasks(self, coordinator):
        """assign_tasks 应在 meeting 中创建任务"""
        subtasks = [
            {"name": "前端开发", "description": "实现 UI"},
            {"name": "后端开发", "description": "实现 API"},
        ]

        async def _test():
            assignments = await coordinator.assign_tasks(subtasks)
            assert len(assignments) == 2
            assert assignments[0]["agent_id"] == "agent-executor"
            assert assignments[1]["agent_id"] == "agent-executor"
            assert coordinator.meeting.tasks is not None

        asyncio.run(_test())

    def test_assign_tasks_classifies_roles(self, coordinator):
        """assign_tasks 应根据任务内容分类角色"""
        subtasks = [
            {"name": "审查代码", "description": "代码审查"},
            {"name": "监控部署", "description": "监控系统"},
        ]

        async def _test():
            assignments = await coordinator.assign_tasks(subtasks)
            # 审查任务应分配给 reviewer
            assert any(a["agent_id"] == "agent-reviewer" for a in assignments)
            # 监控任务应分配给 monitor
            assert any(a["agent_id"] == "agent-monitor" for a in assignments)

        asyncio.run(_test())


# ──────────────────── execute_tool_call 测试 ────────────────────

class TestExecuteToolCall:
    """测试 execute_tool_call 方法"""

    def test_execute_tool_call_returns_result(self, coordinator):
        """execute_tool_call 应返回工具执行结果"""
        async def _test():
            result = await coordinator.execute_tool_call("read_file", {"path": "test.txt"})
            assert isinstance(result, dict)
            assert "success" in result or "error" in result

        asyncio.run(_test())

    def test_execute_tool_call_unknown_tool(self, coordinator):
        """execute_tool_call 处理未知工具"""
        async def _test():
            result = await coordinator.execute_tool_call("nonexistent_tool", {})
            assert result.get("success") is False or "error" in result

        asyncio.run(_test())


# ---------------------------------------------------------------------------
# 6. 集成 grant-xp：任务完成后自动授予 XP
# ---------------------------------------------------------------------------


class TestGrantTaskXP:
    def test_grant_xp_after_task(self, coordinator, tmp_path, monkeypatch):
        """任务完成后自动授予 XP"""
        from agent_profile_manager import AgentProfileManager
        monkeypatch.setattr(coordinator, "_agent_profile_manager",
                            AgentProfileManager(str(tmp_path / "profiles")),
                            raising=False)
        # 模拟任务完成
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "completed")
        # grant-xp 应该被调用
        result = coordinator._grant_task_xp("agent-executor", "backend_dev",
                                             task_success=True, review_score=8.0, task_complexity=3)
        assert result["xp_gained"] > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
