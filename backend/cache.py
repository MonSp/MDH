"""性能缓存层 — 热数据内存缓存 + 查询结果缓存

受 Cumora 'cost model as architecture' 启发，
减少重复计算和数据库查询。
"""

import threading
import time
from collections.abc import Callable
from typing import Any


class TTLCache:
    """带 TTL 的内存缓存（线程安全）"""

    def __init__(self, default_ttl: int = 60):
        self._store: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Any | None:
        """获取缓存值"""
        with self._lock:
            entry = self._store.get(key)
            if entry and entry["expires"] > time.time():
                self._hits += 1
                return entry["value"]
            if entry:
                del self._store[key]
            self._misses += 1
            return None

    def set(self, key: str, value: Any, ttl: int = 0) -> None:
        """设置缓存值"""
        ttl = ttl or self._default_ttl
        with self._lock:
            self._store[key] = {
                "value": value,
                "expires": time.time() + ttl,
            }

    def invalidate(self, key: str) -> None:
        """失效指定 key"""
        with self._lock:
            self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """失效所有以 prefix 开头的 key"""
        with self._lock:
            keys_to_delete = [k for k in self._store if k.startswith(prefix)]
            for k in keys_to_delete:
                del self._store[k]
            return len(keys_to_delete)

    def clear(self) -> None:
        """清空缓存"""
        with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        """缓存统计"""
        with self._lock:
            total = self._hits + self._misses
            return {
                "size": len(self._store),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / total, 4) if total > 0 else 0,
            }

    def cleanup(self) -> int:
        """清理过期条目"""
        now = time.time()
        with self._lock:
            expired = [k for k, v in self._store.items() if v["expires"] <= now]
            for k in expired:
                del self._store[k]
            return len(expired)


# 全局缓存实例
_cache = TTLCache(default_ttl=120)  # 默认 2 分钟 TTL


def get_cache() -> TTLCache:
    """获取全局缓存实例"""
    return _cache


def cached(key: str, ttl: int = 120):
    """缓存装饰器（用于同步函数）— key 自动包含函数参数"""
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            cache = get_cache()
            # 从 args/kwargs 生成唯一缓存 key
            cache_key = f"{key}:{hash((args, tuple(sorted(kwargs.items()))))}"
            result = cache.get(cache_key)
            if result is not None:
                return result
            value = func(*args, **kwargs)
            cache.set(cache_key, value, ttl)
            return value
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    return decorator
