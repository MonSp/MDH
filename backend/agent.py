import asyncio
import json
import logging
import traceback

from agentscope.agent import Agent, ContextConfig
from agentscope.credential import (
    AnthropicCredential,
    DashScopeCredential,
    DeepSeekCredential,
    GeminiCredential,
    MoonshotCredential,
    OllamaCredential,
    OpenAICredential,
    XAICredential,
)
from agentscope.event import (
    ConfirmResult,
    DataBlockDeltaEvent,
    DataBlockEndEvent,
    DataBlockStartEvent,
    ExceedMaxItersEvent,
    ExternalExecutionResultEvent,
    ModelCallEndEvent,
    ModelCallStartEvent,
    ReplyEndEvent,
    ReplyStartEvent,
    RequireExternalExecutionEvent,
    RequireUserConfirmEvent,
    TextBlockDeltaEvent,
    TextBlockEndEvent,
    TextBlockStartEvent,
    ThinkingBlockDeltaEvent,
    ThinkingBlockEndEvent,
    ThinkingBlockStartEvent,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
    ToolResultDataDeltaEvent,
    ToolResultEndEvent,
    ToolResultStartEvent,
    ToolResultTextDeltaEvent,
    UserConfirmResultEvent,
)
from agentscope.formatter import (
    AnthropicChatFormatter,
    DashScopeChatFormatter,
    DeepSeekChatFormatter,
    GeminiChatFormatter,
    MoonshotChatFormatter,
    OllamaChatFormatter,
    OpenAIChatFormatter,
    XAIChatFormatter,
)
from agentscope.message import Msg, TextBlock, ToolResultBlock, ToolResultState
from agentscope.model import (
    AnthropicChatModel,
    DashScopeChatModel,
    DeepSeekChatModel,
    GeminiChatModel,
    MoonshotChatModel,
    OllamaChatModel,
    OpenAIChatModel,
    XAIChatModel,
)
from agentscope.skill import LocalSkillLoader
from agentscope.tool import FunctionTool, Toolkit

from config import SKILLS_DIR, SYSTEM_PROMPT
from session import Session, _current_session, get_session

logger = logging.getLogger("agent")

PROVIDER_REGISTRY = {
    "deepseek": {
        "credential_cls": DeepSeekCredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key, "base_url": s.base_url},
        "model_cls": DeepSeekChatModel,
        "default_model": "deepseek-chat",
        "formatter_cls": DeepSeekChatFormatter,
    },
    "openai": {
        "credential_cls": OpenAICredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key, "base_url": s.base_url or None},
        "model_cls": OpenAIChatModel,
        "default_model": "gpt-4.1",
        "formatter_cls": OpenAIChatFormatter,
    },
    "anthropic": {
        "credential_cls": AnthropicCredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key, "base_url": s.base_url or None},
        "model_cls": AnthropicChatModel,
        "default_model": "claude-sonnet-4-6",
        "formatter_cls": AnthropicChatFormatter,
    },
    "dashscope": {
        "credential_cls": DashScopeCredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key},
        "model_cls": DashScopeChatModel,
        "default_model": "qwen-plus",
        "formatter_cls": DashScopeChatFormatter,
    },
    "gemini": {
        "credential_cls": GeminiCredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key},
        "model_cls": GeminiChatModel,
        "default_model": "gemini-2.5-flash",
        "formatter_cls": GeminiChatFormatter,
    },
    "moonshot": {
        "credential_cls": MoonshotCredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key},
        "model_cls": MoonshotChatModel,
        "default_model": "moonshot-v1-8k",
        "formatter_cls": MoonshotChatFormatter,
    },
    "ollama": {
        "credential_cls": OllamaCredential,
        "credential_kwargs": lambda s: {"host": s.base_url or None},
        "model_cls": OllamaChatModel,
        "default_model": "qwen3-14b",
        "formatter_cls": OllamaChatFormatter,
    },
    "xai": {
        "credential_cls": XAICredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key},
        "model_cls": XAIChatModel,
        "default_model": "grok-4.3",
        "formatter_cls": XAIChatFormatter,
    },
    "custom": {
        "credential_cls": OpenAICredential,
        "credential_kwargs": lambda s: {"api_key": s.api_key, "base_url": s.base_url},
        "model_cls": OpenAIChatModel,
        "default_model": "",
        "formatter_cls": OpenAIChatFormatter,
    },
}


