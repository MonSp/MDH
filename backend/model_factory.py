"""
模型创建工厂 — 共享的 LLM Agent 创建逻辑

使用自建 llm_client + chat_agent 替代 agentscope。
所有主流 LLM 提供商都支持 OpenAI Chat Completions API 格式，
因此用一个统一客户端即可覆盖。
"""

import logging

from chat_agent import ChatAgent
from llm_client import PROVIDER_DEFAULTS, LLMClient

logger = logging.getLogger("model_factory")


def create_agent(
    provider: str,
    api_key: str,
    base_url: str = "",
    model_name: str = "",
    system_prompt: str = "",
    agent_name: str = "agent",
    stream: bool = True,
) -> ChatAgent:
    """创建 LLM Agent（自建客户端）

    Args:
        provider: 模型提供商 ("deepseek" / "openai" / "anthropic" / ...)
        api_key: API 密钥
        base_url: API 基础 URL（空则使用默认值）
        model_name: 模型名称（空则使用默认值）
        system_prompt: 系统提示词
        agent_name: Agent 名称
        stream: 是否流式（保留参数兼容，reply_stream 自动流式）

    Returns:
        ChatAgent 实例

    Raises:
        ValueError: 不支持的提供商
    """
    if provider not in PROVIDER_DEFAULTS:
        raise ValueError(f"不支持的模型提供商: {provider}")

    client = LLMClient(
        api_key=api_key,
        base_url=base_url,
        model=model_name,
        provider=provider,
    )

    return ChatAgent(
        name=agent_name,
        system_prompt=system_prompt,
        client=client,
    )


def create_agent_from_session(session, system_prompt: str = "", agent_name: str = "agent") -> ChatAgent:
    """从 session 对象创建 Agent（兼容旧调用方式）"""
    return create_agent(
        provider=session.provider or "deepseek",
        api_key=session.api_key or "",
        base_url=session.base_url or "",
        model_name=session.model_name or "",
        system_prompt=system_prompt,
        agent_name=agent_name,
    )


def get_default_base_url(provider: str) -> str:
    """获取提供商的默认 base_url"""
    defaults = PROVIDER_DEFAULTS.get(provider, {})
    return defaults.get("base_url", "")
