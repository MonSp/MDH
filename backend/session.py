import asyncio
import uuid
from contextvars import ContextVar

from fastapi import WebSocket

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

_current_session: ContextVar["Session | None"] = ContextVar(
    "_current_session", default=None
)

# 消息缓冲区默认上限
DEFAULT_BUFFER_LIMIT = 500


class Session:
    def __init__(self, ws: WebSocket, buffer_limit: int = DEFAULT_BUFFER_LIMIT):
        self.ws = ws
        self.session_id = str(uuid.uuid4())[:8]
        self.pending: dict[str, asyncio.Future] = {}
        self.tool_counter = 0
        self.page_context: dict[str, str] = {}
        self.provider: str = "deepseek"
        self.model_name: str = ""
        self.api_key: str = DEEPSEEK_API_KEY
        self.base_url: str = DEEPSEEK_BASE_URL
        self.multimodal: bool = True
        self.agent = None
        self.meeting_session = None
        self.meeting_mode = False
        self.project_id: str = ""  # 当前会议关联的项目ID
        self.task_id: str = ""     # 当前会议关联的任务ID
        self._message_buffer: list[dict] = []
        self._buffer_limit: int = buffer_limit
        self._sequence_no: int = 0

    def add_to_buffer(self, msg: dict) -> None:
        """添加消息到缓冲区，超出限制时自动移除最旧的消息"""
        if len(self._message_buffer) >= self._buffer_limit:
            self._message_buffer.pop(0)
        self._message_buffer.append(msg)

    def next_sequence(self) -> int:
        """自增并返回序列号"""
        self._sequence_no += 1
        return self._sequence_no

    async def send_error(self, message: str) -> None:
        """发送 meeting_error 消息"""
        await self.ws.send_json({"type": "meeting_error", "message": message})

    async def send_and_buffer(self, msg: dict) -> None:
        """添加到缓冲区并发送"""
        self.add_to_buffer(msg)
        await self.ws.send_json(msg)

    def clear_meeting(self):
        self.meeting_session = None
        self.meeting_mode = False

    def build_page_info(self) -> str:
        if not self.page_context.get("url"):
            return ""
        title = self.page_context.get("title", "")
        url = self.page_context.get("url", "")
        lines = [f"\n当前页面: {title + ' (' + url + ')' if title else url}"]
        tools = self.page_context.get("tools", [])
        if tools:
            tool_names = ", ".join(
                f"{t.get('tool','')}({t.get('label','')})" for t in tools
            )
            lines.append(f"当前页面可用的页面语义工具: {tool_names}")
        return "".join(lines)

    def update_page_context(self, context: dict[str, str]) -> None:
        self.page_context = context


def get_session() -> Session:
    s = _current_session.get()
    if s is None:
        raise RuntimeError("No session in context")
    return s
