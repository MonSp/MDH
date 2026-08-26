"""Tests for TTLCache — 性能缓存"""
import time
from cache import TTLCache, get_cache


class TestTTLCache:
    def test_set_and_get(self):
        cache = TTLCache(default_ttl=10)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

    def test_ttl_expiry(self):
        cache = TTLCache(default_ttl=1)
        cache.set("key1", "value1", ttl=1)
        assert cache.get("key1") == "value1"
        time.sleep(1.1)
        assert cache.get("key1") is None

    def test_invalidate(self):
        cache = TTLCache()
        cache.set("key1", "value1")
        cache.invalidate("key1")
        assert cache.get("key1") is None

    def test_invalidate_prefix(self):
        cache = TTLCache()
        cache.set("profile:a1", "data1")
        cache.set("profile:a2", "data2")
        cache.set("rule:r1", "data3")
        removed = cache.invalidate_prefix("profile:")
        assert removed == 2
        assert cache.get("rule:r1") == "data3"

    def test_clear(self):
        cache = TTLCache()
        cache.set("a", 1)
        cache.set("b", 2)
        cache.clear()
        assert cache.get("a") is None

    def test_stats(self):
        cache = TTLCache()
        cache.set("a", 1)
        cache.get("a")  # hit
        cache.get("b")  # miss
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["hit_rate"] == 0.5

    def test_cleanup(self):
        cache = TTLCache(default_ttl=1)
        cache.set("a", 1, ttl=1)
        time.sleep(1.1)
        removed = cache.cleanup()
        assert removed == 1

    def test_global_cache(self):
        cache = get_cache()
        cache.set("test", 42)
        assert cache.get("test") == 42
        cache.invalidate("test")
