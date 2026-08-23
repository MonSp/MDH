"""
LLM 响应缓存 — 持久化 + 语义规范化 + 分层 TTL

优化特性：
1. SQLite 持久化 — 重启不丢失
2. 语义规范化 — 相似 prompt 命中率提升
3. 分层 TTL — 推理/审查长 TTL，创意短 TTL
4. LRU 淘汰 — 超限时淘汰最久未用
5. 统计监控 — 命中率/大小/分层统计
"""

import hashlib
import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("llm_cache")

# ── 分层 TTL 配置 ──
TTL_PRESETS = {
    "deterministic": 600,   # 10 分钟：规则匹配、分类、格式化
    "review": 300,          # 5 分钟：审查、评估
    "creative": 120,        # 2 分钟：代码生成、创意写作
    "default": 300,         # 5 分钟：默认
}


def classify_prompt_type(prompt: str) -> str:
    """根据 prompt 内容判断类型，用于分层 TTL

    Returns:
        "deterministic" | "review" | "creative" | "default"
    """
    lower = prompt.lower()

    # 确定性任务（规则匹配、分类）
    deterministic_signals = [
        "请判断", "是否", "分类", "匹配", "验证", "检查",
        "classify", "verify", "check", "match", "validate",
        "复杂度", "置信度", "风险",
    ]
    if any(s in lower for s in deterministic_signals):
        return "deterministic"

    # 审查任务
    review_signals = [
        "审查", "评估", "review", "evaluate", "audit",
        "改进建议", "质量", "代码审查", "总结",
    ]
    if any(s in lower for s in review_signals):
        return "review"

    # 创意任务（代码生成、写作）
    creative_signals = [
        "实现", "编写", "创建", "开发", "设计",
        "implement", "create", "develop", "write", "build",
        "函数", "组件", "模块", "接口",
    ]
    if any(s in lower for s in creative_signals):
        return "creative"

    return "default"


