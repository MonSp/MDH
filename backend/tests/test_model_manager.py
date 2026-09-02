"""Tests for model_manager — model lifecycle management"""
from unittest.mock import MagicMock

import pytest

from protocol import AgentRole


class TestModelManager:
    @pytest.fixture
    def manager(self):
        from model_manager import ModelManager
        return ModelManager(
            provider="deepseek",
            api_key="test-key",
            base_url="https://api.deepseek.com",
            model_name="deepseek-chat",
        )

    def test_init(self, manager):
        assert manager._provider == "deepseek"
        assert manager._api_key == "test-key"
        assert manager._models == {}
        assert manager._model_pool_ids == {}

    def test_mark_failed_evicts_cache(self, manager):
        """mark_failed 驱逐缓存"""
        manager._models["test"] = MagicMock()
        manager.mark_failed(AgentRole.EXECUTOR)
        assert "executor" not in manager._models

    def test_mark_failed_with_pool(self, manager):
        """mark_failed 标记 pool 实例不健康"""
        manager._agent_pool = MagicMock()
        manager._models["executor"] = MagicMock()
        manager._model_pool_ids["executor"] = "pool-1"
        manager.mark_failed(AgentRole.EXECUTOR)
        manager._agent_pool.mark_unhealthy.assert_called_once_with("pool-1")

    def test_safe_mark_failed_no_exception(self, manager):
        """safe_mark_failed 不抛异常"""
        manager._models["test"] = MagicMock()
        manager.safe_mark_failed(AgentRole.EXECUTOR)
        # 不抛异常即通过

    def test_safe_mark_failed_with_broken_pool(self, manager):
        """safe_mark_failed 即使 pool 异常也不抛"""
        manager._agent_pool = MagicMock()
        manager._agent_pool.mark_unhealthy.side_effect = RuntimeError("pool broken")
        manager._models["executor"] = MagicMock()
        manager._model_pool_ids["executor"] = "pool-1"
        manager.safe_mark_failed(AgentRole.EXECUTOR)
        # 不抛异常即通过
