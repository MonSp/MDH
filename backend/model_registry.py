"""多模型注册表 — 支持多种 LLM 提供商 + 模型路由 + 自动降级

支持的提供商：
- DeepSeek (deepseek-chat, deepseek-reasoner)
- OpenAI (gpt-4o, gpt-4o-mini)
- Anthropic (claude-sonnet-4-7, claude-haiku-3-5)
- Google Gemini (gemini-2.5-pro, gemini-2.5-flash)
- Ollama (本地模型)

模型路由：
- 复杂任务 → 大模型（deepseek-reasoner / gpt-4o / claude-sonnet）
- 简单任务 → 小模型（deepseek-chat / gpt-4o-mini / claude-haiku）
- 分类/分流 → 廉价模型（gpt-4o-mini / gemini-flash）
"""

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger("model_registry")


@dataclass
class ModelConfig:
    """模型配置"""
    provider: str           # deepseek / openai / anthropic / google / ollama
    model_id: str           # 模型 ID（如 deepseek-chat）
    display_name: str       # 显示名称
    tier: str               # big / medium / small
    cost_per_1m_input: float   # 每百万输入 token 成本（美元）
    cost_per_1m_output: float  # 每百万输出 token 成本（美元）
    max_tokens: int = 4096
    supports_streaming: bool = True
    supports_tools: bool = True
    base_url: str = ""      # 自定义 base URL（Ollama 等）


# 默认模型配置
DEFAULT_MODELS: Dict[str, ModelConfig] = {
    # DeepSeek
    "deepseek-chat": ModelConfig(
        provider="deepseek", model_id="deepseek-chat", display_name="DeepSeek Chat",
        tier="medium", cost_per_1m_input=0.14, cost_per_1m_output=0.28,
    ),
    "deepseek-reasoner": ModelConfig(
        provider="deepseek", model_id="deepseek-reasoner", display_name="DeepSeek Reasoner",
        tier="big", cost_per_1m_input=0.55, cost_per_1m_output=2.19,
    ),
    # OpenAI
    "gpt-4o": ModelConfig(
        provider="openai", model_id="gpt-4o", display_name="GPT-4o",
        tier="big", cost_per_1m_input=2.50, cost_per_1m_output=10.00,
    ),
    "gpt-4o-mini": ModelConfig(
        provider="openai", model_id="gpt-4o-mini", display_name="GPT-4o Mini",
        tier="small", cost_per_1m_input=0.15, cost_per_1m_output=0.60,
    ),
    # Anthropic
    "claude-sonnet-4-7": ModelConfig(
        provider="anthropic", model_id="claude-sonnet-4-7", display_name="Claude Sonnet",
        tier="big", cost_per_1m_input=3.00, cost_per_1m_output=15.00,
    ),
    "claude-haiku-3-5": ModelConfig(
        provider="anthropic", model_id="claude-haiku-3-5", display_name="Claude Haiku",
        tier="small", cost_per_1m_input=0.80, cost_per_1m_output=4.00,
    ),
    # Google
    "gemini-2.5-pro": ModelConfig(
        provider="google", model_id="gemini-2.5-pro", display_name="Gemini 2.5 Pro",
        tier="big", cost_per_1m_input=1.25, cost_per_1m_output=5.00,
    ),
    "gemini-2.5-flash": ModelConfig(
        provider="google", model_id="gemini-2.5-flash", display_name="Gemini 2.5 Flash",
        tier="small", cost_per_1m_input=0.075, cost_per_1m_output=0.30,
    ),
    # Ollama (本地)
    "llama3:8b": ModelConfig(
        provider="ollama", model_id="llama3:8b", display_name="Llama 3 8B (本地)",
        tier="small", cost_per_1m_input=0, cost_per_1m_output=0,
        base_url="http://localhost:11434",
    ),
}


class ModelRegistry:
    """模型注册表"""

    def __init__(self, config_path: str = ""):
        self._models: Dict[str, ModelConfig] = dict(DEFAULT_MODELS)
        self._config_path = config_path
        self._load_custom_config()

    def _load_custom_config(self):
        """加载自定义模型配置"""
        if not self._config_path or not os.path.isfile(self._config_path):
            return
        try:
            with open(self._config_path, encoding="utf-8") as f:
                custom = json.load(f)
            for model_id, cfg in custom.get("models", {}).items():
                self._models[model_id] = ModelConfig(**cfg)
            logger.info("加载自定义模型配置: %d 个模型", len(custom.get("models", {})))
        except Exception as e:
            logger.warning("加载自定义模型配置失败: %s", e)

    def get_model(self, model_id: str) -> Optional[ModelConfig]:
        """获取模型配置"""
        return self._models.get(model_id)

    def list_models(self, tier: str = "") -> List[ModelConfig]:
        """列出所有模型"""
        models = list(self._models.values())
        if tier:
            models = [m for m in models if m.tier == tier]
        return sorted(models, key=lambda m: m.cost_per_1m_input)

    def get_model_for_task(self, task_complexity: int, preferred_provider: str = "") -> ModelConfig:
        """根据任务复杂度选择模型

        Args:
            task_complexity: 1-5
            preferred_provider: 首选提供商

        Returns:
            最合适的模型配置
        """
        if task_complexity >= 4:
            tier = "big"
        elif task_complexity >= 2:
            tier = "medium"
        else:
            tier = "small"

        # 按首选提供商筛选
        candidates = [m for m in self._models.values() if m.tier == tier]
        if preferred_provider:
            preferred = [m for m in candidates if m.provider == preferred_provider]
            if preferred:
                candidates = preferred

        # 按成本排序（选最便宜的）
        if candidates:
            return min(candidates, key=lambda m: m.cost_per_1m_input)

        # 降级到 medium
        candidates = [m for m in self._models.values() if m.tier == "medium"]
        return min(candidates, key=lambda m: m.cost_per_1m_input) if candidates else list(self._models.values())[0]

    def get_fallback_chain(self, model_id: str) -> List[ModelConfig]:
        """获取降级链：big → medium → small"""
        model = self.get_model(model_id)
        if not model:
            return []

        chain = [model]
        tier_order = {"big": ["medium", "small"], "medium": ["small"], "small": []}
        for next_tier in tier_order.get(model.tier, []):
            candidates = [m for m in self._models.values() if m.tier == next_tier and m.provider != model.provider]
            if candidates:
                chain.append(min(candidates, key=lambda m: m.cost_per_1m_input))
        return chain