def normalize_prompt(text: str) -> str:
    """语义规范化 — 提升相似 prompt 的缓存命中率

    处理：
    - 多余空白 → 单空格
    - 时间戳 → 空
    - UUID → 空
    - 数字 → # (保留语义，忽略具体值)
    - 文件路径 → 空 (避免路径差异导致 miss)
    - 行号引用 → 空
    """
    if not text:
        return ""

    # 基础规范化
    text = re.sub(r'\s+', ' ', text).strip()

    # 移除时间戳
    text = re.sub(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?', '', text)

    # 移除 UUID
    text = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', text)

    # 数字归一化（保留语义，忽略具体值）
    text = re.sub(r'\b\d{4,}\b', '#', text)  # 4+ 位数字 → #

    # 文件路径归一化
    text = re.sub(r'[/\\][\w./\\-]+\.\w+', '', text)  # /path/to/file.ext → 空

    # 行号引用归一化
    text = re.sub(r':\d{1,4}', '', text)  # :123 → 空

    return text[:2000]


class LLMCache:
    """LLM 响应缓存 — 支持 SQLite 持久化和内存双层"""

    def __init__(self, max_size: int = 200, default_ttl: float = 300.0, db_path: str = ""):
        self._cache: Dict[str, Dict] = {}  # key → {response, created_at, ttl, hit_count, prompt_type}
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0
        self._db_path = db_path
        self._db = None
        self._loaded_from_db = False

    def _ensure_db(self):
        """懒初始化 SQLite 连接"""
        if self._db or not self._db_path:
            return
        try:
            import sqlite3
            os.makedirs(os.path.dirname(self._db_path), exist_ok=True)
            self._db = sqlite3.connect(self._db_path, check_same_thread=False)
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.execute("""
                CREATE TABLE IF NOT EXISTS llm_cache (
                    cache_key TEXT PRIMARY KEY,
                    prompt_hash TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    prompt_type TEXT NOT NULL DEFAULT 'default',
                    hit_count INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    ttl REAL NOT NULL DEFAULT 300
                )
            """)
            self._db.execute("CREATE INDEX IF NOT EXISTS idx_cache_hash ON llm_cache(prompt_hash)")
            self._db.execute("CREATE INDEX IF NOT EXISTS idx_cache_type ON llm_cache(prompt_type)")
            self._db.commit()
            logger.info("LLM 缓存 SQLite 已初始化: %s", self._db_path)
        except Exception as e:
            logger.warning("LLM 缓存 SQLite 初始化失败: %s", e)
            self._db = None

    def _load_from_db(self):
        """从 SQLite 加载缓存到内存"""
        if self._loaded_from_db or not self._db:
            return
        try:
            now = time.time()
            rows = self._db.execute(
                "SELECT cache_key, response_json, prompt_type, hit_count, created_at, ttl FROM llm_cache WHERE created_at + ttl > ?",
                (now,)
            ).fetchall()
            for row in rows:
                key, resp_json, ptype, hits, created, ttl = row
                try:
                    response = json.loads(resp_json)
                except Exception:
                    continue
                self._cache[key] = {
                    "response": response,
                    "created_at": created,
                    "ttl": ttl,
                    "hit_count": hits,
                    "prompt_type": ptype,
                }
            self._loaded_from_db = True
            logger.info("从 SQLite 加载 %d 条缓存", len(self._cache))
        except Exception as e:
            logger.warning("从 SQLite 加载缓存失败: %s", e)

    def _make_key(self, prompt: str, role: str = "", model: str = "") -> str:
        normalized = normalize_prompt(prompt)
        content = f"{role}:{model}:{normalized}"
        return hashlib.md5(content.encode()).hexdigest()

    def get(self, prompt: str, role: str = "", model: str = "") -> Optional[Any]:
        self._ensure_db()
        if not self._loaded_from_db:
            self._load_from_db()

        key = self._make_key(prompt, role, model)
        entry = self._cache.get(key)
        if entry:
            now = time.time()
            if now - entry["created_at"] <= entry["ttl"]:
                entry["hit_count"] += 1
                self._hits += 1
                # 异步更新 DB hit_count（不阻塞）
                self._update_db_hit_count(key)
                return entry["response"]
            else:
                del self._cache[key]
                self._delete_db_entry(key)

        self._misses += 1
        return None

    def put(self, prompt: str, response: Any, role: str = "", model: str = "") -> None:
        self._ensure_db()

        if len(self._cache) >= self._max_size:
            self._evict()

        key = self._make_key(prompt, role, model)
        prompt_type = classify_prompt_type(prompt)
        ttl = TTL_PRESETS.get(prompt_type, self._default_ttl) if prompt_type != "default" else self._default_ttl

        now = time.time()
        self._cache[key] = {
            "response": response,
            "created_at": now,
            "ttl": ttl,
            "hit_count": 0,
            "prompt_type": prompt_type,
        }

        # 持久化到 SQLite
        self._save_to_db(key, prompt, response, prompt_type, ttl, now)

    def _evict(self) -> None:
        """LRU 淘汰：优先淘汰过期的，再淘汰最久未用的"""
        if not self._cache:
            return
        now = time.time()
        # 先淘汰过期的
        expired = [k for k, v in self._cache.items() if now - v["created_at"] > v["ttl"]]
        for k in expired:
            del self._cache[k]
            self._delete_db_entry(k)
        # 如果还需要淘汰，按 hit_count 升序淘汰
        if len(self._cache) >= self._max_size:
            min_hits_key = min(self._cache, key=lambda k: self._cache[k]["hit_count"])
            del self._cache[min_hits_key]
            self._delete_db_entry(min_hits_key)

    def clear(self) -> None:
        self._cache.clear()
        if self._db:
            try:
                self._db.execute("DELETE FROM llm_cache")
                self._db.commit()
            except Exception:
                pass

    def _save_to_db(self, key: str, prompt: str, response: Any, prompt_type: str, ttl: float, created_at: float):
        if not self._db:
            return
        try:
            # 尝试序列化 response（AgentScope Msg 可能不可序列化）
            try:
                resp_json = json.dumps(response, default=str, ensure_ascii=False)
            except Exception:
                resp_json = json.dumps(str(response), ensure_ascii=False)
            prompt_hash = hashlib.md5(normalize_prompt(prompt).encode()).hexdigest()
            self._db.execute(
                "INSERT OR REPLACE INTO llm_cache (cache_key, prompt_hash, response_json, prompt_type, hit_count, created_at, ttl) VALUES (?, ?, ?, ?, 0, ?, ?)",
                (key, prompt_hash, resp_json, prompt_type, created_at, ttl),
            )
            self._db.commit()
        except Exception as e:
            logger.debug("缓存写入 SQLite 失败: %s", e)

    def _update_db_hit_count(self, key: str):
        if not self._db:
            return
        try:
            self._db.execute("UPDATE llm_cache SET hit_count = hit_count + 1 WHERE cache_key = ?", (key,))
            self._db.commit()
        except Exception:
            pass

    def _delete_db_entry(self, key: str):
        if not self._db:
            return
        try:
            self._db.execute("DELETE FROM llm_cache WHERE cache_key = ?", (key,))
            self._db.commit()
        except Exception:
            pass

    def cleanup_expired(self) -> int:
        """清理过期缓存条目"""
        now = time.time()
        expired_keys = [k for k, v in self._cache.items() if now - v["created_at"] > v["ttl"]]
        for k in expired_keys:
            del self._cache[k]
            self._delete_db_entry(k)
        return len(expired_keys)

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        by_type = {}
        for v in self._cache.values():
            pt = v.get("prompt_type", "default")
            by_type[pt] = by_type.get(pt, 0) + 1
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 4) if total > 0 else 0,
            "by_type": by_type,
            "ttl_presets": TTL_PRESETS,
        }


# 全局缓存实例（SQLite 持久化）
_db_path = os.path.join(os.path.dirname(__file__), "data", "llm_cache.db")
llm_cache = LLMCache(max_size=200, db_path=_db_path)
