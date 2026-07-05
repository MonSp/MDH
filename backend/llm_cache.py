"""LLM 响应缓存 — 避免重复调用相同 prompt 的 LLM"""

import hashlib
import time
from typing import Optional, Dict, Any
from dataclasses import dataclass, field


@dataclass
class CacheEntry:
    key: str
    response: Any
    created_at: float
    hit_count: int = 0
    ttl: float = 300.0  # 5 分钟 TTL

    @property
    def expired(self) -> bool:
        return time.time() - self.created_at > self.ttl


class LLMCache:
    """简单的 LLM 响应缓存"""

    def __init__(self, max_size: int = 100, ttl: float = 300.0):
        self._cache: Dict[str, CacheEntry] = {}
        self._max_size = max_size
        self._ttl = ttl
        self._hits = 0
        self._misses = 0

    def _make_key(self, prompt: str, role: str = "", model: str = "") -> str:
        content = f"{role}:{model}:{prompt}"
        return hashlib.md5(content.encode()).hexdigest()

    def get(self, prompt: str, role: str = "", model: str = "") -> Optional[Any]:
        key = self._make_key(prompt, role, model)
        entry = self._cache.get(key)
        if entry and not entry.expired:
            entry.hit_count += 1
            self._hits += 1
            return entry.response
        if entry:
            del self._cache[key]
        self._misses += 1
        return None

    def put(self, prompt: str, response: Any, role: str = "", model: str = "") -> None:
        if len(self._cache) >= self._max_size:
            self._evict()
        key = self._make_key(prompt, role, model)
        self._cache[key] = CacheEntry(
            key=key, response=response,
            created_at=time.time(), ttl=self._ttl,
        )

    def _evict(self) -> None:
        if not self._cache:
            return
        oldest_key = min(self._cache, key=lambda k: self._cache[k].created_at)
        del self._cache[oldest_key]

    def clear(self) -> None:
        self._cache.clear()

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / total if total > 0 else 0,
        }


# 全局缓存实例
llm_cache = LLMCache()
