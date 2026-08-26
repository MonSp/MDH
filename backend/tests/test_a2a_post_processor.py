"""A2A Post Processor 测试"""

import pytest
from unittest.mock import MagicMock

from a2a_post_processor import A2APostProcessor


@pytest.fixture
def mock_experience():
    exp = MagicMock()
    exp.extract_from_meeting.return_value = [
        {"rule_id": "r1", "action": "配置文件修改后需要运行检查", "keywords": ["config"]}
    ]
    exp.update_rule_effectiveness.return_value = None
    return exp


@pytest.fixture
def mock_memory():
    return MagicMock()


@pytest.fixture
def mock_router():
    return MagicMock()


@pytest.fixture
def mock_profiles():
    prof = MagicMock()
    prof.get_profile.return_value = MagicMock(total_xp=100)
    return prof


class TestA2APostProcessor:

    @pytest.mark.asyncio
    async def test_full_pipeline_success(self, mock_experience, mock_memory, mock_router):
        proc = A2APostProcessor(
            experience_extractor=mock_experience,
            agent_memory=mock_memory,
            dynamic_router=mock_router,
        )

        await proc.process(
            task_description="读取 config.ts 并修改端口为 9090",
            result_text="已将端口从 8080 修改为 9090",
            success=True,
            agent_id="ts-orchestrator",
            task_id="task-001",
        )

        # 经验提炼应被调用（5 个位置参数）
        mock_experience.extract_from_meeting.assert_called_once()
        call_args = mock_experience.extract_from_meeting.call_args[0]
        # call_args = (project_id, task_description, discussion_results, review_result, execution_results)
        assert "config.ts" in call_args[1]  # task_description is 2nd arg
        assert call_args[3]["passed"] is True  # review_result.passed

        # 记忆写入应被调用（归属于数字员工 executor，而非执行节点）
        mock_memory.add_memory.assert_called_once()
        mem_args = mock_memory.add_memory.call_args[0]
        assert mem_args[0] == "executor"  # xp_target defaults to "executor"
        assert "成功" in mem_args[1]["content"]

        # 路由统计应被调用
        mock_router.update_stats.assert_called_once()

    @pytest.mark.asyncio
    async def test_failure_no_experience_distillation(self, mock_experience, mock_memory, mock_router):
        proc = A2APostProcessor(
            experience_extractor=mock_experience,
            agent_memory=mock_memory,
            dynamic_router=mock_router,
        )

        await proc.process(
            task_description="修改配置文件",
            result_text="Error: permission denied",
            success=False,
            agent_id="ts-orchestrator",
        )

        # 失败时不应提炼经验
        mock_experience.extract_from_meeting.assert_not_called()

        # 但记忆应写入（learning 类型）
        mock_memory.add_memory.assert_called_once()
        mem_args = mock_memory.add_memory.call_args[0]
        assert "失败" in mem_args[1]["content"]

        # 路由统计应更新（记录失败）
        mock_router.update_stats.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_crash_without_components(self):
        """无组件时不应抛异常"""
        proc = A2APostProcessor()

        await proc.process(
            task_description="test",
            result_text="result",
            success=True,
        )
        # 不抛异常即通过

    @pytest.mark.asyncio
    async def test_xp_granted_on_success(self, mock_experience, mock_memory, mock_router, mock_profiles):
        proc = A2APostProcessor(
            experience_extractor=mock_experience,
            agent_memory=mock_memory,
            dynamic_router=mock_router,
            agent_profile_manager=mock_profiles,
        )

        await proc.process(
            task_description="实现一个 REST API 端点",
            result_text="API 实现完成",
            success=True,
            agent_id="executor-001",
        )

        # XP 应授予给 xp_target（默认 executor），使用正确签名
        mock_profiles.grant_xp.assert_called_once()
        xp_kwargs = mock_profiles.grant_xp.call_args[1]  # keyword args
        assert xp_kwargs["agent_id"] == "executor"
        assert xp_kwargs["skill_id"] == "general"
        assert xp_kwargs["task_success"] is True
        assert xp_kwargs["task_complexity"] >= 1  # complexity >= 1

    @pytest.mark.asyncio
    async def test_no_xp_on_failure(self, mock_experience, mock_memory, mock_router, mock_profiles):
        proc = A2APostProcessor(
            experience_extractor=mock_experience,
            agent_memory=mock_memory,
            dynamic_router=mock_router,
            agent_profile_manager=mock_profiles,
        )

        await proc.process(
            task_description="实现一个 REST API",
            result_text="Error",
            success=False,
            agent_id="executor-001",
        )

        # 失败时不授予 XP
        mock_profiles.grant_xp.assert_not_called()

    def test_estimate_complexity(self):
        assert A2APostProcessor._estimate_complexity("读取文件") == 1
        assert A2APostProcessor._estimate_complexity("首先读取文件然后修改最后测试") >= 2
        assert A2APostProcessor._estimate_complexity("前端后端数据库测试部署") >= 2
