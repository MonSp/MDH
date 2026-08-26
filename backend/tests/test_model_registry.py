"""Tests for ModelRegistry — 多模型支持"""
import pytest
from model_registry import ModelRegistry


@pytest.fixture
def registry():
    return ModelRegistry()


class TestModelRegistry:
    def test_list_all_models(self, registry):
        """列出所有模型"""
        models = registry.list_models()
        assert len(models) >= 8  # 至少 8 个默认模型

    def test_list_by_tier(self, registry):
        """按 tier 筛选"""
        big = registry.list_models(tier="big")
        small = registry.list_models(tier="small")
        assert len(big) >= 1
        assert len(small) >= 1
        assert all(m.tier == "big" for m in big)

    def test_get_model(self, registry):
        """获取模型"""
        model = registry.get_model("deepseek-chat")
        assert model is not None
        assert model.provider == "deepseek"
        assert model.display_name == "DeepSeek Chat"

    def test_get_model_not_found(self, registry):
        """不存在的模型"""
        assert registry.get_model("nonexistent") is None

    def test_get_model_for_complex_task(self, registry):
        """复杂任务选大模型"""
        model = registry.get_model_for_task(4)
        assert model.tier == "big"

    def test_get_model_for_simple_task(self, registry):
        """简单任务选小模型"""
        model = registry.get_model_for_task(1)
        assert model.tier == "small"

    def test_get_model_with_preferred_provider(self, registry):
        """首选提供商（复杂任务 → big tier，Anthropic 有 claude-sonnet）"""
        model = registry.get_model_for_task(4, preferred_provider="anthropic")
        assert model.provider == "anthropic"

    def test_fallback_chain(self, registry):
        """降级链"""
        chain = registry.get_fallback_chain("gpt-4o")
        assert len(chain) >= 2
        assert chain[0].model_id == "gpt-4o"
        assert chain[1].tier == "medium" or chain[1].tier == "small"

    def test_fallback_chain_small_model(self, registry):
        """小模型降级链只有自己"""
        chain = registry.get_fallback_chain("deepseek-chat")
        assert len(chain) >= 1

    def test_ollama_model_included(self, registry):
        """包含本地模型"""
        model = registry.get_model("llama3:8b")
        assert model is not None
        assert model.provider == "ollama"
        assert model.cost_per_1m_input == 0

    def test_all_models_have_required_fields(self, registry):
        """所有模型有必需字段"""
        for model in registry.list_models():
            assert model.provider
            assert model.model_id
            assert model.display_name
            assert model.tier in ("big", "medium", "small")
            assert model.cost_per_1m_input >= 0
            assert model.cost_per_1m_output >= 0
