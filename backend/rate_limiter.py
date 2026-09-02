"""
HTTP 请求速率限制（Rate Limiting）

使用 slowapi 实现 per-group 限速：
- read:     GET 端点          100次/分钟
- write:    POST/PUT/DELETE    30次/分钟
- llm:      LLM 依赖端点      10次/分钟
- feedback: 反馈/审批端点      20次/分钟
- admin:    管理端点           10次/分钟
- websocket: WS 消息           60次/分钟（独立实现）
"""

import time
from collections import defaultdict

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

# ── 速率限制分组 ──
RATE_LIMITS = {
    "read": "100/minute",      # GET endpoints
    "write": "30/minute",      # POST/PUT/DELETE
    "llm": "10/minute",        # LLM-dependent endpoints
    "feedback": "20/minute",   # feedback/review endpoints
    "admin": "10/minute",      # admin endpoints
    "websocket": "60/minute",  # WS messages
}

# slowapi Limiter 实例（基于客户端 IP 地址限速）
limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """自定义 429 响应（中文提示 + Retry-After 头）"""
    detail = str(exc.detail) if exc.detail else ""
    # 从 detail 中提取窗口大小（如 "10/minute" → "60"）
    if "/" in detail:
        window = detail.split("/")[1].strip()
        retry_map = {"second": "1", "minute": "60", "hour": "3600"}
        retry_after = retry_map.get(window, "60")
    else:
        retry_after = "60"
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": "请求过于频繁，请稍后重试",
            "retry_after": detail,
        },
        headers={"Retry-After": retry_after},
    )


# ── WebSocket 速率限制器（独立于 slowapi） ──

class WSRateLimiter:
    """滑动窗口速率限制器，用于 WebSocket 消息限速。

    按 client_id 维护时间窗口，超限时返回 False。
    线程安全：asyncio 单线程模型下无需加锁。
    """

    def __init__(self, max_per_minute: int = 60):
        self._max = max_per_minute
        self._counts: dict[str, list[float]] = defaultdict(list)

    def allow(self, client_id: str) -> bool:
        """检查 client_id 是否允许发送新消息。

        Returns:
            True: 允许，False: 超限（调用方应返回错误消息）
        """
        now = time.time()
        window = now - 60
        # 清理窗口外的旧时间戳
        self._counts[client_id] = [t for t in self._counts[client_id] if t > window]
        if len(self._counts[client_id]) >= self._max:
            return False
        self._counts[client_id].append(now)
        return True

    def cleanup(self, max_age: int = 300):
        """清理长时间不活跃的客户端记录（可选，定期调用）"""
        cutoff = time.time() - max_age
        stale = [k for k, v in self._counts.items() if not v or v[-1] < cutoff]
        for k in stale:
            del self._counts[k]


# 全局 WS 限速器实例
ws_limiter = WSRateLimiter(max_per_minute=60)
