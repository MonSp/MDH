"""Tests for llm_cache.py — LLM response caching"""
import time
import pytest
from llm_cache import LLMCache, CacheEntry


class TestCacheEntry:
    def test_not_expired(self):
        entry = CacheEntry(key="k", response="r", created_at=time.time(), ttl=300)
        assert entry.expired is False

    def test_expired(self):
        entry = CacheEntry(key="k", response="r", created_at=time.time() - 400, ttl=300)
        assert entry.expired is True


class TestLLMCache:
    def test_put_and_get(self):
        cache = LLMCache()
        cache.put("hello", "world")
        assert cache.get("hello") == "world"

    def test_get_miss(self):
        cache = LLMCache()
        assert cache.get("nonexistent") is None

    def test_ttl_expiry(self):
        cache = LLMCache(ttl=0.1)
        cache.put("hello", "world")
        time.sleep(0.15)
        assert cache.get("hello") is None

    def test_hit_count(self):
        cache = LLMCache()
        cache.put("hello", "world")
        cache.get("hello")
        cache.get("hello")
        entry = cache._cache[cache._make_key("hello")]
        assert entry.hit_count == 2

    def test_stats(self):
        cache = LLMCache()
        cache.put("a", "1")
        cache.get("a")  # hit
        cache.get("b")  # miss
        stats = cache.stats
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["size"] == 1
        assert stats["hit_rate"] == 0.5

    def test_stats_no_access(self):
        cache = LLMCache()
        stats = cache.stats
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0

    def test_max_size_eviction(self):
        cache = LLMCache(max_size=2)
        cache.put("a", "1")
        time.sleep(0.01)
        cache.put("b", "2")
        time.sleep(0.01)
        cache.put("c", "3")  # should evict "a"
        assert cache.get("a") is None
        assert cache.get("b") == "2"
        assert cache.get("c") == "3"

    def test_clear(self):
        cache = LLMCache()
        cache.put("a", "1")
        cache.put("b", "2")
        cache.clear()
        assert cache.stats["size"] == 0

    def test_key_includes_role_and_model(self):
        cache = LLMCache()
        cache.put("hello", "r1", role="planner")
        cache.put("hello", "r2", role="executor")
        cache.put("hello", "r3", model="gpt-4")
        assert cache.get("hello", role="planner") == "r1"
        assert cache.get("hello", role="executor") == "r2"
        assert cache.get("hello", model="gpt-4") == "r3"
        assert cache.get("hello") is None  # different key (no role/model)

    def test_expired_entry_removed_on_get(self):
        cache = LLMCache(ttl=0.05)
        cache.put("hello", "world")
        time.sleep(0.1)
        cache.get("hello")  # should remove expired entry
        assert cache.stats["size"] == 0
