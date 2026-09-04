"""
chat_agent — 轻量级 Agent 类，替代 agentscope.agent.Agent

提供与 agentscope 兼容的 reply() 接口，内部使用 llm_client.LLMClient。

用法：
    from llm_client import LLMClient
    from chat_agent import ChatAgent, Msg

    client = LLMClient(api_key="sk-...", provider="deepseek")
    agent = ChatAgent(name="ceo", system_prompt="你是CTO", client=client)
    response = await agent.reply(Msg(name="user", role="user", content="你好"))
    print(response.text)
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from llm_client import LLMClient

logger = logging.getLogger("chat_agent")


@dataclass
class Msg:
    """消息对象 — 兼容 agentscope.message.Msg 接口"""
    name: str = ""
    role: str = "user"
    content: Any = ""
    # 兼容字段
    url: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def __init__(self, name: str = "", role: str = "user", content: Any = "", **kwargs):
        self.name = name
        self.role = role
        self.content = content
        self.metadata = kwargs

    @property
    def text(self) -> str:
        """提取纯文本"""
        if isinstance(self.content, str):
            return self.content
        if isinstance(self.content, list):
            parts = []
            for block in self.content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        parts.append(block.get("text", ""))
                elif hasattr(block, "text"):
                    parts.append(block.text)
                elif isinstance(block, str):
                    parts.append(block)
            return " ".join(parts)
        return str(self.content) if self.content else ""

    def to_openai_message(self) -> dict[str, Any]:
        """转换为 OpenAI API 消息格式"""
        text = self.text
        return {"role": self.role, "content": text}


def extract_text(msg: Any) -> str:
    """从 Msg 或 agentscope Msg 提取纯文本（兼容两者）"""
    if isinstance(msg, Msg):
        return msg.text
    # 兼容 agentscope Msg
    if hasattr(msg, "content"):
        content = msg.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        parts.append(block.get("text", ""))
                elif hasattr(block, "text"):
                    parts.append(block.text)
            return " ".join(parts)
    return str(msg) if msg else ""


class ChatAgent:
    """轻量级 Agent — 替代 agentscope.agent.Agent

    接口兼容：reply(msg) -> Msg
    """

    def __init__(
        self,
        name: str = "agent",
        system_prompt: str = "",
        client: LLMClient | None = None,
        max_history: int = 20,
    ):
        self.name = name
        self.system_prompt = system_prompt
        self._client = client
        self._history: list[dict[str, Any]] = []
        self._max_history = max_history

    def set_client(self, client: LLMClient):
        """设置 LLM 客户端"""
        self._client = client

    def _build_messages(self, user_msg: Msg) -> list[dict[str, Any]]:
        """构建完整消息列表（system + history + current）"""
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.extend(self._history)
        messages.append(user_msg.to_openai_message())
        return messages

    def _trim_history(self):
        """裁剪历史到最大长度"""
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

    async def reply(self, msg: Any) -> Msg:
        """回复消息 — 兼容 agentscope Agent.reply() 接口

        Args:
            msg: Msg 对象或任何有 .content 属性的对象

        Returns:
            Msg 对象（assistant 角色）
        """
        if not self._client:
            raise RuntimeError(f"ChatAgent '{self.name}' 未配置 LLM 客户端")

        # 兼容 agentscope Msg
        if isinstance(msg, Msg):
            user_msg = msg
        else:
            user_msg = Msg(
                name=getattr(msg, "name", "user"),
                role=getattr(msg, "role", "user"),
                content=getattr(msg, "content", str(msg)),
            )

        messages = self._build_messages(user_msg)

        try:
            response = await self._client.chat(messages)
            assistant_msg = Msg(
                name=self.name,
                role="assistant",
                content=response.content,
            )

            # 更新历史
            self._history.append(user_msg.to_openai_message())
            self._history.append({"role": "assistant", "content": response.content})
            self._trim_history()

            return assistant_msg
        except Exception as e:
            logger.error("ChatAgent '%s' reply 失败: %s", self.name, e)
            raise

    async def reply_stream(self, msg: Any):
        """流式回复 — yield 文本片段

        Args:
            msg: Msg 对象

        Yields:
            str: 文本片段
        """
        if not self._client:
            raise RuntimeError(f"ChatAgent '{self.name}' 未配置 LLM 客户端")

        if isinstance(msg, Msg):
            user_msg = msg
        else:
            user_msg = Msg(
                name=getattr(msg, "name", "user"),
                role=getattr(msg, "role", "user"),
                content=getattr(msg, "content", str(msg)),
            )

        messages = self._build_messages(user_msg)
        full_content = ""

        try:
            async for chunk in self._client.chat_stream(messages):
                full_content += chunk
                yield chunk

            # 更新历史
            self._history.append(user_msg.to_openai_message())
            self._history.append({"role": "assistant", "content": full_content})
            self._trim_history()
        except Exception as e:
            logger.error("ChatAgent '%s' reply_stream 失败: %s", self.name, e)
            raise

    def reset(self):
        """清空对话历史"""
        self._history.clear()
