import asyncio
import shutil
import tempfile
from unittest.mock import MagicMock

import pytest

from collaboration.executor_agent import ExecutorAgent
from experience_extractor import ExecutionLog, ExperienceExtractor, ExperienceRule


# ──────────────────── Fixtures ────────────────────


@pytest.fixture
def tmp_incremental_dir():
    """创建临时增量区目录"""
    d = tempfile.mkdtemp(prefix="test_executor_enhanced_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def extractor(tmp_incremental_dir):
    """创建 ExperienceExtractor 实例"""
    return ExperienceExtractor(incremental_dir=tmp_incremental_dir)


@pytest.fixture
def agent_basic():
    """不带经验模块的基础 agent"""
    return ExecutorAgent(name="test-executor")


@pytest.fixture
def agent_with_experience(extractor, tmp_incremental_dir):
    """带经验模块的 agent"""
    return ExecutorAgent(
        name="test-executor",
        base_skill_path="/tmp/base_skills",
        incremental_path=tmp_incremental_dir,
        experience_extractor=extractor,
    )


def _make_approved_rule(rule_id: str = "rule-001", keywords=None, task_type: str = "web-dev") -> ExperienceRule:
    """构建已审核通过的规则"""
    return ExperienceRule(
        rule_id=rule_id,
        trigger_condition=f"task_type is {task_type} and encounter decision",
        action="choose approach: css selector",
        note="此决策在之前任务中被成功验证",
        source_task_id="prev-task-001",
        source_task_type=task_type,
        rule_type="success_pattern",
        status="approved",
        keywords=keywords or ["web-dev", "css", "selector"],
        created_at="2026-01-01T00:00:00+00:00",
    )


# ──────────────────── 1. 构造函数新增参数 ────────────────────


class TestConstructorEnhanced:
    """验证构造函数新增参数的向后兼容性和正确性"""

    def test_default_constructor_backward_compatible(self):
        """默认构造函数保持向后兼容"""
        agent = ExecutorAgent(name="old-style")
        assert agent.name == "old-style"
        assert agent.base_skill_path is None
        assert agent.incremental_path is None
        assert agent.experience_extractor is None

    def test_constructor_with_new_params(self, extractor, tmp_incremental_dir):
        """构造函数接受新参数"""
        agent = ExecutorAgent(
            name="enhanced",
            base_skill_path="/tmp/base",
            incremental_path=tmp_incremental_dir,
            experience_extractor=extractor,
        )
        assert agent.base_skill_path == "/tmp/base"
        assert agent.incremental_path == tmp_incremental_dir
        assert agent.experience_extractor is extractor

    def test_constructor_with_partial_new_params(self):
        """只传入部分新参数也正常工作"""
        agent = ExecutorAgent(name="partial", base_skill_path="/tmp/base")
        assert agent.base_skill_path == "/tmp/base"
        assert agent.incremental_path is None
        assert agent.experience_extractor is None


# ──────────────────── 2. 经验注入 ────────────────────


class TestInjectExperience:
    """验证经验注入逻辑"""

    def test_inject_without_extractor(self, agent_basic):
        """无 ExperienceExtractor 时返回空字符串"""
        result = agent_basic._inject_experience("构建登录页面", "web-dev")
        assert result == ""

    def test_inject_without_incremental_path(self, extractor):
        """无 incremental_path 时返回空字符串"""
        agent = ExecutorAgent(name="no-path", experience_extractor=extractor)
        result = agent._inject_experience("构建登录页面", "web-dev")
        assert result == ""

    def test_inject_with_no_matching_rules(self, agent_with_experience):
        """无匹配规则时返回空字符串"""
        result = agent_with_experience._inject_experience("做一些无关的事情", "unknown-type")
        assert result == ""

    def test_inject_with_matching_rules(self, agent_with_experience, extractor):
        """有匹配规则时返回格式化上下文"""
        rule = _make_approved_rule()
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        result = agent_with_experience._inject_experience("css selector 选择页面元素", "web-dev")
        assert "历史经验参考" in result
        assert "css selector" in result.lower() or "css" in result.lower()

    def test_inject_handles_exception_gracefully(self, tmp_incremental_dir):
        """注入过程异常时安全返回空字符串"""
        mock_extractor = MagicMock()
        mock_extractor.retrieve_relevant_rules.side_effect = RuntimeError("boom")
        agent = ExecutorAgent(
            name="error-agent",
            incremental_path=tmp_incremental_dir,
            experience_extractor=mock_extractor,
        )
        result = agent._inject_experience("test task", "web-dev")
        assert result == ""


# ──────────────────── 3. 结构化反馈处理 ────────────────────


class TestHandleRevisionFeedback:
    """验证结构化反馈处理"""

    def test_non_revision_status(self, agent_basic):
        """非 revision_required 状态直接返回"""
        feedback = {"status": "approved"}
        result = agent_basic.handle_revision_feedback(feedback)
        assert result["handled"] is True
        assert result["corrections"] == []
        assert result["needs_retry"] is False

    def test_non_dict_input(self, agent_basic):
        """非字典输入安全返回"""
        result = agent_basic.handle_revision_feedback(None)
        assert result["handled"] is True
        assert result["needs_retry"] is False

    def test_revision_with_issues(self, agent_basic):
        """包含 issues 时生成 corrections"""
        feedback = {
            "status": "revision_required",
            "issues": [
                {
                    "type": "logic_error",
                    "location": "main.py:42",
                    "detail": "循环条件错误",
                    "suggestion": "将 < 改为 <=",
                },
                {
                    "type": "style_issue",
                    "location": "utils.py:10",
                    "detail": "命名不规范",
                    "suggestion": "使用 snake_case",
                },
            ],
            "max_iterations": 3,
            "current_iteration": 1,
        }
        result = agent_basic.handle_revision_feedback(feedback)
        assert result["handled"] is True
        assert len(result["corrections"]) == 2
        assert result["needs_retry"] is True
        assert result["corrections"][0]["issue_type"] == "logic_error"
        assert result["corrections"][0]["location"] == "main.py:42"
        assert result["corrections"][1]["suggestion"] == "使用 snake_case"

    def test_revision_at_max_iterations(self, agent_basic):
        """达到最大迭代次数时不再重试"""
        feedback = {
            "status": "revision_required",
            "issues": [
                {
                    "type": "logic_error",
                    "location": "main.py:1",
                    "detail": "问题",
                    "suggestion": "修复",
                },
            ],
            "max_iterations": 3,
            "current_iteration": 3,
        }
        result = agent_basic.handle_revision_feedback(feedback)
        assert result["handled"] is True
        assert result["needs_retry"] is False

    def test_revision_with_empty_issues(self, agent_basic):
        """空 issues 列表不需要重试"""
        feedback = {
            "status": "revision_required",
            "issues": [],
            "max_iterations": 3,
            "current_iteration": 1,
        }
        result = agent_basic.handle_revision_feedback(feedback)
        assert result["corrections"] == []
        assert result["needs_retry"] is False

    def test_revision_with_non_dict_issue(self, agent_basic):
        """非字典类型的 issue 被跳过"""
        feedback = {
            "status": "revision_required",
            "issues": [None, "invalid", {"type": "valid", "detail": "ok", "suggestion": "fix"}],
            "max_iterations": 3,
            "current_iteration": 1,
        }
        result = agent_basic.handle_revision_feedback(feedback)
        assert len(result["corrections"]) == 1
        assert result["corrections"][0]["issue_type"] == "valid"


# ──────────────────── 4. 迭代修正循环 ────────────────────


class TestExecuteWithIteration:
    """验证迭代修正循环"""

    def test_approved_first_iteration(self, agent_basic):
        """第一次迭代就通过"""
        call_count = [0]

        async def run():
            async def executor(task_id, task_name, desc):
                call_count[0] += 1
                return {"output": "done"}

            agent_basic.set_task_executor(executor)

            def review(output):
                return {"status": "approved"}

            result = await agent_basic.execute_with_iteration(
                "test task",
                task_context={"task_id": "t1", "task_type": "test"},
                max_iterations=3,
                review_callback=review,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "approved"
        assert result["iterations"] == 1
        assert call_count[0] == 1
        assert result["corrections"] == []

    def test_approved_after_revision(self, agent_basic):
        """经过修正后通过"""
        call_count = [0]

        async def run():
            async def executor(task_id, task_name, desc):
                call_count[0] += 1
                return {"output": f"attempt-{call_count[0]}"}

            agent_basic.set_task_executor(executor)
            review_count = {"n": 0}

            def review(output):
                review_count["n"] += 1
                if review_count["n"] == 1:
                    return {
                        "status": "revision_required",
                        "issues": [
                            {
                                "type": "logic_error",
                                "location": "file:1",
                                "detail": "错误",
                                "suggestion": "修复",
                            }
                        ],
                    }
                return {"status": "approved"}

            result = await agent_basic.execute_with_iteration(
                "test task",
                task_context={"task_id": "t2", "task_type": "test"},
                max_iterations=3,
                review_callback=review,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "approved"
        assert result["iterations"] == 2
        assert call_count[0] == 2
        assert len(result["corrections"]) == 1

    def test_max_iterations_reached(self, agent_basic):
        """达到最大迭代次数"""
        call_count = [0]

        async def run():
            async def executor(task_id, task_name, desc):
                call_count[0] += 1
                return {"output": f"attempt-{call_count[0]}"}

            agent_basic.set_task_executor(executor)

            def review(output):
                return {
                    "status": "revision_required",
                    "issues": [
                        {
                            "type": "persistent_error",
                            "location": "file:1",
                            "detail": "持续错误",
                            "suggestion": "修复",
                        }
                    ],
                }

            result = await agent_basic.execute_with_iteration(
                "test task",
                task_context={"task_id": "t3", "task_type": "test"},
                max_iterations=3,
                review_callback=review,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "max_iterations_reached"
        assert result["iterations"] == 3
        assert call_count[0] == 3

    def test_no_review_callback_approves_directly(self, agent_basic):
        """无 review_callback 时直接通过"""

        async def run():
            async def executor(task_id, task_name, desc):
                return {"output": "done"}

            agent_basic.set_task_executor(executor)

            result = await agent_basic.execute_with_iteration(
                "test task",
                task_context={"task_id": "t4", "task_type": "test"},
                max_iterations=3,
                review_callback=None,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "approved"
        assert result["iterations"] == 1

    def test_async_review_callback(self, agent_basic):
        """支持异步 review_callback"""

        async def run():
            async def executor(task_id, task_name, desc):
                return {"output": "done"}

            agent_basic.set_task_executor(executor)

            async def review(output):
                return {"status": "approved"}

            result = await agent_basic.execute_with_iteration(
                "test task",
                task_context={"task_id": "t5", "task_type": "test"},
                max_iterations=3,
                review_callback=review,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "approved"

    def test_execution_exception_returns_error(self, agent_basic):
        """执行异常时返回错误输出并继续循环"""

        async def run():
            call_count = {"n": 0}

            async def executor(task_id, task_name, desc):
                call_count["n"] += 1
                if call_count["n"] == 1:
                    raise RuntimeError("execution failed")
                return {"output": "recovered"}

            agent_basic.set_task_executor(executor)
            review_count = {"n": 0}

            def review(output):
                review_count["n"] += 1
                if review_count["n"] == 1:
                    return {
                        "status": "revision_required",
                        "issues": [
                            {
                                "type": "runtime_error",
                                "location": "executor",
                                "detail": "execution failed",
                                "suggestion": "retry",
                            }
                        ],
                    }
                return {"status": "approved"}

            result = await agent_basic.execute_with_iteration(
                "test task",
                task_context={"task_id": "t6", "task_type": "test"},
                max_iterations=3,
                review_callback=review,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "approved"
        assert result["iterations"] == 2

    def test_experience_context_injected_on_first_iteration(self, agent_with_experience, extractor):
        """首轮迭代注入经验上下文到任务描述中"""
        rule = _make_approved_rule()
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        captured_descriptions = []

        async def run():
            async def executor(task_id, task_name, desc):
                captured_descriptions.append(desc)
                return {"output": "done"}

            agent_with_experience.set_task_executor(executor)

            def review(output):
                return {"status": "approved"}

            result = await agent_with_experience.execute_with_iteration(
                "css selector 操作",
                task_context={"task_id": "t7", "task_type": "web-dev"},
                max_iterations=3,
                review_callback=review,
            )
            return result

        result = asyncio.run(run())
        assert result["status"] == "approved"
        assert len(captured_descriptions) == 1
        assert "历史经验参考" in captured_descriptions[0]


# ──────────────────── 5. 经验沉淀 ────────────────────


class TestExtractAndSaveExperience:
    """验证经验沉淀调用"""

    def test_save_success_experience(self, agent_with_experience, extractor):
        """成功任务提取经验并提交审核"""
        agent_with_experience._extract_and_save_experience(
            task_description="构建登录页面",
            task_type="web-dev",
            success=True,
            corrections=[],
        )

        pending = extractor.get_pending_rules()
        # 成功日志中没有决策点和步骤，不会产生规则
        # 但方法本身不会抛异常
        assert isinstance(pending, list)

    def test_save_failure_experience(self, agent_with_experience, extractor):
        """失败任务提取经验并提交审核"""
        corrections = [
            {
                "issue_type": "logic_error",
                "detail": "循环条件错误",
                "suggestion": "将 < 改为 <=",
            }
        ]
        agent_with_experience._extract_and_save_experience(
            task_description="计算斐波那契数列",
            task_type="algorithm",
            success=False,
            corrections=corrections,
        )

        pending = extractor.get_pending_rules()
        assert isinstance(pending, list)

    def test_save_without_extractor(self, agent_basic):
        """无 experience_extractor 时安全跳过"""
        # 不应抛异常
        agent_basic._extract_and_save_experience(
            task_description="test",
            task_type="test",
            success=True,
            corrections=[],
        )

    def test_experience_submitted_for_review(self, tmp_incremental_dir, extractor):
        """验证经验规则被提交审核（含决策点的场景）"""
        agent = ExecutorAgent(
            name="review-test",
            incremental_path=tmp_incremental_dir,
            experience_extractor=extractor,
        )

        # 使用带决策点的成功日志
        log = ExecutionLog(
            task_id="task-review",
            agent_id="review-test",
            task_description="构建页面",
            task_type="web-dev",
            status="success",
            steps=[
                {
                    "command": "select",
                    "action": "select css approach",
                    "is_decision": True,
                    "selected_option": "css selector",
                    "reason": "更稳定",
                },
            ],
            errors=[],
            corrections=[],
            final_output="成功",
            created_at="2026-01-01T00:00:00",
        )
        rules = extractor.extract_from_success(log)
        assert len(rules) > 0

        for rule in rules:
            extractor.submit_for_review(rule)

        pending = extractor.get_pending_rules()
        assert len(pending) >= 1

    def test_extract_and_save_handles_exception(self, tmp_incremental_dir):
        """经验沉淀过程异常时安全处理"""
        mock_extractor = MagicMock()
        mock_extractor.extract_from_success.side_effect = RuntimeError("boom")
        agent = ExecutorAgent(
            name="error-agent",
            incremental_path=tmp_incremental_dir,
            experience_extractor=mock_extractor,
        )
        # 不应抛异常
        agent._extract_and_save_experience(
            task_description="test",
            task_type="test",
            success=True,
            corrections=[],
        )


# ──────────────────── 6. 辅助方法 ────────────────────


class TestExtractKeywords:
    """验证关键词提取"""

    def test_english_keywords(self):
        keywords = ExecutorAgent._extract_keywords("Build a login page with css selector")
        assert "build" in keywords
        assert "login" in keywords
        assert "page" in keywords
        assert "css" in keywords
        assert "selector" in keywords
        # 停用词被过滤
        assert "a" not in keywords
        assert "with" not in keywords

    def test_chinese_keywords(self):
        keywords = ExecutorAgent._extract_keywords("构建一个登录页面")
        assert "构" in keywords
        assert "建" in keywords
        assert "登" in keywords
        assert "录" in keywords
        assert "页" in keywords
        assert "面" in keywords
        # 停用词被过滤
        assert "一" not in keywords
        assert "个" not in keywords

    def test_mixed_language(self):
        keywords = ExecutorAgent._extract_keywords("使用 CSS selector 选择页面元素")
        assert "css" in keywords
        assert "selector" in keywords
        assert "选" in keywords
        assert "择" in keywords
        assert "页" in keywords
        assert "面" in keywords
        assert "元" in keywords
        assert "素" in keywords

    def test_empty_text(self):
        assert ExecutorAgent._extract_keywords("") == []
        assert ExecutorAgent._extract_keywords(None) == []

    def test_deduplication(self):
        keywords = ExecutorAgent._extract_keywords("test test test")
        assert keywords.count("test") == 1

    def test_short_tokens_filtered(self):
        keywords = ExecutorAgent._extract_keywords("I am a go developer")
        assert "go" not in keywords  # 长度 < 2
        assert "am" not in keywords  # 停用词
        assert "developer" in keywords