async def _send_event_async(event_type: str, **data):
    session = get_session()
    payload = {"type": event_type, **data}
    await session.ws.send_json(payload)


def _make_browser_tool(name: str, description: str) -> FunctionTool:
    """浏览器工具创建器（已禁用 — 依赖自研浏览器，与开源项目脱节）"""
    async def _noop(**kwargs) -> None:
        pass

    tool = FunctionTool(func=_noop, name=name, description=description)
    tool.is_external_tool = True
    return tool


MULTIMODAL_TOOLS = {"get_screenshot", "screenshot_element"}


def _build_browser_tools(multimodal: bool = True) -> list:
    """构建浏览器工具列表（已禁用 — 依赖自研浏览器，与开源项目脱节）

    返回空列表，不注册任何浏览器工具。
    如需浏览器自动化，请集成 Playwright 或其他开源方案。
    """
    # 浏览器工具已禁用：依赖自研浏览器，与开源项目脱节
    # 原始工具列表（供参考）：
    #   navigate, resolve_selector, query_target, wait_for_element,
    #   search, click_button, fill_field, input_text, hover, scroll,
    #   scroll_into_view, wait, get_screenshot, screenshot_element,
    #   get_tabs, switch_tab, create_tab, close_tab, press_key,
    #   evaluate_js, execute_step, execute_plan
    return []


def _extract_text(msg: Msg) -> str:
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


def _get_or_create_agent(session: Session) -> Agent:
    if session.agent is not None:
        return session.agent

    provider = session.provider or "deepseek"
    reg = PROVIDER_REGISTRY.get(provider)
    if reg is None:
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

    credential = reg["credential_cls"](**reg["credential_kwargs"](session))
    formatter = reg["formatter_cls"]()
    model_name = session.model_name or reg["default_model"]
    model = reg["model_cls"](
        credential=credential,
        model=model_name,
        stream=True,
        formatter=formatter,
    )
    toolkit = Toolkit(
        tools=_build_browser_tools(multimodal=session.multimodal),
        skills_or_loaders=[LocalSkillLoader(SKILLS_DIR)],
    )
    session.agent = Agent(
        name="BrowserAgent",
        system_prompt=SYSTEM_PROMPT + session.build_page_info(),
        model=model,
        toolkit=toolkit,
        context_config=ContextConfig(
            trigger_ratio=0.7,
            reserve_ratio=0.1,
            tool_result_limit=2000,
        ),
    )
    logger.info("Agent 已创建: provider=%s model=%s", provider, model_name)
    return session.agent


