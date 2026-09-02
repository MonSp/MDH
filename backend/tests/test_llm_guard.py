"""Tests for llm_guard — safe_llm_reply timeout and retry behavior"""
import asyncio

import pytest

from llm_cache import llm_cache
from llm_guard import safe_llm_call, safe_llm_reply


@pytest.fixture(autouse=True)
def _clear_llm_cache():
    """每个测试前清空 LLM 缓存，避免测试间干扰"""
    llm_cache.clear()
    yield
    llm_cache.clear()


class MockModel:
    """模拟 LLM 模型"""
    def __init__(self, responses=None, delay=0):
        self._responses = responses or ["response"]
        self._call_count = 0
        self._delay = delay

    async def reply(self, msg):
        if self._delay:
            await asyncio.sleep(self._delay)
        idx = self._call_count
        self._call_count += 1
        if idx < len(self._responses):
            resp = self._responses[idx]
            if isinstance(resp, Exception):
                raise resp
            return resp
        return self._responses[-1]


@pytest.mark.asyncio
async def test_safe_llm_reply_normal():
    model = MockModel(["hello"])
    result = await safe_llm_reply(model, "msg", timeout=5)
    assert result == "hello"


@pytest.mark.asyncio
async def test_safe_llm_reply_timeout_retries():
    """超时后重试，最终成功"""
    call_count = 0

    class SlowThenFast:
        async def reply(self, msg):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                await asyncio.sleep(10)  # 超时
            return "ok"

    model = SlowThenFast()
    result = await safe_llm_reply(model, "msg", timeout=0.1, max_retries=1)
    assert result == "ok"
    assert call_count == 2


@pytest.mark.asyncio
async def test_safe_llm_reply_timeout_exhausted():
    """重试耗尽后抛出 TimeoutError"""
    model = MockModel(delay=10)
    with pytest.raises(asyncio.TimeoutError, match="超时"):
        await safe_llm_reply(model, "msg", timeout=0.05, max_retries=0)


@pytest.mark.asyncio
async def test_safe_llm_reply_exception_propagates():
    """非超时异常直接传播"""
    model = MockModel([ValueError("bad")])
    with pytest.raises(ValueError, match="bad"):
        await safe_llm_reply(model, "msg", timeout=5)


@pytest.mark.asyncio
async def test_safe_llm_reply_on_timeout_callback():
    """超时时调用 on_timeout 回调"""
    callback_called = False

    def on_timeout():
        nonlocal callback_called
        callback_called = True

    model = MockModel(delay=10)
    with pytest.raises(asyncio.TimeoutError):
        await safe_llm_reply(model, "msg", timeout=0.05, max_retries=0, on_timeout=on_timeout)
    assert callback_called


@pytest.mark.asyncio
async def test_safe_llm_call_normal():
    async def coro():
        return 42

    result = await safe_llm_call(coro(), timeout=5)
    assert result == 42


@pytest.mark.asyncio
async def test_safe_llm_call_timeout():
    async def slow():
        await asyncio.sleep(10)

    with pytest.raises(asyncio.TimeoutError):
        await safe_llm_call(slow(), timeout=0.05, description="test")
