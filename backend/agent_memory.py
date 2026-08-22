"""Agent 持久记忆 — 让数字员工有跨会话的"个人记忆"

核心机制：
1. 记忆文件：每个 agent 持久化的 memory.md，跨项目保留
2. 自动摘要：任务完成后自动提取关键信息写入记忆
3. 记忆注入：新会话开始时，agent 的记忆自动注入上下文
4. 记忆老化：长期未被引用的记忆自动降权
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("agent_memory")


class AgentMemory:
    """Agent 持久记忆管理器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._memory_dir = os.path.join(data_dir, "agent_memory")
        os.makedirs(self._memory_dir, exist_ok=True)

    def _memory_path(self, agent_id: str) -> str:
        return os.path.join(self._memory_dir, f"{agent_id}.json")

    def _md_path(self, agent_id: str) -> str:
        return os.path.join(self._memory_dir, f"{agent_id}.md")

    def get_memory(self, agent_id: str) -> Dict[str, Any]:
        """获取 agent 的完整记忆"""
        path = self._memory_path(agent_id)
        if not os.path.isfile(path):
            return {"agent_id": agent_id, "entries": [], "summary": ""}
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"agent_id": agent_id, "entries": [], "summary": ""}

    def _save_memory(self, agent_id: str, memory: Dict[str, Any]):
        """保存记忆"""
        path = self._memory_path(agent_id)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(memory, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        # 同步生成 markdown 版本
        self._generate_markdown(agent_id, memory)

    def add_memory(self, agent_id: str, entry: Dict[str, Any]) -> Dict:
        """添加一条记忆

        Args:
            agent_id: agent ID
            entry: {
                "type": "task_summary" | "learning" | "interaction" | "observation",
                "content": str,           # 记忆内容
                "task_id": str,           # 关联任务 ID
                "keywords": [str],        # 关键词
                "importance": float,      # 重要性 0.0-1.0
            }
        Returns:
            添加的记忆条目
        """
        memory = self.get_memory(agent_id)

        entry_data = {
            "id": f"mem-{len(memory['entries']) + 1:04d}",
            "type": entry.get("type", "observation"),
            "content": entry.get("content", ""),
            "task_id": entry.get("task_id", ""),
            "keywords": entry.get("keywords", []),
            "importance": entry.get("importance", 0.5),
            "referenced_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_referenced_at": datetime.now(timezone.utc).isoformat(),
        }

        memory["entries"].append(entry_data)
        # 更新摘要
        memory["summary"] = self._compute_summary(memory["entries"])
        self._save_memory(agent_id, memory)

        logger.info("Agent %s 新增记忆: %s (%s)", agent_id, entry_data["id"], entry_data["type"][:30])
        return entry_data

    def recall(self, agent_id: str, query: str, limit: int = 5) -> List[Dict]:
        """检索相关记忆

        基于关键词匹配 + 重要性 + 时效性排序。
        """
        memory = self.get_memory(agent_id)
        if not memory["entries"]:
            return []

        query_lower = query.lower()
        scored = []
        for entry in memory["entries"]:
            score = 0.0

            # 关键词匹配
            for kw in entry.get("keywords", []):
                if kw.lower() in query_lower or query_lower in kw.lower():
                    score += 2.0

            # 内容匹配
            if query_lower in entry.get("content", "").lower():
                score += 1.5

            # 重要性加权（只在已有匹配时加权）
            if score > 0:
                score *= (0.5 + entry.get("importance", 0.5))
                scored.append((score, entry))

        # 按得分排序
        scored.sort(key=lambda x: -x[0])

        # 更新引用计数
        result = []
        for score, entry in scored[:limit]:
            entry["referenced_count"] = entry.get("referenced_count", 0) + 1
            entry["last_referenced_at"] = datetime.now(timezone.utc).isoformat()
            result.append(entry)

        if result:
            self._save_memory(agent_id, memory)

        return result

    def recall_for_task(self, agent_id: str, task_description: str, max_chars: int = 2000) -> str:
        """为任务检索相关记忆并格式化为上下文

        将 recall + inject 合并为一步，专门用于任务前注入。
        """
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
        """将 agent 的记忆注入到上下文中

        返回格式化的记忆文本，用于注入 system prompt。
        """
        memory = self.get_memory(agent_id)
        if not memory["entries"]:
            return ""

        # 按重要性和引用次数排序，取 top N
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
        """老化未被引用的记忆

        超过 aging_days 未被引用的记忆，重要性减半。
        """
        from datetime import timedelta
        memory = self.get_memory(agent_id)
        if not memory["entries"]:
            return 0

        threshold = datetime.now(timezone.utc) - timedelta(days=aging_days)
        aged = 0

        for entry in memory["entries"]:
            last_ref = entry.get("last_referenced_at", entry.get("created_at", ""))
            if last_ref:
                try:
                    last_dt = datetime.fromisoformat(last_ref)
                    if last_dt < threshold:
                        entry["importance"] = max(0.1, entry.get("importance", 0.5) * 0.5)
                        aged += 1
                except (ValueError, TypeError):
                    pass

        if aged:
            memory["summary"] = self._compute_summary(memory["entries"])
            self._save_memory(agent_id, memory)
            logger.info("Agent %s: %d 条记忆已老化", agent_id, aged)

        return aged

    def get_stats(self) -> Dict:
        """记忆统计"""
        total_agents = 0
        total_entries = 0
        by_type = {}

        for fname in os.listdir(self._memory_dir):
            if not fname.endswith(".json"):
                continue
            total_agents += 1
            try:
                with open(os.path.join(self._memory_dir, fname), encoding="utf-8") as f:
                    memory = json.load(f)
                entries = memory.get("entries", [])
                total_entries += len(entries)
                for e in entries:
                    t = e.get("type", "unknown")
                    by_type[t] = by_type.get(t, 0) + 1
            except Exception:
                pass

        return {
            "total_agents": total_agents,
            "total_entries": total_entries,
            "by_type": by_type,
        }

    @staticmethod
    def _compute_summary(entries: List[Dict]) -> str:
        """计算记忆摘要（最近 5 条高重要性记忆）"""
        if not entries:
            return ""
        # 取最近的高重要性记忆
        sorted_entries = sorted(
            entries,
            key=lambda e: (e.get("importance", 0.5), e.get("created_at", "")),
            reverse=True,
        )[:5]
        summaries = [e.get("content", "")[:80] for e in sorted_entries if e.get("content")]
        return "; ".join(summaries)

    def _generate_markdown(self, agent_id: str, memory: Dict[str, Any]):
        """生成 markdown 版本的记忆文件"""
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
