"""Tests for model_factory — shared model creation"""
import pytest

from model_factory import create_agent, get_default_base_url


class TestGetDefaultBaseUrl:
    def test_deepseek(self):
        assert get_default_base_url("deepseek") == "https://api.deepseek.com/v1"

    def test_openai(self):
        assert get_default_base_url("openai") == "https://api.openai.com/v1"

    def test_unknown(self):
        assert get_default_base_url("unknown") == ""


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

    def test_create_agent_deepseek(self):
        """DeepSeek 提供商创建成功"""
        agent = create_agent(
            provider="deepseek",
            api_key="test-key",
            system_prompt="你是CTO",
            agent_name="ceo",
        )
        assert agent.name == "ceo"
        assert agent.system_prompt == "你是CTO"
        assert agent._client is not None

    def test_create_agent_openai(self):
        """OpenAI 提供商创建成功"""
        agent = create_agent(
            provider="openai",
            api_key="test-key",
            system_prompt="test",
            agent_name="test",
        )
        assert agent.name == "test"
        assert agent._client is not None

    def test_get_default_base_url_returns_empty_for_unknown(self):
        assert get_default_base_url("unknown_provider") == ""
