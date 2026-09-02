"""
速率限制测试

验证 HTTP 速率限制（slowapi）和 WebSocket 速率限制器的功能。
"""

import json
import time
from unittest.mock import MagicMock

# backend/ 路径已在 conftest.py 中添加
from rate_limiter import (
    RATE_LIMITS,
    WSRateLimiter,
    limiter,
    rate_limit_exceeded_handler,
)


def _make_mock_limit(detail: str = "10/minute"):
    """构造 mock Limit 对象，用于构造 RateLimitExceeded"""
    limit = MagicMock()
    limit.error_message = None
    limit.limit = detail
    return limit


def _make_request():
    """构造 mock starlette Request"""
    from starlette.requests import Request
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/test",
        "headers": [],
    }
    return Request(scope)


# ── HTTP 速率限制测试 ──


class TestHTTPRateLimiter:
    """测试 slowapi HTTP 速率限制集成"""

    def test_rate_limit_definitions_exist(self):
        """验证所有速率限制分组已定义"""
        assert "read" in RATE_LIMITS
        assert "write" in RATE_LIMITS
        assert "llm" in RATE_LIMITS
        assert "feedback" in RATE_LIMITS
        assert "admin" in RATE_LIMITS
        assert "websocket" in RATE_LIMITS

    def test_rate_limit_values_format(self):
        """验证速率限制值格式正确（N/period）"""
        for group, limit_str in RATE_LIMITS.items():
            assert "/" in limit_str, f"{group} limit 无效格式: {limit_str}"
            count, period = limit_str.split("/")
            assert count.isdigit(), f"{group} count 非数字: {count}"
            assert period in ("second", "minute", "hour"), f"{group} period 无效: {period}"

    def test_rate_limit_values_correct(self):
        """验证各分组速率限制值正确"""
        assert RATE_LIMITS["read"] == "100/minute"
        assert RATE_LIMITS["write"] == "30/minute"
        assert RATE_LIMITS["llm"] == "10/minute"
        assert RATE_LIMITS["feedback"] == "20/minute"
        assert RATE_LIMITS["admin"] == "10/minute"
        assert RATE_LIMITS["websocket"] == "60/minute"

    def test_limiter_instance_created(self):
        """验证 limiter 实例正确创建"""
        assert limiter is not None
        assert hasattr(limiter, "limit")

    def test_rate_limit_exceeded_handler_returns_429(self):
        """验证 429 处理函数返回正确格式"""
        from slowapi.errors import RateLimitExceeded
        request = _make_request()
        exc = RateLimitExceeded(_make_mock_limit("10/minute"))

        response = rate_limit_exceeded_handler(request, exc)
        assert response.status_code == 429

    def test_rate_limit_exceeded_response_content(self):
        """验证 429 响应体包含中文错误信息"""
        from slowapi.errors import RateLimitExceeded
        request = _make_request()
        exc = RateLimitExceeded(_make_mock_limit("10/minute"))

        response = rate_limit_exceeded_handler(request, exc)
        body = json.loads(response.body.decode())
        assert body["success"] is False
        assert "请求过于频繁" in body["error"]
        assert body["retry_after"] == "10/minute"

    def test_rate_limit_exceeded_has_retry_after_header(self):
        """验证 429 响应包含 Retry-After 头"""
        from slowapi.errors import RateLimitExceeded
        request = _make_request()
        exc = RateLimitExceeded(_make_mock_limit("10/minute"))

        response = rate_limit_exceeded_handler(request, exc)
        assert "Retry-After" in response.headers
        assert response.headers["Retry-After"] == "60"

    def test_rate_limit_exceeded_second_window(self):
        """验证秒级窗口的 Retry-After 计算"""
        from slowapi.errors import RateLimitExceeded
        request = _make_request()
        exc = RateLimitExceeded(_make_mock_limit("5/second"))

        response = rate_limit_exceeded_handler(request, exc)
        assert response.headers["Retry-After"] == "1"


