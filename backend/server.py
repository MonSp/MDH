import asyncio
import json
import uuid
import traceback
from contextvars import ContextVar

from agentscope.agent import Agent
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
from agentscope.tool import FunctionTool, Toolkit, ToolResponse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_API_KEY = ""
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_PROMPT = """你是一个浏览器自动化助手。你可以通过调用工具来执行浏览器操作。

可用的工具包括：
- navigate: 导航到指定网页
- search: 搜索内容
- click_button: 点击按钮
- fill_field: 填写表单字段
- scroll: 滚动页面
- wait: 等待指定时间
- get_screenshot: 截图当前页面
- get_tabs: 获取所有标签页列表
- switch_tab: 切换到指定标签页
- create_tab: 新建标签页
- close_tab: 关闭指定标签页
- press_key: 按下键盘按键
- evaluate_js: 在页面中执行 JavaScript 代码

请根据用户的自然语言指令，合理选择并调用工具。如果用户的指令复杂需要多步执行，请按顺序调用工具。

当任务完成后，请简要总结执行结果。"""

_current_session: ContextVar["Session | None"] = ContextVar(
    "_current_session", default=None
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Session:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.session_id = str(uuid.uuid4())[:8]
        self.pending: dict[str, asyncio.Future] = {}
        self.tool_counter = 0
        self.page_context: dict[str, str] = {}
        self.api_key: str = DEEPSEEK_API_KEY
        self.base_url: str = DEEPSEEK_BASE_URL
        self.agent: Agent | None = None

    def build_page_info(self) -> str:
        if not self.page_context.get("url"):
            return ""
        title = self.page_context.get("title", "")
        url = self.page_context.get("url", "")
        return f"\n当前页面: {title + ' (' + url + ')' if title else url}"

    def get_or_create_agent(self) -> Agent:
        if self.agent is not None:
            return self.agent

        credential = OpenAICredential(
            api_key=self.api_key,
            base_url=self.base_url,
        )
        formatter = DeepSeekChatFormatter()
        model = OpenAIChatModel(
            credential=credential,
            model=DEEPSEEK_MODEL,
            stream=True,
            formatter=formatter,
        )
        toolkit = Toolkit(tools=_build_browser_tools())
        self.agent = Agent(
            name="BrowserAgent",
            system_prompt=SYSTEM_PROMPT + self.build_page_info(),
            model=model,
            toolkit=toolkit,
        )
        return self.agent


def get_session() -> Session:
    s = _current_session.get()
    if s is None:
        raise RuntimeError("No session in context")
    return s


def _make_tool_func(name: str, description: str):
    async def tool_func(**kwargs) -> ToolResponse:
        session = get_session()
        call_id = f"tc_{session.tool_counter}"
        session.tool_counter += 1

        future: asyncio.Future = asyncio.get_event_loop().create_future()
        session.pending[call_id] = future

        await session.ws.send_json({
            "type": "tool_call",
            "call_id": call_id,
            "name": name,
            "arguments": kwargs,
        })

        try:
            result = await asyncio.wait_for(future, timeout=30)
        except asyncio.TimeoutError:
            session.pending.pop(call_id, None)
            return ToolResponse(
                content=[{"type": "text", "text": f"工具 '{name}' 执行超时"}],
                state="error",
            )

        if isinstance(result, dict) and result.get("error"):
            return ToolResponse(
                content=[{"type": "text", "text": result.get("error", "未知错误")}],
                state="error",
            )

        result_text = (
            json.dumps(result, ensure_ascii=False)
            if isinstance(result, dict)
            else str(result)
        )
        return ToolResponse(
            content=[{"type": "text", "text": result_text}],
            state="success",
        )

    tool_func.__name__ = name
    return FunctionTool(func=tool_func, name=name, description=description)


def _build_browser_tools() -> list:
    return [
        _make_tool_func("navigate", "导航到指定网页"),
        _make_tool_func("search", "在页面中搜索内容"),
        _make_tool_func("click_button", "点击页面上的按钮或元素"),
        _make_tool_func("fill_field", "填写表单输入字段"),
        _make_tool_func("scroll", "滚动页面（像素值）"),
        _make_tool_func("wait", "等待指定毫秒数"),
        _make_tool_func("get_screenshot", "获取当前页面的截图"),
        _make_tool_func("get_tabs", "获取所有打开的标签页列表"),
        _make_tool_func("switch_tab", "切换到指定标签页"),
        _make_tool_func("create_tab", "新建标签页"),
        _make_tool_func("close_tab", "关闭指定标签页"),
        _make_tool_func("press_key", "按下键盘按键"),
        _make_tool_func("evaluate_js", "在当前页面执行 JavaScript 代码"),
    ]


async def _send_event(event_type: str, **data):
    session = get_session()
    payload = {"type": event_type, **data}
    await session.ws.send_json(payload)


async def run_agent_stream(session: Session, content: str):
    token = _current_session.set(session)
    try:
        agent = session.get_or_create_agent()
        user_msg = Msg(
            name="user",
            role="user",
            content=[{"type": "text", "text": content}],
        )

        await _stream_loop(agent, user_msg)

    except Exception:
        traceback.print_exc()
        await _send_event("error", message="Agent 内部错误，请检查后端日志")
    finally:
        _current_session.reset(token)


async def _stream_loop(agent: Agent, first_input):
    inputs = first_input

    while True:
        exc_event: RequireExternalExecutionEvent | None = None

        async for event in agent.reply_stream(inputs):
            if isinstance(event, ThinkingBlockDeltaEvent):
                await _send_event(
                    "thinking", block_id=event.block_id, delta=event.delta
                )

            elif isinstance(event, ThinkingBlockEndEvent):
                await _send_event("thinking_end")

            elif isinstance(event, TextBlockDeltaEvent):
                await _send_event(
                    "reply_text", block_id=event.block_id, delta=event.delta
                )

            elif isinstance(event, TextBlockEndEvent):
                await _send_event("reply_text_end")

            elif isinstance(event, ToolCallEndEvent):
                pass

            elif isinstance(event, RequireExternalExecutionEvent):
                exc_event = event
                break

            elif isinstance(event, ReplyEndEvent):
                await _send_event("done")
                return

            elif isinstance(event, ExceedMaxItersEvent):
                await _send_event("error", message="Agent 执行超过最大迭代次数")
                return

            elif isinstance(event, Msg):
                text = _extract_text(event)
                await _send_event("done", message=text)
                return

        if exc_event is None:
            await _send_event("done")
            return

        tool_results = []
        for tc in exc_event.tool_calls:
            call_id = f"tc_{get_session().tool_counter}"
            get_session().tool_counter += 1

            try:
                tc_input = json.loads(tc.input) if tc.input else {}
            except (json.JSONDecodeError, TypeError):
                tc_input = {}

            await _send_event(
                "tool_call",
                call_id=call_id,
                name=tc.name,
                arguments=tc_input,
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


sessions: dict[str, Session] = {}


@app.websocket("/ws")
async def ws_handler(ws: WebSocket):
    await ws.accept()
    session = Session(ws)
    sessions[session.session_id] = session

    await ws.send_json({
        "type": "connected",
        "session_id": session.session_id,
    })

    agent_task: asyncio.Task | None = None

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "user_message":
                if msg.get("api_key"):
                    session.api_key = msg["api_key"]
                if msg.get("base_url"):
                    session.base_url = msg["base_url"]
                if msg.get("reset"):
                    session.agent = None

                if agent_task and not agent_task.done():
                    agent_task.cancel()
                    try:
                        await agent_task
                    except asyncio.CancelledError:
                        pass

                agent_task = asyncio.create_task(
                    run_agent_stream(session, msg["content"])
                )

            elif msg_type == "tool_result":
                call_id = msg.get("call_id")
                if call_id and call_id in session.pending:
                    future = session.pending.pop(call_id)
                    if not future.done():
                        future.set_result(msg.get("result", {}))

            elif msg_type == "page_context":
                session.update_page_context(msg.get("context", {}))

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if agent_task and not agent_task.done():
            agent_task.cancel()
            try:
                await agent_task
            except (asyncio.CancelledError, Exception):
                pass
        sessions.pop(session.session_id, None)


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": len(sessions)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
