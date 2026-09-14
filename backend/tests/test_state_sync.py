"""State Sync 模块测试"""

from unittest.mock import MagicMock

import pytest

from experience_extractor import ExperienceRule
from state_sync import StateSyncManager


def _make_rule(rule_id: str, action: str, keywords: list[str], score: float = 0.8) -> ExperienceRule:
    return ExperienceRule(
        rule_id=rule_id,
        trigger_condition="task_type is general",
        action=action,
        note="来自之前的任务",
        source_task_id="task-001",
        source_task_type="general",
        rule_type="success_pattern",
        status="approved",
        keywords=keywords,
        created_at="2026-01-01T00:00:00Z",
        effectiveness_score=score,
        usage_count=5,
        success_count=4,
    )


@pytest.fixture
def mock_experience():
    """模拟 ExperienceExtractor"""
    exp = MagicMock()
    exp.retrieve_with_aging.return_value = [
        _make_rule("rule-001", "配置文件修改后需要运行 TypeScript 检查", ["config", "typescript"], 0.85),
        _make_rule("rule-002", "端口修改后需要更新 docker-compose.yml", ["port", "docker"], 0.72),
    ]
    exp.retrieve_relevant_rules.return_value = exp.retrieve_with_aging.return_value
    exp.update_rule_effectiveness.return_value = None
    return exp


@pytest.fixture
def mock_memory():
    """模拟 AgentMemory"""
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
        mock_experience.retrieve_with_aging.assert_called_once()

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
        mock_experience.retrieve_with_aging.return_value = []
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
        # add_memory takes (agent_id, entry_dict)
        args = mock_memory.add_memory.call_args[0]
        assert args[0] == "ts-orchestrator"
        entry = args[1]
        assert entry["type"] == "task_summary"
        assert entry["importance"] == 0.7
        assert entry["task_id"] == "task-001"

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
        args = mock_memory.add_memory.call_args[0]
        entry = args[1]
        assert entry["type"] == "learning"
        assert entry["importance"] == 0.5
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
