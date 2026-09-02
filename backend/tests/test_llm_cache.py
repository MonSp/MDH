"""Tests for llm_cache.py — LLM response caching (SQLite + 语义规范化 + 分层 TTL)"""
import time

from llm_cache import TTL_PRESETS, LLMCache, classify_prompt_type, normalize_prompt


class TestNormalizePrompt:
    def test_whitespace_normalized(self):
        assert normalize_prompt("  hello   world  ") == "hello world"

    def test_timestamp_removed(self):
        result = normalize_prompt("task at 2026-08-23T21:25:11 done")
        assert "2026" not in result

    def test_uuid_removed(self):
        result = normalize_prompt("id: 550e8400-e29b-41d4-a716-446655440000 done")
        assert "550e8400" not in result

    def test_large_number_normalized(self):
        result = normalize_prompt("count: 12345 items")
        assert "12345" not in result
        assert "#" in result

    def test_file_path_removed(self):
        result = normalize_prompt("read /home/user/file.py content")
        assert "/home/user" not in result

    def test_empty_string(self):
        assert normalize_prompt("") == ""


class TestClassifyPrompt:
    def test_deterministic(self):
        assert classify_prompt_type("请判断这个任务的复杂度") == "deterministic"

    def test_review(self):
        assert classify_prompt_type("审查以下代码的质量") == "review"

    def test_creative(self):
        assert classify_prompt_type("实现一个排序函数") == "creative"

    def test_default(self):
        assert classify_prompt_type("hello") == "default"


class TestLLMCache:
    def test_put_and_get(self):
        cache = LLMCache()
        cache.put("hello", "world")
        assert cache.get("hello") == "world"

    def test_get_miss(self):
        cache = LLMCache()
        assert cache.get("nonexistent") is None

    def test_ttl_expiry(self):
        cache = LLMCache(default_ttl=0.1)
        cache.put("hello", "world")
        time.sleep(0.15)
        assert cache.get("hello") is None

    def test_hit_count(self):
        cache = LLMCache()
        cache.put("hello", "world")
        cache.get("hello")
        cache.get("hello")
        key = cache._make_key("hello")
        assert cache._cache[key]["hit_count"] == 2

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
        cache = LLMCache(default_ttl=0.05)
        cache.put("hello", "world")
        time.sleep(0.1)
        cache.get("hello")  # should remove expired entry
        assert cache.stats["size"] == 0

    def test_tiered_ttl(self):
        cache = LLMCache()
        # 创意任务用短 TTL
        cache.put("实现一个排序函数", "code")
        key_creative = cache._make_key("实现一个排序函数")
        assert cache._cache[key_creative]["ttl"] == TTL_PRESETS["creative"]

        # 审查任务用中 TTL
        cache.put("审查以下代码", "review")
        key_review = cache._make_key("审查以下代码")
        assert cache._cache[key_review]["ttl"] == TTL_PRESETS["review"]

    def test_stats_by_type(self):
        cache = LLMCache()
        cache.put("请判断是否正确", "yes")
        cache.put("实现一个函数", "code")
        stats = cache.stats
        assert "by_type" in stats
        assert stats["by_type"].get("deterministic", 0) >= 1
        assert stats["by_type"].get("creative", 0) >= 1

    def test_normalization_improves_hit_rate(self):
        cache = LLMCache()
        # 两个相似 prompt（仅时间戳不同）应该命中同一缓存
        cache.put("任务在 2026-08-23T10:00:00 完成", "result1")
        result = cache.get("任务在 2026-08-23T15:30:00 完成")
        assert result == "result1"  # 规范化后命中


class TestSQLiteCache:
    def test_persistence(self, tmp_path):
        db_path = str(tmp_path / "test_cache.db")
        cache1 = LLMCache(db_path=db_path)
        cache1.put("hello", "world")
        # 创建新实例模拟重启
        cache2 = LLMCache(db_path=db_path)
        result = cache2.get("hello")
        assert result == "world"

    def test_cleanup_expired(self, tmp_path):
        db_path = str(tmp_path / "test_cache.db")
        cache = LLMCache(default_ttl=0.05, db_path=db_path)
        cache.put("a", "1")
        time.sleep(0.1)
        removed = cache.cleanup_expired()
        assert removed >= 1
        assert cache.stats["size"] == 0
