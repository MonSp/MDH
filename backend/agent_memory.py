"""Agent 持久记忆 — SQLite 存储后端"""

import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from db import get_db

logger = logging.getLogger("agent_memory")


class AgentMemory:
    """Agent 持久记忆管理器（SQLite 存储）"""

    MARKDOWN_DEBOUNCE_SECONDS = 60
    CONSOLIDATION_OVERLAP_THRESHOLD = 0.7

    def __init__(self, data_dir: str, tuning_registry=None):
        self._data_dir = data_dir
        self._memory_dir = os.path.join(data_dir, "agent_memory")
        os.makedirs(self._memory_dir, exist_ok=True)
        self._db_path = os.path.join(data_dir, "agent_memory.db")
        self._db = get_db(self._db_path)
        self._lock = threading.Lock()
        self._md_last_written: dict[str, float] = {}
        self._summary_cache: dict[str, str] = {}
        self._semantic_indexes: dict[str, Any] = {}  # agent_id → SemanticIndex
        self._tuning = tuning_registry

    def _tp(self, name: str, default: float) -> float:
        """从 TuningRegistry 获取参数值，无 registry 或未注册时返回默认值"""
        if self._tuning is not None:
            val = self._tuning.get(name)
            if val is not None:
                return val
        return default

    @property
    def markdown_debounce_seconds(self) -> float:
        return self._tp("memory.markdown_debounce_seconds", self.MARKDOWN_DEBOUNCE_SECONDS)

    @property
    def consolidation_overlap_threshold(self) -> float:
        return self._tp("memory.consolidation_overlap_threshold", self.CONSOLIDATION_OVERLAP_THRESHOLD)

    def _md_path(self, agent_id: str) -> str:
        return os.path.join(self._memory_dir, f"{agent_id}.md")

    def _next_id(self, agent_id: str) -> str:
        row = self._db.execute(
            "SELECT COUNT(*) as cnt FROM agent_memories WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        return f"mem-{(row['cnt'] or 0) + 1:04d}"

    def get_memory(self, agent_id: str) -> dict[str, Any]:
        """获取 agent 的完整记忆（summary 有缓存，变更时失效）"""
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at", (agent_id,)
            ).fetchall()
        entries = [self._row_to_entry(r) for r in rows]
        if agent_id in self._summary_cache:
            summary = self._summary_cache[agent_id]
        else:
            summary = self._compute_summary(entries)
            self._summary_cache[agent_id] = summary
        return {"agent_id": agent_id, "entries": entries, "summary": summary}

    def _invalidate_summary(self, agent_id: str):
        """使 summary 缓存失效"""
        self._summary_cache.pop(agent_id, None)

    def _row_to_entry(self, row) -> dict:
        kw = row["keywords"]
        if isinstance(kw, str):
            try:
                kw = json.loads(kw)
            except Exception:
                kw = []
        return {
            "id": row["memory_id"],
            "type": row["type"],
            "content": row["content"],
            "task_id": row["task_id"] or "",
            "keywords": kw if isinstance(kw, list) else [],
            "importance": row["importance"],
            "referenced_count": row["referenced_count"],
            "created_at": row["created_at"],
            "last_referenced_at": row["last_referenced_at"],
        }

    def add_memory(self, agent_id: str, entry: dict[str, Any]) -> dict:
        """添加一条记忆"""
        now = datetime.now(timezone.utc).isoformat()
        memory_id = self._next_id(agent_id)
        entry_data = {
            "id": memory_id,
            "type": entry.get("type", "observation"),
            "content": entry.get("content", ""),
            "task_id": entry.get("task_id", ""),
            "keywords": entry.get("keywords", []),
            "importance": entry.get("importance", 0.5),
            "referenced_count": 0,
            "created_at": now,
            "last_referenced_at": now,
        }

        with self._lock:
            self._db.execute(
                """INSERT INTO agent_memories
                   (agent_id, memory_id, type, content, task_id, keywords,
                    importance, referenced_count, created_at, last_referenced_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (agent_id, memory_id, entry_data["type"], entry_data["content"],
                 entry_data["task_id"], json.dumps(entry_data["keywords"], ensure_ascii=False),
                 entry_data["importance"], 0, now, now),
            )
            self._db.commit()
        self._invalidate_summary(agent_id)
        self._update_semantic_index(agent_id, memory_id, entry_data["content"])
        self._generate_markdown_debounced(agent_id)
        logger.info("Agent %s 新增记忆: %s (%s)", agent_id, memory_id, entry_data["type"])
        return entry_data

    def _get_semantic_index(self, agent_id: str):
        """获取（或创建）agent 的语义索引"""
        from semantic_similarity import SemanticIndex
        if agent_id not in self._semantic_indexes:
            idx = SemanticIndex()
            # 从已有记忆构建索引
            with self._lock:
                rows = self._db.execute(
                    "SELECT memory_id, content FROM agent_memories WHERE agent_id = ?",
                    (agent_id,),
                ).fetchall()
            for row in rows:
                idx.add(row["memory_id"], row["content"])
            self._semantic_indexes[agent_id] = idx
        return self._semantic_indexes[agent_id]

    def _update_semantic_index(self, agent_id: str, memory_id: str, content: str):
        """增量更新语义索引"""
        try:
            idx = self._get_semantic_index(agent_id)
            idx.add(memory_id, content)
        except Exception:
            pass

    def _fts_available(self) -> bool:
        """检查 FTS5 表是否存在"""
        try:
            self._db.execute("SELECT 1 FROM agent_memories_fts LIMIT 1")
            return True
        except Exception:
            return False

    def recall(self, agent_id: str, query: str, limit: int = 5) -> list[dict]:
        """检索相关记忆（FTS5 + 语义相似度融合排序）"""
        query_lower = query.lower()
        import re as _re

        rows = []

        # 尝试 FTS5 全文检索
        if self._fts_available():
            cn_bigrams = [query_lower[i:i+2] for i in range(len(query_lower) - 1)
                          if '一' <= query_lower[i] <= '鿿' and '一' <= query_lower[i+1] <= '鿿']
            en_words = _re.findall(r'[a-z_]{2,}', query_lower)
            candidates = list(dict.fromkeys(cn_bigrams + en_words))[:8]
            if candidates:
                safe_terms = [f'"{c.replace(chr(34), chr(34)*2)}"' for c in candidates]
                fts_query = " OR ".join(safe_terms)
                try:
                    with self._lock:
                        rows = self._db.execute(
                            """SELECT m.* FROM agent_memories m
                               JOIN agent_memories_fts f ON m.agent_id = f.agent_id AND m.memory_id = f.memory_id
                               WHERE f.agent_id = ? AND agent_memories_fts MATCH ?""",
                            (agent_id, fts_query),
                        ).fetchall()
                except Exception:
                    rows = []

        # 回退：LIKE 预过滤
        if not rows:
            cn_bigrams = [query_lower[i:i+2] for i in range(len(query_lower) - 1)
                          if '一' <= query_lower[i] <= '鿿' and '一' <= query_lower[i+1] <= '鿿']
            en_words = _re.findall(r'[a-z_]{2,}', query_lower)
            candidates = list(dict.fromkeys(cn_bigrams + en_words))[:8]
            if candidates:
                conditions = " OR ".join(
                    ["LOWER(content) LIKE ?", "LOWER(keywords) LIKE ?"] * len(candidates)
                )
                params = []
                for c in candidates:
                    params.extend([f"%{c}%", f"%{c}%"])
                with self._lock:
                    rows = self._db.execute(
                        f"SELECT * FROM agent_memories WHERE agent_id = ? AND ({conditions})",
                        [agent_id] + params,
                    ).fetchall()
            else:
                with self._lock:
                    rows = self._db.execute(
                        "SELECT * FROM agent_memories WHERE agent_id = ?", (agent_id,)
                    ).fetchall()

        if not rows:
            # 语义索引补充候选：当关键词检索无结果时，用语义相似度找候选
            try:
                idx = self._get_semantic_index(agent_id)
                sem_hits = idx.query(query, top_k=limit * 2)
                if sem_hits:
                    mem_ids = [doc_id for doc_id, _ in sem_hits]
                    placeholders = ",".join("?" * len(mem_ids))
                    with self._lock:
                        rows = self._db.execute(
                            f"SELECT * FROM agent_memories WHERE agent_id = ? AND memory_id IN ({placeholders})",
                            [agent_id] + mem_ids,
                        ).fetchall()
            except Exception:
                pass

        if not rows:
            return []

        # 语义相似度分数（可选，失败时为 0）
        semantic_scores: dict[str, float] = {}
        try:
            idx = self._get_semantic_index(agent_id)
            for doc_id, sim in idx.query(query, top_k=20):
                semantic_scores[doc_id] = sim
        except Exception:
            pass

        scored = []
        for row in rows:
            entry = self._row_to_entry(row)
            score = 0.0
            for kw in entry.get("keywords", []):
                if kw.lower() in query_lower or query_lower in kw.lower():
                    score += 2.0
            if query_lower in entry.get("content", "").lower():
                score += 1.5
            # 语义相似度加权（0-3 分）
            sem = semantic_scores.get(entry["id"], 0.0)
            if sem > 0:
                score += sem * 3.0
            if score > 0:
                score *= (0.5 + entry.get("importance", 0.5))
                scored.append((score, entry))

        scored.sort(key=lambda x: -x[0])
        result = []
        now = datetime.now(timezone.utc).isoformat()
        for score, entry in scored[:limit]:
            entry["referenced_count"] = entry.get("referenced_count", 0) + 1
            entry["last_referenced_at"] = now
            with self._lock:
                self._db.execute(
                    "UPDATE agent_memories SET referenced_count = ?, last_referenced_at = ? WHERE agent_id = ? AND memory_id = ?",
                    (entry["referenced_count"], now, agent_id, entry["id"]),
                )
                self._db.commit()
            result.append(entry)
        return result

    def recall_for_task(self, agent_id: str, task_description: str, max_chars: int = 2000) -> str:
        """为任务检索相关记忆并格式化为上下文"""
        results = self.recall(agent_id, task_description, limit=3)
        if not results:
            return ""
        parts = ["## 此前相关经验"]
        total = 0
        for entry in results:
            content = entry.get("content", "")
            if total + len(content) > max_chars:
                break
            entry_type = entry.get("type", "observation")
            parts.append(f"- [{entry_type}] {content}")
            total += len(content)
        return "\n".join(parts) if len(parts) > 1 else ""

    def inject_context(self, agent_id: str, max_chars: int = 3000) -> str:
        """将 agent 的记忆注入到上下文中"""
        memory = self.get_memory(agent_id)
        if not memory["entries"]:
            return ""
        entries = sorted(
            memory["entries"],
            key=lambda e: e.get("importance", 0.5) * (1 + e.get("referenced_count", 0) * 0.1),
            reverse=True,
        )
        parts = ["## 个人记忆"]
        total_chars = 0
        if memory.get("summary"):
            parts.append(f"\n### 摘要\n{memory['summary']}")
            total_chars += len(memory["summary"])
        for entry in entries:
            content = entry.get("content", "")
            if total_chars + len(content) > max_chars:
                break
            entry_type = entry.get("type", "observation")
            type_icon = {"task_summary": "📋", "learning": "💡", "interaction": "🤝", "observation": "👁"}.get(entry_type, "📝")
            parts.append(f"\n{type_icon} [{entry_type}] {content}")
            total_chars += len(content)
        return "\n".join(parts) if len(parts) > 1 else ""

    def age_memories(self, agent_id: str, aging_days: int = 30) -> int:
        """老化未被引用的记忆"""
        threshold = datetime.now(timezone.utc) - timedelta(days=aging_days)
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM agent_memories WHERE agent_id = ?", (agent_id,)
            ).fetchall()
            aged = 0
            for row in rows:
                last_ref = row["last_referenced_at"] or row["created_at"]
                try:
                    last_dt = datetime.fromisoformat(last_ref)
                    if last_dt < threshold:
                        new_imp = max(0.1, (row["importance"] or 0.5) * 0.5)
                        self._db.execute(
                            "UPDATE agent_memories SET importance = ? WHERE agent_id = ? AND memory_id = ?",
                            (new_imp, agent_id, row["memory_id"]),
                        )
                        aged += 1
                except (ValueError, TypeError):
                    pass
            self._db.commit()
        if aged:
            self._invalidate_summary(agent_id)
            self._generate_markdown(agent_id)
            logger.info("Agent %s: %d 条记忆已老化", agent_id, aged)
        return aged

    def age_all_agents(self, aging_days: int = 30) -> dict[str, int]:
        """老化所有 agent 的未引用记忆，返回 {agent_id: aged_count}"""
        with self._lock:
            rows = self._db.execute(
                "SELECT DISTINCT agent_id FROM agent_memories"
            ).fetchall()
        agent_ids = [r["agent_id"] for r in rows]
        result = {}
        for aid in agent_ids:
            aged = self.age_memories(aid, aging_days)
            if aged:
                result[aid] = aged
        if result:
            logger.info("记忆老化完成: %d 个 agent, 共 %d 条", len(result), sum(result.values()))
        return result

    def consolidate_memories(self, agent_id: str) -> int:
        """合并高关键词重叠的记忆条目，返回合并数量

        策略：Jaccard(关键词) > 阈值时，保留 importance 更高的一条，
        累加 referenced_count，删除另一条。
        用倒排索引避免 O(N²) 全对比：只比较共享至少一个关键词的条目对。
        """
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY importance DESC",
                (agent_id,),
            ).fetchall()
        if len(rows) < 2:
            return 0

        entries = [self._row_to_entry(r) for r in rows]

        # 倒排索引：keyword → [entry_index, ...]
        kw_index: dict[str, list[int]] = {}
        entry_kws: list[set[str]] = []
        for idx, e in enumerate(entries):
            kws = set(k.lower() for k in e.get("keywords", []))
            entry_kws.append(kws)
            for kw in kws:
                kw_index.setdefault(kw, []).append(idx)

        # 收集候选对（共享至少一个关键词），再算 Jaccard
        candidate_pairs: set[tuple[int, int]] = set()
        for indices in kw_index.values():
            for a in range(len(indices)):
                for b in range(a + 1, len(indices)):
                    i, j = min(indices[a], indices[b]), max(indices[a], indices[b])
                    candidate_pairs.add((i, j))

        merged = 0
        removed_ids: set = set()

        for i, j in sorted(candidate_pairs):
            if entries[i]["id"] in removed_ids or entries[j]["id"] in removed_ids:
                continue
            kw_i, kw_j = entry_kws[i], entry_kws[j]
            if not kw_i or not kw_j:
                continue
            intersection = len(kw_i & kw_j)
            union = len(kw_i | kw_j)
            jaccard = intersection / union if union else 0.0
            if jaccard >= self.consolidation_overlap_threshold:
                # 合并：entries 已按 importance 降序，保留 i
                with self._lock:
                    self._db.execute(
                        """UPDATE agent_memories
                           SET referenced_count = referenced_count + ?,
                               keywords = ?
                           WHERE agent_id = ? AND memory_id = ?""",
                        (
                            entries[j].get("referenced_count", 0),
                            json.dumps(sorted(kw_i | kw_j), ensure_ascii=False),
                            agent_id,
                            entries[i]["id"],
                        ),
                    )
                    self._db.execute(
                        "DELETE FROM agent_memories WHERE agent_id = ? AND memory_id = ?",
                        (agent_id, entries[j]["id"]),
                    )
                    self._db.commit()
                entry_kws[i] = kw_i | kw_j  # 更新合并后的关键词集
                removed_ids.add(entries[j]["id"])
                merged += 1

        if merged:
            self._invalidate_summary(agent_id)
            self._generate_markdown(agent_id)
            logger.info("Agent %s: 合并 %d 条高重叠记忆", agent_id, merged)
        return merged

    def purge_decayed(self, agent_id: str, min_importance: float = 0.1) -> int:
        """删除重要度低于阈值的记忆条目，返回删除数量"""
        with self._lock:
            cursor = self._db.execute(
                "DELETE FROM agent_memories WHERE agent_id = ? AND importance <= ?",
                (agent_id, min_importance),
            )
            self._db.commit()
            deleted = cursor.rowcount
        if deleted:
            self._invalidate_summary(agent_id)
            self._generate_markdown(agent_id)
            logger.info("Agent %s: 清除 %d 条低重要度记忆", agent_id, deleted)
        return deleted

    def get_stats(self) -> dict:
        """记忆统计"""
        with self._lock:
            rows = self._db.execute("SELECT * FROM agent_memories").fetchall()
        total_agents = len({r["agent_id"] for r in rows})
        by_type = {}
        for r in rows:
            t = r["type"] or "unknown"
            by_type[t] = by_type.get(t, 0) + 1
        return {
            "total_agents": total_agents,
            "total_entries": len(rows),
            "by_type": by_type,
        }

    @staticmethod
    def _compute_summary(entries: list[dict]) -> str:
        if not entries:
            return ""
        sorted_entries = sorted(
            entries,
            key=lambda e: (e.get("importance", 0.5), e.get("created_at", "")),
            reverse=True,
        )[:5]
        summaries = [e.get("content", "")[:80] for e in sorted_entries if e.get("content")]
        return "; ".join(summaries)

    def _generate_markdown(self, agent_id: str):
        """生成 markdown 版本的记忆文件"""
        memory = self.get_memory(agent_id)
        lines = [f"# {agent_id} Memory", ""]
        if memory.get("summary"):
            lines.append(f"## Summary\n{memory['summary']}\n")
        for entry in memory.get("entries", []):
            entry_type = entry.get("type", "observation")
            lines.append(f"### [{entry_type}] {entry.get('created_at', '')[:10]}")
            lines.append(entry.get("content", ""))
            if entry.get("keywords"):
                lines.append(f"Keywords: {', '.join(entry['keywords'])}")
            lines.append(f"Importance: {entry.get('importance', 0.5):.1f} | Referenced: {entry.get('referenced_count', 0)}")
            lines.append("")
        md_path = self._md_path(agent_id)
        with open(md_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    def _generate_markdown_debounced(self, agent_id: str):
        """防抖版本：距上次写入不足 MARKDOWN_DEBOUNCE_SECONDS 时跳过"""
        import time
        now = time.monotonic()
        last = self._md_last_written.get(agent_id, 0.0)
        if now - last < self.markdown_debounce_seconds:
            return
        self._md_last_written[agent_id] = now
        self._generate_markdown(agent_id)