# ── WebSocket 速率限制测试 ──


class TestWSRateLimiter:
    """测试 WebSocket 消息速率限制器"""

    def test_ws_rate_limiter_allows_normal_traffic(self):
        """正常消息流量应该全部通过"""
        wsrl = WSRateLimiter(max_per_minute=10)
        client = "test-client-1"

        # 发送 10 条消息（等于限制），全部应通过
        for i in range(10):
            assert wsrl.allow(client) is True, f"第 {i+1} 条消息应被允许"

    def test_ws_rate_limiter_blocks_excess(self):
        """超过限制的消息应被拦截"""
        wsrl = WSRateLimiter(max_per_minute=5)
        client = "test-client-2"

        # 先发送 5 条（等于限制），全部通过
        for i in range(5):
            assert wsrl.allow(client) is True

        # 第 6 条应被拦截
        assert wsrl.allow(client) is False

    def test_ws_rate_limiter_different_clients(self):
        """不同客户端独立限速"""
        wsrl = WSRateLimiter(max_per_minute=3)

        # client-A 用完配额
        for _ in range(3):
            assert wsrl.allow("client-A") is True
        assert wsrl.allow("client-A") is False

        # client-B 应该有独立配额
        assert wsrl.allow("client-B") is True

    def test_ws_rate_limiter_window_slides(self):
        """时间窗口滑动后应恢复允许"""
        wsrl = WSRateLimiter(max_per_minute=3)
        client = "test-client-slide"

        # 用完配额
        for _ in range(3):
            wsrl.allow(client)
        assert wsrl.allow(client) is False

        # 模拟时间滑动：手动修改时间戳使窗口过期
        wsrl._counts[client] = [time.time() - 61, time.time() - 61, time.time() - 61]
        assert wsrl.allow(client) is True

    def test_ws_rate_limiter_cleanup(self):
        """清理不活跃客户端记录"""
        wsrl = WSRateLimiter(max_per_minute=10)

        # 添加几个客户端
        wsrl.allow("active-client")
        wsrl._counts["stale-client"] = [time.time() - 600]  # 10 分钟前

        assert "stale-client" in wsrl._counts
        wsrl.cleanup(max_age=300)
        assert "stale-client" not in wsrl._counts
        assert "active-client" in wsrl._counts

    def test_ws_rate_limiter_default_limit(self):
        """验证默认限制为 60/分钟"""
        wsrl = WSRateLimiter()
        client = "default-test"

        # 60 条应全部通过
        for _ in range(60):
            assert wsrl.allow(client) is True

        # 第 61 条应被拦截
        assert wsrl.allow(client) is False

    def test_ws_rate_limiter_empty_client(self):
        """空客户端 ID 应正常工作"""
        wsrl = WSRateLimiter(max_per_minute=5)
        assert wsrl.allow("") is True

    def test_ws_limiter_global_instance(self):
        """验证全局 ws_limiter 实例存在"""
        from rate_limiter import ws_limiter
        assert ws_limiter is not None
        assert ws_limiter._max == 60


# ── 集成验证 ──


class TestRateLimiterIntegration:
    """验证 server.py 中的速率限制集成"""

    def test_server_imports_limiter(self):
        """验证 server.py 能正确导入速率限制模块"""
        # 测试导入链是否完整
        from rate_limiter import (
            RATE_LIMITS,
            limiter,
            rate_limit_exceeded_handler,
            ws_limiter,
        )
        assert limiter is not None
        assert callable(rate_limit_exceeded_handler)
        assert isinstance(RATE_LIMITS, dict)
        assert ws_limiter is not None

    def test_slowapi_installed(self):
        """验证 slowapi 已安装且可用"""
        from slowapi import Limiter
        from slowapi.errors import RateLimitExceeded
        from slowapi.util import get_remote_address
        assert Limiter is not None
        assert RateLimitExceeded is not None
        assert callable(get_remote_address)
