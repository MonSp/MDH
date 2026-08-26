"""
模型创建工厂 — 共享的 LLM Agent 创建逻辑

消除 server.py、meeting_coordinator.py、ceo_agent.py 中重复的
_TempSession 模式和 provider registry 调用。
"""

import logging

from agentscope.agent import Agent

logger = logging.getLogger("model_factory")

# Provider registry — 从 server.py 提取
PROVIDER_REGISTRY = {
    "deepseek": {
        "credential_cls": None,  # 运行时注入
        "credential_kwargs": lambda session: {
            "api_key": session.api_key,
            "base_url": session.base_url or "https://api.deepseek.com",
        },
        "model_cls": None,  # 运行时注入
        "formatter_cls": None,  # 运行时注入
        "default_model": "deepseek-chat",
    },
    "openai": {
        "credential_cls": None,
        "credential_kwargs": lambda session: {
            "api_key": session.api_key,
            "base_url": session.base_url or "https://api.openai.com/v1",
        },
        "model_cls": None,
        "formatter_cls": None,
        "default_model": "gpt-4o",
    },
}

# 运行时注入点 — 由 server.py 在启动时设置
_initialized = False


def init_provider_registry(credential_classes: dict, model_classes: dict, formatter_classes: dict):
    """初始化 provider registry（由 server.py 调用）"""
    global _initialized
    for provider_name, reg in PROVIDER_REGISTRY.items():
        if provider_name in credential_classes:
            reg["credential_cls"] = credential_classes[provider_name]
        if provider_name in model_classes:
            reg["model_cls"] = model_classes[provider_name]
        if provider_name in formatter_classes:
            reg["formatter_cls"] = formatter_classes[provider_name]
    _initialized = True


def _auto_init():
    """自动初始化：从 agent 模块获取 provider registry"""
    global _initialized
    try:
        from agent import PROVIDER_REGISTRY as reg
        credential_classes = {}
        model_classes = {}
        formatter_classes = {}
        for name, r in reg.items():
            if r.get("credential_cls"):
                credential_classes[name] = r["credential_cls"]
            if r.get("model_cls"):
                model_classes[name] = r["model_cls"]
            if r.get("formatter_cls"):
                formatter_classes[name] = r["formatter_cls"]
        if credential_classes:
            init_provider_registry(credential_classes, model_classes, formatter_classes)
    except ImportError:
        pass  # agent 模块不可用（测试环境）


def create_agent(
    provider: str,
    api_key: str,
    base_url: str = "",
    model_name: str = "",
    system_prompt: str = "",
    agent_name: str = "agent",
    stream: bool = True,
) -> Agent:
    """创建 LLM Agent（共享工厂方法）

    Args:
        provider: 模型提供商 ("deepseek" / "openai")
        api_key: API 密钥
        base_url: API 基础 URL（空则使用默认值）
        model_name: 模型名称（空则使用默认值）
        system_prompt: 系统提示词
        agent_name: Agent 名称
        stream: 是否流式

    Returns:
        Agent 实例

    Raises:
        ValueError: 不支持的提供商
    """
    # 自动初始化（如果尚未初始化）
    global _initialized
    if not _initialized:
        _auto_init()

    reg = PROVIDER_REGISTRY.get(provider)
    if reg is None:
        raise ValueError(f"不支持的模型提供商: {provider}")

    # agentscope v2.0.6 的 DeepSeek 模型内部使用 openai.AsyncClient，
    # 需要 OPENAI_API_KEY 环境变量。如果未设置，从 api_key 同步。
    import os
    if provider == "deepseek" and not os.environ.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = api_key
        if base_url and not os.environ.get("OPENAI_BASE_URL"):
            os.environ["OPENAI_BASE_URL"] = base_url

    # 创建临时 session 对象（兼容 provider credential 接口）
    class _Session:
        pass

    session = _Session()
    session.api_key = api_key
    session.base_url = base_url

    credential = reg["credential_cls"](**reg["credential_kwargs"](session))
    formatter = reg["formatter_cls"]()
    final_model_name = model_name or reg["default_model"]

    model = reg["model_cls"](
        credential=credential,
        model=final_model_name,
        stream=stream,
        formatter=formatter,
    )

    return Agent(
        name=agent_name,
        system_prompt=system_prompt,
        model=model,
    )


def get_default_base_url(provider: str) -> str:
    """获取提供商的默认 base_url"""
    defaults = {
        "deepseek": "https://api.deepseek.com",
        "openai": "https://api.openai.com/v1",
    }
    return defaults.get(provider, "")
