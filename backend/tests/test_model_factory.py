"""Tests for model_factory — shared model creation"""
import pytest

from model_factory import _auto_init, create_agent, get_default_base_url


class TestGetDefaultBaseUrl:
    def test_deepseek(self):
        assert get_default_base_url("deepseek") == "https://api.deepseek.com"

    def test_openai(self):
        assert get_default_base_url("openai") == "https://api.openai.com/v1"

    def test_unknown(self):
        assert get_default_base_url("unknown") == ""


class TestAutoInit:
    def test_auto_init_from_agent_module(self):
        """_auto_init 从 agent 模块获取 provider registry"""
        # 这个测试依赖 agentscope mock
        _auto_init()
        # 如果 agent 模块可用，应该初始化成功
        # 如果不可用，应该静默跳过
        assert True  # 不抛异常即通过


class TestCreateAgent:
    def test_create_agent_unsupported_provider(self):
        """不支持的提供商抛 ValueError"""
        with pytest.raises(ValueError, match="不支持"):
            create_agent(
                provider="unsupported",
                api_key="test",
                system_prompt="test",
                agent_name="test",
            )

    def test_get_default_base_url_returns_empty_for_unknown(self):
        assert get_default_base_url("unknown_provider") == ""
