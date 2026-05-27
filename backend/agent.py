import asyncio
import json
import traceback

from agentscope.agent import Agent, ContextConfig
from agentscope.credential import OpenAICredential
from agentscope.event import (
    ExternalExecutionResultEvent,
    RequireExternalExecutionEvent,
    TextBlockDeltaEvent,
    TextBlockEndEvent,
    ThinkingBlockDeltaEvent,
    ThinkingBlockEndEvent,
    ToolCallEndEvent,
    ReplyEndEvent,
    ExceedMaxItersEvent,
)
from agentscope.formatter import DeepSeekChatFormatter
from agentscope.message import Msg, TextBlock, ToolResultBlock, ToolResultState
from agentscope.model import OpenAIChatModel
from agentscope.skill import LocalSkillLoader
from agentscope.tool import FunctionTool, Toolkit

from config import DEEPSEEK_MODEL, SYSTEM_PROMPT, SKILLS_DIR
from session import Session, get_session, _current_session


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

    credential = OpenAICredential(
        api_key=session.api_key,
        base_url=session.base_url,
    )
    formatter = DeepSeekChatFormatter()
    model = OpenAIChatModel(
        credential=credential,
        model=DEEPSEEK_MODEL,
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

            else:
                print(
                    f"[AgentScope] 未处理的流式事件: {type(event).__name__}"
                )

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
