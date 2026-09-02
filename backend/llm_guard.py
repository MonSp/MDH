"""
LLM 守卫工具 — 统一的 LLM 调用超时与重试守卫。

对齐 dsh guard 包理念：所有 LLM 调用必须有超时保护，
超时后 fail-closed（抛异常而非静默降级）。
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger("llm_guard")

# 默认超时（秒）
DEFAULT_LLM_TIMEOUT = 120
# LLM 调用最大重试次数
DEFAULT_MAX_RETRIES = 2
# 重试退避基数（秒）
RETRY_BACKOFF_BASE = 2.0


def _extract_prompt_text(msg: Any) -> str:
    """从消息对象中提取纯文本用于缓存 key

    支持 AgentScope Msg 和普通字符串。
    规范化空白字符以提高缓存命中率。
    """
    import re
    text = ""
    if isinstance(msg, str):
        text = msg
    elif hasattr(msg, 'content'):
        content = msg.content
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get('type') == 'text':
                    parts.append(item.get('text', ''))
                elif isinstance(item, str):
                    parts.append(item)
            text = ' '.join(parts)
    # 规范化：去除多余空白、时间戳、UUID
    if text:
        text = re.sub(r'\s+', ' ', text).strip()
        text = re.sub(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?', '', text)
        text = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', text)
    return text[:2000]  # 截断避免过长 key


async def safe_llm_reply(
    model: Any,
    msg: Any,
    timeout: float = DEFAULT_LLM_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
    on_timeout: Any | None = None,
) -> Any:
    """带超时和重试的 LLM 调用守卫。

    Args:
        model: AgentScope Agent 实例（需有 reply 方法）
        msg: 消息对象
        timeout: 超时秒数（默认 120s）
        max_retries: 最大重试次数（默认 2）
        on_timeout: 超时回调（可选，用于 failover 通知）

    Returns:
        model.reply 的返回值

    Raises:
        asyncio.TimeoutError: 超时且重试耗尽
        Exception: 模型调用的原始异常
    """
    from llm_cache import llm_cache

    # 缓存检查：提取 prompt 文本用于缓存 key
    prompt_text = _extract_prompt_text(msg)
    if prompt_text:
        cached = llm_cache.get(prompt_text, role=getattr(model, 'name', ''), model=str(type(model).__name__))
        if cached is not None:
            logger.debug("LLM 缓存命中: %s...", prompt_text[:50])
            return cached

    last_error = None

    for attempt in range(max_retries + 1):
        try:
            result = await asyncio.wait_for(
                model.reply(msg),
                timeout=timeout,
            )
            # 缓存结果
            if prompt_text:
                llm_cache.put(prompt_text, result, role=getattr(model, 'name', ''), model=str(type(model).__name__))
            return result
        except asyncio.TimeoutError:
            last_error = asyncio.TimeoutError(
                f"LLM 调用超时 ({timeout}s, attempt {attempt + 1}/{max_retries + 1})"
            )
            logger.warning("LLM 调用超时: attempt=%d/%d timeout=%ds",
                          attempt + 1, max_retries + 1, timeout)
            if on_timeout:
                try:
                    on_timeout()
                except Exception as e:
                    logger.debug("on_timeout 回调失败: %s", e)
            if attempt < max_retries:
                backoff = RETRY_BACKOFF_BASE * (2 ** attempt)
                await asyncio.sleep(backoff)
        except Exception as e:
            logger.error("LLM 调用异常: %s", e)
            raise

    raise last_error


async def safe_llm_call(
    coro: Any,
    timeout: float = DEFAULT_LLM_TIMEOUT,
    description: str = "LLM call",
) -> Any:
    """通用异步调用超时守卫（不限于 model.reply）。

    Args:
        coro: 协程对象
        timeout: 超时秒数
        description: 描述（用于日志）

    Returns:
        协程的返回值

    Raises:
        asyncio.TimeoutError: 超时
    """
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("%s 超时 (%ds)", description, timeout)
        raise