async def _stream_loop(agent: Agent, first_input):
    inputs = first_input
    accumulated_text = ""

    while True:
        exc_event: RequireExternalExecutionEvent | None = None
        confirm_event: RequireUserConfirmEvent | None = None

        async for event in agent.reply_stream(inputs):
            logger.debug("流式事件: type=%s", type(event).__name__)

            if isinstance(event, ThinkingBlockDeltaEvent):
                logger.debug("  ThinkingBlockDelta: block_id=%s delta=%r", event.block_id, event.delta)
                await _send_event_async(
                    "thinking", block_id=event.block_id, delta=event.delta
                )

            elif isinstance(event, ThinkingBlockEndEvent):
                logger.debug("  ThinkingBlockEnd")
                await _send_event_async("thinking_end")

            elif isinstance(event, TextBlockDeltaEvent):
                logger.debug("  TextBlockDelta: block_id=%s delta=%r", event.block_id, event.delta)
                accumulated_text += event.delta
                await _send_event_async(
                    "reply_text", block_id=event.block_id, delta=event.delta
                )

            elif isinstance(event, TextBlockEndEvent):
                logger.debug("  TextBlockEnd")
                await _send_event_async("reply_text_end")

            elif isinstance(event, ToolCallEndEvent):
                logger.debug("  ToolCallEnd")

            elif isinstance(event, RequireExternalExecutionEvent):
                logger.debug("  RequireExternalExecution")
                exc_event = event
                break

            elif isinstance(event, RequireUserConfirmEvent):
                logger.debug("  RequireUserConfirm")
                confirm_event = event
                break

            elif isinstance(event, ReplyEndEvent):
                logger.debug("  ReplyEnd")
                await _send_event_async("done")
                return accumulated_text

            elif isinstance(event, ExceedMaxItersEvent):
                logger.debug("  ExceedMaxIters")
                await _send_event_async("error", message="Agent 执行超过最大迭代次数")
                return

            elif isinstance(event, Msg):
                logger.debug("  Msg: %r", _extract_text(event)[:200])
                text = _extract_text(event)
                await _send_event_async("done", message=text)
                return text

            elif isinstance(event, (
                ReplyStartEvent,
                ModelCallStartEvent,
                ModelCallEndEvent,
                TextBlockStartEvent,
                ThinkingBlockStartEvent,
                ToolCallStartEvent,
                ToolCallDeltaEvent,
                ToolResultStartEvent,
                ToolResultTextDeltaEvent,
                ToolResultDataDeltaEvent,
                ToolResultEndEvent,
                DataBlockStartEvent,
                DataBlockDeltaEvent,
                DataBlockEndEvent,
            )):
                logger.debug("  (已忽略事件)")

            else:
                logger.debug("  未处理的流式事件: %s", type(event).__name__)

        if confirm_event is not None:
            call_ids = []
            for tc in confirm_event.tool_calls:
                call_id = f"tc_{get_session().tool_counter}"
                get_session().tool_counter += 1
                call_ids.append(call_id)
                try:
                    tc_input = json.loads(tc.input) if tc.input else {}
                except (json.JSONDecodeError, TypeError):
                    tc_input = {}
                logger.info("需要用户确认: tool=%s args=%s", tc.name, json.dumps(tc_input, ensure_ascii=False)[:100])
                await _send_event_async(
                    "confirm_request",
                    call_id=call_id,
                    name=tc.name,
                    args=tc_input,
                )

            confirm_results = []
            for i, tc in enumerate(confirm_event.tool_calls):
                call_id = call_ids[i]
                future: asyncio.Future = asyncio.get_event_loop().create_future()
                get_session().pending[call_id] = future
                try:
                    result = await asyncio.wait_for(future, timeout=120)
                    confirmed = not (
                        isinstance(result, dict) and result.get("rejected")
                    )
                except asyncio.TimeoutError:
                    get_session().pending.pop(call_id, None)
                    confirmed = True

                confirm_results.append(
                    ConfirmResult(confirmed=confirmed, tool_call=tc)
                )

            inputs = UserConfirmResultEvent(
                reply_id=confirm_event.reply_id,
                confirm_results=confirm_results,
            )
            continue

        if exc_event is None:
            await _send_event_async("done")
            return

        tool_results = []
        for tc in exc_event.tool_calls:
            call_id = f"tc_{get_session().tool_counter}"
            get_session().tool_counter += 1

            try:
                tc_input = json.loads(tc.input) if tc.input else {}
            except (json.JSONDecodeError, TypeError):
                tc_input = {}

            logger.info("工具调用: tool=%s args=%s", tc.name, json.dumps(tc_input, ensure_ascii=False)[:100])
            await _send_event_async(
                "tool_call",
                call_id=call_id,
                name=tc.name,
                args=tc_input,
            )

            future: asyncio.Future = asyncio.get_event_loop().create_future()
            get_session().pending[call_id] = future

            try:
                result = await asyncio.wait_for(future, timeout=30)
            except asyncio.TimeoutError:
                get_session().pending.pop(call_id, None)
                result = {"error": f"工具 '{tc.name}' 执行超时"}
                logger.warning("工具执行超时: tool=%s call_id=%s", tc.name, call_id)

            result_text = (
                json.dumps(result, ensure_ascii=False)
                if isinstance(result, dict)
                else str(result)
            )

            has_error = isinstance(result, dict) and result.get("error")
            logger.info("工具结果: tool=%s error=%s result=%s", tc.name, has_error, result_text[:100])

            tr = ToolResultBlock(
                id=tc.id,
                name=tc.name,
                output=[TextBlock(type="text", text=result_text)],
                state=ToolResultState.SUCCESS
                if not (isinstance(result, dict) and result.get("error"))
                else ToolResultState.ERROR,
            )
            tool_results.append(tr)

        inputs = ExternalExecutionResultEvent(
            reply_id=exc_event.reply_id,
            execution_results=tool_results,
        )
