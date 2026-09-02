"""Unit tests for MeetingCoordinator key methods.

Focused on static/pure methods that can be tested without LLM or WebSocket setup.
"""

from meeting_coordinator import MeetingCoordinator

# ──────────────────── _estimate_task_complexity ────────────────────

class TestEstimateTaskComplexity:
    """Test task complexity estimation (1-5 scale)."""

    def test_simple_task_returns_low(self):
        assert MeetingCoordinator._estimate_task_complexity("读取 README") <= 2

    def test_single_keyword_returns_1(self):
        assert MeetingCoordinator._estimate_task_complexity("hello world") >= 1

    def test_complex_multi_step(self):
        desc = "首先设计前端页面，然后实现后端API，最后部署到数据库"
        score = MeetingCoordinator._estimate_task_complexity(desc)
        assert score >= 3

    def test_max_clamped_at_5(self):
        desc = "首先 然后 最后 前端 后端 数据库 部署 架构 设计 重构 优化 多个文件"
        score = MeetingCoordinator._estimate_task_complexity(desc)
        assert score == 5

    def test_min_clamped_at_1(self):
        assert MeetingCoordinator._estimate_task_complexity("") == 1

    def test_english_keywords(self):
        score = MeetingCoordinator._estimate_task_complexity("deploy to frontend and backend")
        assert score >= 2


# ──────────────────── _verify_delivery ────────────────────

class TestVerifyDelivery:
    """Test delivery verification logic."""

    def test_empty_results_fails(self):
        result = MeetingCoordinator._verify_delivery([])
        assert result["passed"] is False
        assert "无执行结果" in result["reason"]

    def test_all_failed_fails(self):
        results = [
            {"agent_id": "a1", "result": "执行失败", "written_files": []},
            {"agent_id": "a2", "result": "error occurred", "written_files": []},
        ]
        result = MeetingCoordinator._verify_delivery(results)
        assert result["passed"] is False
        assert "所有 agent 执行失败" in result["reason"]

    def test_no_output_fails(self):
        results = [
            {"agent_id": "a1", "result": "ok", "written_files": []},
        ]
        result = MeetingCoordinator._verify_delivery(results)
        assert result["passed"] is False
        assert "无实际产出" in result["reason"]

    def test_written_files_passes(self):
        results = [
            {"agent_id": "a1", "result": "完成", "written_files": ["main.py", "test.py"]},
        ]
        result = MeetingCoordinator._verify_delivery(results)
        assert result["passed"] is True
        assert len(result["evidence"]) == 1
        assert result["evidence"][0]["files"] == 2

    def test_long_result_passes(self):
        results = [
            {"agent_id": "a1", "result": "x" * 50, "written_files": []},
        ]
        result = MeetingCoordinator._verify_delivery(results)
        assert result["passed"] is True

    def test_mixed_results_passes(self):
        results = [
            {"agent_id": "a1", "result": "error", "written_files": []},
            {"agent_id": "a2", "result": "成功完成任务，生成了代码", "written_files": ["output.py"]},
        ]
        result = MeetingCoordinator._verify_delivery(results)
        assert result["passed"] is True


# ──────────────────── _triage_task ────────────────────

class TestTriageTask:
    """Test rule-based task triage."""

    def test_simple_short_task(self):
        result = MeetingCoordinator._triage_task("写一个 hello world")
        assert result["level"] == "simple"
        assert result["confidence"] > 0.7

    def test_complex_multi_domain(self):
        result = MeetingCoordinator._triage_task(
            "首先设计前端页面，然后实现后端API，最后部署数据库架构"
        )
        assert result["level"] == "complex"
        assert result["confidence"] < 0.5

    def test_returns_required_keys(self):
        result = MeetingCoordinator._triage_task("测试任务")
        assert "level" in result
        assert "confidence" in result
        assert "reason" in result

    def test_confidence_in_range(self):
        tasks = [
            "hi",
            "创建一个简单的Python函数",
            "设计并实现一个完整的微服务架构，包括前端、后端、数据库和部署",
            "读取文件",
            "重构整个项目",
        ]
        for task in tasks:
            result = MeetingCoordinator._triage_task(task)
            assert 0.0 <= result["confidence"] <= 1.0, f"Out of range for: {task}"

    def test_read_file_is_simple(self):
        result = MeetingCoordinator._triage_task("读取 README.md 的内容")
        assert result["level"] == "simple"
