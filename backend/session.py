import asyncio
import uuid
from contextvars import ContextVar

from fastapi import WebSocket

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

_current_session: ContextVar["Session | None"] = ContextVar(
    "_current_session", default=None
)


class Session:
    def __init__(self, ws: WebSocket):
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
