"""
llm_client — 轻量级 OpenAI 兼容 LLM 客户端

替代 agentscope 的 model 层。所有主流 LLM 提供商（DeepSeek、OpenAI、
Anthropic、DashScope、Gemini、Moonshot、Ollama、xAI）都支持 OpenAI
Chat Completions API 格式，因此用一个统一客户端即可覆盖。

用法：
    client = LLMClient(api_key="sk-...", base_url="https://api.deepseek.com")
    response = await client.chat([{"role": "user", "content": "你好"}])
    # 流式:
    async for chunk in client.chat_stream([{"role": "user", "content": "你好"}]):
        print(chunk, end="")
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("llm_client")

# Provider 默认配置
PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "default_model": "deepseek-chat"},
    "openai": {"base_url": "https://api.openai.com/v1", "default_model": "gpt-4.1"},
    "anthropic": {"base_url": "https://api.anthropic.com/v1", "default_model": "claude-sonnet-4-6"},
    "dashscope": {"base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "default_model": "qwen-plus"},
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "default_model": "gemini-2.5-flash"},
    "moonshot": {"base_url": "https://api.moonshot.cn/v1", "default_model": "moonshot-v1-8k"},
    "ollama": {"base_url": "http://localhost:11434/v1", "default_model": "qwen3-14b"},
    "xai": {"base_url": "https://api.x.ai/v1", "default_model": "grok-4.3"},
    "custom": {"base_url": "", "default_model": ""},
}


@dataclass
class LLMResponse:
    """LLM 响应"""
    content: str = ""
    role: str = "assistant"
    finish_reason: str = ""
    usage: dict[str, int] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


class LLMClient:
    """OpenAI 兼容的 LLM 客户端"""

    def __init__(
        self,
        api_key: str,
        base_url: str = "",
        model: str = "",
        provider: str = "openai",
        timeout: float = 120.0,
    ):
        defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
        self.api_key = api_key
        self.base_url = (base_url or defaults["base_url"]).rstrip("/")
        self.model = model or defaults["default_model"]
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        """非流式聊天补全"""
        client = await self._get_client()
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
            **kwargs,
        }
        resp = await client.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = data.get("choices", [{}])[0]
        msg = choice.get("message", {})
        return LLMResponse(
            content=msg.get("content", ""),
            role=msg.get("role", "assistant"),
            finish_reason=choice.get("finish_reason", ""),
            usage=data.get("usage", {}),
            raw=data,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ):
        """流式聊天补全 — yield 每个 content delta"""
        client = await self._get_client()
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            **kwargs,
        }
        async with client.stream(
            "POST",
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield content
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue
