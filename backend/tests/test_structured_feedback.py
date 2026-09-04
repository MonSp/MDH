import asyncio
import json
import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock

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

# Mock fastapi（session.py 需要）
if "fastapi" not in sys.modules:
    _ensure_mock_module("fastapi", {"WebSocket": MagicMock})

from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator

SAMPLE_ROUTING_TABLE = {
    "departments": [
        {
            "dept_id": "dept-software",
            "dept_name": "软件工程部",
            "capability_desc": "Web 应用开发",
            "capability_keywords": ["代码", "开发"],
            "tools": ["code_generator"],
            "success_rate": 0.85,
            "total_tasks": 0,
            "successful_tasks": 0,
            "last_active": "",
            "priority": 10,
        },
    ]
}


@pytest.fixture
def tmp_data_dir(tmp_path):
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
# 1. review_task_execution 输出结构化反馈
# ---------------------------------------------------------------------------

class TestStructuredFeedbackOutput:
    """review_task_execution 应在返回值中包含 structured_feedback 字段。"""

    def test_return_contains_structured_feedback(self, coordinator):
        """返回值应包含 structured_feedback 键。"""
        on_message = AsyncMock()

        # Mock execute_assigned_tasks to return task results
        coordinator.execute_assigned_tasks = AsyncMock(return_value=[
            {"task_id": "t1", "agent_id": "a1", "result": "任务执行完成", "status": "completed"}
        ])

        # Mock review pipeline
        coordinator._review_pipeline.review = AsyncMock(return_value={
            "structured_feedback": {"status": "approved", "issues": [], "max_iterations": 3}
        })

        review_result, task_results = asyncio.run(coordinator.execute_and_review_task("测试任务", on_message))
        assert "structured_feedback" in review_result

    def test_structured_feedback_has_required_fields(self, coordinator):
        """structured_feedback 应包含 status, issues, max_iterations 字段。"""
        on_message = AsyncMock()

        coordinator.execute_assigned_tasks = AsyncMock(return_value=[
            {"task_id": "t1", "agent_id": "a1", "result": "任务执行完成", "status": "completed"}
        ])

        coordinator._review_pipeline.review = AsyncMock(return_value={
            "structured_feedback": {
                "status": "approved",
                "issues": [],
                "max_iterations": 3,
                "current_iteration": 1,
                "overall_comment": "Good",
            }
        })

        review_result, task_results = asyncio.run(coordinator.execute_and_review_task("测试任务", on_message))
        feedback = review_result["structured_feedback"]
        assert "status" in feedback
        assert "issues" in feedback
        assert "max_iterations" in feedback
        assert isinstance(feedback["issues"], list)

    def test_backward_compat_old_fields_present(self, coordinator):
        """返回值应继续包含原有的 reviewer_feedback 等字段（向后兼容）。"""
        on_message = AsyncMock()

        coordinator.execute_assigned_tasks = AsyncMock(return_value=[
            {"task_id": "t1", "agent_id": "a1", "result": "任务执行完成", "status": "completed"}
        ])

        coordinator._review_pipeline.review = AsyncMock(return_value={
            "structured_feedback": {"status": "approved", "issues": [], "max_iterations": 3},
            "reviewer_feedback": "Looks good",
        })

        review_result, task_results = asyncio.run(coordinator.execute_and_review_task("测试任务", on_message))
        assert "reviewer_feedback" in review_result


# ---------------------------------------------------------------------------
# 2. 结构化反馈包含所有必需字段
# ---------------------------------------------------------------------------

class TestStructuredFeedbackFields:
    """验证结构化反馈的具体字段值（走 review_pipeline 版本）。"""

    def test_status_is_string(self, coordinator):
        feedback = coordinator._review_pipeline._generate_structured_feedback("任务描述", "任务产出")
        assert isinstance(feedback["status"], str)
        assert feedback["status"] in ("approved", "revision_required")

    def test_max_iterations_default(self, coordinator):
        feedback = coordinator._review_pipeline._generate_structured_feedback("任务描述", "任务产出")
        assert feedback["max_iterations"] == 3

    def test_empty_output_produces_issues(self, coordinator):
        """空产出应产生问题列表。"""
        feedback = coordinator._review_pipeline._generate_structured_feedback("测试任务", "")
        assert len(feedback["issues"]) > 0

    def test_valid_output_produces_approved(self, coordinator):
        """有效的、非空的产出应被批准（无验收标准时）。"""
        feedback = coordinator._review_pipeline._generate_structured_feedback(
            "普通任务", "这是一段足够长的执行结果内容，用于通过验证检查"
        )
        assert feedback["status"] == "approved"


# ---------------------------------------------------------------------------
# 3. 无 PlannerAgent 时的降级行为
# ---------------------------------------------------------------------------

class TestFallbackWithoutPlanner:
    """当 PlannerAgent 不可用时，应降级为简单反馈。"""

    def test_fallback_when_planner_is_none(self, coordinator):
        """将 planner 设为 None 后应返回降级反馈。"""
        coordinator.planner = None
        coordinator._review_pipeline._planner = None
        feedback = coordinator._review_pipeline._generate_structured_feedback("任务", "产出")
        assert feedback == {
            "status": "approved",
            "issues": [],
            "max_iterations": 3,
        }

    def test_fallback_via_review_task_execution(self, coordinator):
        """review_task_execution 中 planner 为 None 时，structured_feedback 使用降级格式。"""
        coordinator.planner = None
        on_message = AsyncMock()

        # Mock execute_assigned_tasks to return task results
        coordinator.execute_assigned_tasks = AsyncMock(return_value=[
            {"task_id": "t1", "agent_id": "a1", "result": "任务执行完成", "status": "completed"}
        ])

        # Mock review pipeline to return fallback feedback
        coordinator._review_pipeline.review = AsyncMock(return_value={
            "structured_feedback": {"status": "approved", "issues": [], "max_iterations": 3}
        })

        review_result, task_results = asyncio.run(coordinator.execute_and_review_task("任务", on_message))
        feedback = review_result["structured_feedback"]
        assert feedback["status"] == "approved"
        assert feedback["issues"] == []
        assert feedback["max_iterations"] == 3
