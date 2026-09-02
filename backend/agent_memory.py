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

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._memory_dir = os.path.join(data_dir, "agent_memory")
        os.makedirs(self._memory_dir, exist_ok=True)
        self._db_path = os.path.join(data_dir, "agent_memory.db")
        self._db = get_db(self._db_path)
        self._lock = threading.Lock()

    def _md_path(self, agent_id: str) -> str:
        return os.path.join(self._memory_dir, f"{agent_id}.md")

    def _next_id(self, agent_id: str) -> str:
        row = self._db.execute(
            "SELECT COUNT(*) as cnt FROM agent_memories WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        return f"mem-{(row['cnt'] or 0) + 1:04d}"

    def get_memory(self, agent_id: str) -> dict[str, Any]:
        """获取 agent 的完整记忆"""
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at", (agent_id,)
            ).fetchall()
        entries = [self._row_to_entry(r) for r in rows]
        summary = self._compute_summary(entries)
        return {"agent_id": agent_id, "entries": entries, "summary": summary}

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
        self._generate_markdown(agent_id)
        logger.info("Agent %s 新增记忆: %s (%s)", agent_id, memory_id, entry_data["type"])
        return entry_data

    def recall(self, agent_id: str, query: str, limit: int = 5) -> list[dict]:
        """检索相关记忆"""
        memory = self.get_memory(agent_id)
        if not memory["entries"]:
            return []

        query_lower = query.lower()
        scored = []
        for entry in memory["entries"]:
            score = 0.0
            for kw in entry.get("keywords", []):
                if kw.lower() in query_lower or query_lower in kw.lower():
                    score += 2.0
            if query_lower in entry.get("content", "").lower():
                score += 1.5
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
            self._generate_markdown(agent_id)
            logger.info("Agent %s: %d 条记忆已老化", agent_id, aged)
        return aged

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
