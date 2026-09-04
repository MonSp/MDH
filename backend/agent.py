import asyncio
import json
import logging
import traceback

from chat_agent import ChatAgent, Msg
from llm_client import PROVIDER_DEFAULTS, LLMClient

from config import SYSTEM_PROMPT
from session import Session, _current_session, get_session

logger = logging.getLogger("agent")

# 兼容旧代码引用
PROVIDER_REGISTRY = {name: {"default_model": d["default_model"]} for name, d in PROVIDER_DEFAULTS.items()}


async def _send_event_async(event_type: str, **data):
    session = get_session()
    payload = {"type": event_type, **data}
    await session.ws.send_json(payload)


def _extract_text(msg) -> str:
    """从 Msg 提取纯文本（兼容 chat_agent.Msg 和 agentscope.Msg）"""
    if not msg or not hasattr(msg, "content"):
        return ""
    if isinstance(msg.content, str):
        return msg.content
    if isinstance(msg.content, list):
        parts = []
        for block in msg.content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
            elif hasattr(block, "text"):
                parts.append(block.text)
        return " ".join(parts)
    return ""


async def run_agent_stream(session: Session, content: str) -> str:
    token = _current_session.set(session)
    result_text = ""
    try:
        agent = _get_or_create_agent(session)
        logger.info("Agent 开始处理: session=%s provider=%s model=%s", session.session_id, session.provider, session.model_name or "(默认)")
        user_msg = Msg(
            name="user",
            role="user",
            content=[{"type": "text", "text": content}],
        )

        result_text = await _stream_loop(agent, user_msg) or ""
        logger.info("Agent 处理完成: session=%s", session.session_id)

    except Exception:
        traceback.print_exc()
        logger.exception("Agent 执行异常: session=%s", session.session_id)
        await _send_event_async("error", message="Agent 内部错误，请检查后端日志")
    finally:
        _current_session.reset(token)
    return result_text


def _get_or_create_agent(session: Session) -> ChatAgent:
    if session.agent is not None:
        return session.agent

    provider = session.provider or "deepseek"
    defaults = PROVIDER_DEFAULTS.get(provider)
    if defaults is None:
        raise ValueError(f"不支持的模型提供商: {provider}")

    if provider == "custom":
        if not session.model_name:
            raise ValueError("自定义提供商必须填写模型名称")
        if not session.base_url:
            raise ValueError("自定义提供商必须填写 BASE URL")
        if not session.api_key:
            raise ValueError("自定义提供商必须填写 API KEY")
    elif provider != "ollama" and not session.api_key:
        provider_labels = {
            "deepseek": "DeepSeek",
            "openai": "OpenAI",
            "anthropic": "Anthropic",
            "dashscope": "DashScope",
            "gemini": "Gemini",
            "moonshot": "Moonshot",
            "xai": "xAI",
        }
        label = provider_labels.get(provider, provider)
        raise ValueError(f"请在设置中填写 {label} 的 API KEY")

    client = LLMClient(
        api_key=session.api_key or "",
        base_url=session.base_url or "",
        model=session.model_name or "",
        provider=provider,
    )
    session.agent = ChatAgent(
        name="BrowserAgent",
        system_prompt=SYSTEM_PROMPT + session.build_page_info(),
        client=client,
    )
    logger.info("Agent 已创建: provider=%s model=%s", provider, client.model)
    return session.agent


async def _stream_loop(agent: ChatAgent, first_input: Msg) -> str:
    """流式文本输出循环

    使用 ChatAgent.reply_stream() 流式输出文本块，
    前端通过 WebSocket 事件接收实时文本。
    """
    accumulated_text = ""

    try:
        async for chunk in agent.reply_stream(first_input):
            accumulated_text += chunk
            await _send_event_async("reply_text", delta=chunk)

        await _send_event_async("done")
    except Exception as e:
        logger.error("流式输出失败: %s", e)
        await _send_event_async("error", message=str(e))

    return accumulated_text
