"""State Sync 模块测试"""

import pytest
from unittest.mock import MagicMock, patch

from state_sync import StateSyncManager


@pytest.fixture
def mock_experience():
    """模拟 ExperienceExtractor"""
    exp = MagicMock()
    exp.retrieve_rules.return_value = [
        {
            "rule_id": "rule-001",
            "action": "配置文件修改后需要运行 TypeScript 检查",
            "note": "来自之前的任务",
            "effectiveness_score": 0.85,
            "keywords": ["config", "typescript"],
        },
        {
            "rule_id": "rule-002",
            "action": "端口修改后需要更新 docker-compose.yml",
            "note": "来自之前的任务",
            "effectiveness_score": 0.72,
            "keywords": ["port", "docker"],
        },
    ]
    exp.update_rule_effectiveness.return_value = None
    return exp


@pytest.fixture
def mock_memory():
    """模拟 AgentMemoryManager"""
    mem = MagicMock()
    mem.recall_for_task.return_value = "之前处理过类似的配置修改任务"
    return mem


class TestStateSyncManager:

    def test_prepare_task_metadata_with_rules(self, mock_experience):
        sync = StateSyncManager(experience_extractor=mock_experience)

        metadata = sync.prepare_task_metadata(
            "读取 config.ts 并修改端口为 9090",
            "ts-orchestrator",
        )

        assert "experience_rules" in metadata
        assert len(metadata["experience_rules"]) == 2
        assert metadata["experience_rules"][0]["rule_id"] == "rule-001"
        mock_experience.retrieve_rules.assert_called_once()

    def test_prepare_task_metadata_with_memory(self, mock_experience, mock_memory):
        sync = StateSyncManager(
            experience_extractor=mock_experience,
            memory_manager=mock_memory,
        )

        metadata = sync.prepare_task_metadata(
            "读取 config.ts 并修改端口为 9090",
            "ts-orchestrator",
        )

        assert "experience_rules" in metadata
        assert "skill_context" in metadata
        assert metadata["skill_context"] == "之前处理过类似的配置修改任务"

    def test_prepare_task_metadata_no_rules(self, mock_experience):
        mock_experience.retrieve_rules.return_value = []
        sync = StateSyncManager(experience_extractor=mock_experience)

        metadata = sync.prepare_task_metadata("翻译这段文字", "claude-code")

        assert "experience_rules" not in metadata

    def test_process_task_result_success(self, mock_experience, mock_memory):
        sync = StateSyncManager(
            experience_extractor=mock_experience,
            memory_manager=mock_memory,
        )

        sync.process_task_result(
            agent_id="ts-orchestrator",
            task_description="修改端口配置",
            result_text="已将端口从 8080 修改为 9090",
            success=True,
            task_id="task-001",
        )

        mock_memory.add_memory.assert_called_once()
        call_kwargs = mock_memory.add_memory.call_args[1]
        assert call_kwargs["agent_id"] == "ts-orchestrator"
        assert call_kwargs["memory_type"] == "task_summary"
        assert call_kwargs["importance"] == 0.7
        assert call_kwargs["task_id"] == "task-001"

    def test_process_task_result_failure_updates_rules(self, mock_experience, mock_memory):
        sync = StateSyncManager(
            experience_extractor=mock_experience,
            memory_manager=mock_memory,
        )

        sync.process_task_result(
            agent_id="ts-orchestrator",
            task_description="修改端口配置",
            result_text="Error: permission denied",
            success=False,
            task_id="task-002",
        )

        mock_memory.add_memory.assert_called_once()
        call_kwargs = mock_memory.add_memory.call_args[1]
        assert call_kwargs["memory_type"] == "learning"
        assert call_kwargs["importance"] == 0.5
        # 失败时应更新规则有效性
        mock_experience.update_rule_effectiveness.assert_called()

    def test_process_task_result_no_memory_manager(self, mock_experience):
        sync = StateSyncManager(experience_extractor=mock_experience)

        # 不应抛异常
        sync.process_task_result(
            agent_id="ts-orchestrator",
            task_description="测试",
            result_text="结果",
            success=True,
        )

    def test_extract_keywords(self, mock_experience):
        sync = StateSyncManager(experience_extractor=mock_experience)

        keywords = sync._extract_keywords("读取 config.ts 并修改端口配置")
        assert len(keywords) > 0
        assert len(keywords) <= 10
