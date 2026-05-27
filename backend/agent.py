import asyncio
import json
import traceback

from agentscope.agent import Agent, ContextConfig
from agentscope.credential import (
    OpenAICredential,
    AnthropicCredential,
    DashScopeCredential,
    DeepSeekCredential,
    GeminiCredential,
    MoonshotCredential,
    OllamaCredential,
    XAICredential,
)
from agentscope.event import (
    ConfirmResult,
    DataBlockDeltaEvent,
    DataBlockEndEvent,
    DataBlockStartEvent,
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
    ExceedMaxItersEvent,
)
from agentscope.formatter import (
    OpenAIChatFormatter,
    AnthropicChatFormatter,
    DashScopeChatFormatter,
    DeepSeekChatFormatter,
    GeminiChatFormatter,
    MoonshotChatFormatter,
    OllamaChatFormatter,
    XAIChatFormatter,
)
from agentscope.message import Msg, TextBlock, ToolResultBlock, ToolResultState
from agentscope.model import (
    OpenAIChatModel,
    AnthropicChatModel,
    DashScopeChatModel,
    DeepSeekChatModel,
    GeminiChatModel,
    MoonshotChatModel,
    OllamaChatModel,
    XAIChatModel,
)
from agentscope.skill import LocalSkillLoader
from agentscope.tool import FunctionTool, Toolkit

from config import SYSTEM_PROMPT, SKILLS_DIR
from session import Session, get_session, _current_session

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
    async def _noop(**kwargs) -> None:
        pass

    tool = FunctionTool(func=_noop, name=name, description=description)
    tool.is_external_tool = True
    return tool


def _build_browser_tools() -> list:
    return [
        _make_browser_tool("navigate", "导航到指定网页"),
        _make_browser_tool("search", "在页面中搜索内容"),
        _make_browser_tool("click_button", "点击页面上的按钮或元素"),
        _make_browser_tool("fill_field", "填写表单输入字段"),
        _make_browser_tool("scroll", "滚动页面（像素值）"),
        _make_browser_tool("wait", "等待指定毫秒数"),
        _make_browser_tool("get_screenshot", "获取当前页面的截图"),
        _make_browser_tool("get_tabs", "获取所有打开的标签页列表"),
        _make_browser_tool("switch_tab", "切换到指定标签页"),
        _make_browser_tool("create_tab", "新建标签页"),
        _make_browser_tool("close_tab", "关闭指定标签页"),
        _make_browser_tool("press_key", "按下键盘按键"),
        _make_browser_tool("evaluate_js", "在当前页面执行 JavaScript 代码"),
    ]


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


async def run_agent_stream(session: Session, content: str):
    token = _current_session.set(session)
    try:
        agent = _get_or_create_agent(session)
        user_msg = Msg(
            name="user",
            role="user",
            content=[{"type": "text", "text": content}],
        )

        await _stream_loop(agent, user_msg)

    except Exception:
        traceback.print_exc()
        await _send_event_async("error", message="Agent 内部错误，请检查后端日志")
    finally:
        _current_session.reset(token)


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
        tools=_build_browser_tools(),
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
    return session.agent


async def _stream_loop(agent: Agent, first_input):
    inputs = first_input

    while True:
        exc_event: RequireExternalExecutionEvent | None = None
        confirm_event: RequireUserConfirmEvent | None = None

        async for event in agent.reply_stream(inputs):
            if isinstance(event, ThinkingBlockDeltaEvent):
                await _send_event_async(
                    "thinking", block_id=event.block_id, delta=event.delta
                )

            elif isinstance(event, ThinkingBlockEndEvent):
                await _send_event_async("thinking_end")

            elif isinstance(event, TextBlockDeltaEvent):
                await _send_event_async(
                    "reply_text", block_id=event.block_id, delta=event.delta
                )

            elif isinstance(event, TextBlockEndEvent):
                await _send_event_async("reply_text_end")

            elif isinstance(event, ToolCallEndEvent):
                pass

            elif isinstance(event, RequireExternalExecutionEvent):
                exc_event = event
                break

            elif isinstance(event, RequireUserConfirmEvent):
                confirm_event = event
                break

            elif isinstance(event, ReplyEndEvent):
                await _send_event_async("done")
                return

            elif isinstance(event, ExceedMaxItersEvent):
                await _send_event_async("error", message="Agent 执行超过最大迭代次数")
                return

            elif isinstance(event, Msg):
                text = _extract_text(event)
                await _send_event_async("done", message=text)
                return

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
                pass

            else:
                print(
                    f"[AgentScope] 未处理的流式事件: {type(event).__name__}"
                )

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

            result_text = (
                json.dumps(result, ensure_ascii=False)
                if isinstance(result, dict)
                else str(result)
            )

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
