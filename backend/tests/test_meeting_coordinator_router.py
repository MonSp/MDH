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

from dynamic_router import DynamicRouter, RouteEntry, RoutingDecision
from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator
from protocol import AgentRole, MeetingAgentStatus, SemanticAnalysisResult


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
        assert len(table) == 3  # 默认3个部门

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
        coordinator._get_model = MagicMock()
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": true, "intent": "task", "task_description": "写代码", "target_agent_id": "agent-executor", "reason": "test", "confidence": 0.9, "discussion_topic": ""}'}]
        ))
        coordinator._get_model.return_value = mock_model

        with patch.object(coordinator.router, "route", wraps=coordinator.router.route) as mock_route:
            asyncio.run(coordinator.semantic_analyze("帮我写一段 Python 代码"))
            mock_route.assert_called_once_with("帮我写一段 Python 代码")

    def test_last_routing_decision_stored(self, coordinator):
        """semantic_analyze 应存储 _last_routing_decision"""
        coordinator._get_model = MagicMock()
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": false, "intent": "discussion", "discussion_topic": "test"}'}]
        ))
        coordinator._get_model.return_value = mock_model

        asyncio.run(coordinator.semantic_analyze("帮我做 PPT"))
        assert hasattr(coordinator, "_last_routing_decision")
        assert isinstance(coordinator._last_routing_decision, RoutingDecision)

    def test_routing_decision_includes_context_in_prompt(self, coordinator):
        """路由结果应作为上下文传给 LLM"""
        coordinator._get_model = MagicMock()
        mock_model = MagicMock()
        captured_msg = None

        async def capture_reply(msg):
            nonlocal captured_msg
            captured_msg = msg
            return MagicMock(
                content=[{"type": "text", "text": '{"is_task": false, "intent": "discussion", "discussion_topic": "test"}'}]
            )

        mock_model.reply = AsyncMock(side_effect=capture_reply)
        coordinator._get_model.return_value = mock_model

        asyncio.run(coordinator.semantic_analyze("帮我写 Python 代码"))
        assert captured_msg is not None
        # 消息中应包含路由上下文
        content = captured_msg.content[0]["text"]
        assert "动态路由建议" in content

    def test_fallback_to_router_on_llm_parse_failure(self, coordinator):
        """LLM 解析失败时应回退到路由结果"""
        coordinator._get_model = MagicMock()
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": "这不是有效的JSON"}]
        ))
        coordinator._get_model.return_value = mock_model

        result = asyncio.run(coordinator.semantic_analyze("帮我写 Python 代码"))
        # 路由器应对"写 Python 代码"有足够置信度
        assert result.is_task is True
        assert result.target_agent_id == "dept-software"

    def test_returns_semantic_analysis_result(self, coordinator):
        """正常情况应返回 SemanticAnalysisResult"""
        coordinator._get_model = MagicMock()
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": true, "intent": "task", "task_description": "做PPT", "target_agent_id": "agent-executor", "reason": "test", "confidence": 0.8, "discussion_topic": ""}'}]
        ))
        coordinator._get_model.return_value = mock_model

        result = asyncio.run(coordinator.semantic_analyze("帮我做 PPT"))
        assert isinstance(result, SemanticAnalysisResult)
        assert result.is_task is True

    def test_llm_overrides_router_when_confident(self, coordinator):
        """LLM 高置信度时可以覆盖路由结果"""
        coordinator._get_model = MagicMock()
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": '{"is_task": true, "intent": "task", "task_description": "写代码", "target_agent_id": "agent-planner", "reason": "LLM认为更适合", "confidence": 0.95, "discussion_topic": ""}'}]
        ))
        coordinator._get_model.return_value = mock_model

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

    def test_execute_tasks_updates_stats_on_success(self, coordinator):
        """execute_assigned_tasks 成功时应调用 router.update_stats"""
        # 创建一个任务
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "assigned")
        coordinator._task_routing[task.id] = "dept-software"

        # Mock 模型回复
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(return_value=MagicMock(
            content=[{"type": "text", "text": "任务执行完成"}]
        ))
        coordinator._get_model = MagicMock(return_value=mock_model)

        with patch.object(coordinator.router, "update_stats") as mock_stats:
            results = asyncio.run(coordinator.execute_assigned_tasks())
            mock_stats.assert_called_once_with("dept-software", success=True)

        assert len(results) == 1
        assert results[0]["result"] == "任务执行完成"

    def test_execute_tasks_updates_stats_on_failure(self, coordinator):
        """execute_assigned_tasks 失败时应调用 router.update_stats(success=False)"""
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "assigned")
        coordinator._task_routing[task.id] = "dept-software"

        # Mock 模型抛出异常
        mock_model = MagicMock()
        mock_model.reply = AsyncMock(side_effect=RuntimeError("API 调用失败"))
        coordinator._get_model = MagicMock(return_value=mock_model)

        with patch.object(coordinator.router, "update_stats") as mock_stats:
            results = asyncio.run(coordinator.execute_assigned_tasks())
            mock_stats.assert_called_once_with("dept-software", success=False)

        assert len(results) == 1
        assert "任务执行失败" in results[0]["result"]

    def test_auto_assign_task_records_routing_dept(self, coordinator):
        """auto_assign_task 应记录路由部门到 _task_routing"""
        coordinator._last_routing_decision = RoutingDecision(
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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
