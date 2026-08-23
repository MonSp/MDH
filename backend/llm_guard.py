"""
LLM 守卫工具 — 统一的 LLM 调用超时与重试守卫。

对齐 dsh guard 包理念：所有 LLM 调用必须有超时保护，
超时后 fail-closed（抛异常而非静默降级）。
"""

import asyncio
import logging
from typing import Any, Optional

logger = logging.getLogger("llm_guard")

# 默认超时（秒）
DEFAULT_LLM_TIMEOUT = 120
# LLM 调用最大重试次数
DEFAULT_MAX_RETRIES = 2
# 重试退避基数（秒）
RETRY_BACKOFF_BASE = 2.0


async def safe_llm_reply(
    model: Any,
    msg: Any,
    timeout: float = DEFAULT_LLM_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
    on_timeout: Optional[Any] = None,
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
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            result = await asyncio.wait_for(
                model.reply(msg),
                timeout=timeout,
            )
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
