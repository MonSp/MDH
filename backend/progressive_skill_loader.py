"""
ProgressiveSkillLoader — 渐进式技能加载器（配置层插件化 Phase 2）

四层渐进披露：
- L0: 轻量索引（~50 tokens/skill），始终可用
- L1: 触发时加载指令（~500 tokens）
- L2: 执行中按需加载 references
- L3: 运行时执行 scripts（预留）

与 DynamicRouter 协同：L0 索引可作为路由表补充。
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from skill_bridge import SkillBridge, SkillDescriptor

logger = logging.getLogger("progressive_skill_loader")


@dataclass
class SkillSummary:
    """L0 级轻量摘要 — 始终在 context 中可用。"""
    name: str
    category: str
    trigger: str          # 触发条件（截断到 max_len）
    required_tools: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)

    def to_tokens(self, max_trigger_len: int = 100) -> str:
        """转换为极简文本（~50 tokens/skill）"""
        trigger = self.trigger[:max_trigger_len]
        tools = ",".join(self.required_tools[:3]) if self.required_tools else ""
        kw = ",".join(self.keywords[:3]) if self.keywords else ""
        parts = [f"[{self.category}] {self.name}: {trigger}"]
        if tools:
            parts.append(f"tools={tools}")
        if kw:
            parts.append(f"kw={kw}")
        return " | ".join(parts)


class ProgressiveSkillLoader:
    """渐进式技能加载器。

    用法：
        loader = ProgressiveSkillLoader("/path/to/skill_packs")

        # L0: 始终可用的轻量索引
        index = loader.get_skill_index()
        # 注入 system prompt（~2100 tokens for 42 skills）

        # L1: 意图匹配后加载指令
        instructions = loader.load_instructions("frontend_dev")

        # L2: 执行中按需加载参考文档
        ref = loader.load_reference("frontend_dev", "patterns.md")
    """

    def __init__(self, skill_dir: str):
        self._bridge = SkillBridge(skill_dir)
        self._cache: Dict[str, SkillDescriptor] = {}

    def get_skill_index(self) -> List[SkillSummary]:
        """L0: 获取所有技能的轻量索引。"""
        skills = self._bridge.discover()
        return [
            SkillSummary(
                name=s.name,
                category=s.category,
                trigger=s.trigger,
                required_tools=s.required_tools,
                keywords=s.keywords,
            )
            for s in skills
        ]

    def format_skill_index(self, max_trigger_len: int = 80) -> str:
        """将 L0 索引格式化为可注入 system prompt 的文本。"""
        summaries = self.get_skill_index()
        if not summaries:
            return ""

        lines = ["## 可用技能索引", ""]
        for i, s in enumerate(summaries, 1):
            lines.append(f"{i}. {s.to_tokens(max_trigger_len)}")
        lines.append("")
        lines.append("（触发时加载完整指令，执行中按需加载参考文档）")
        return "\n".join(lines)

    def load_instructions(self, skill_name: str) -> str:
        """L1: 加载匹配技能的完整指令。"""
        desc = self._get_cached(skill_name)
        if not desc:
            return ""
        return desc.instructions

    def load_reference(self, skill_name: str, ref_path: str) -> str:
        """L2: 按需加载 references/ 中的特定文件。"""
        desc = self._get_cached(skill_name)
        if not desc:
            return ""

        from pathlib import Path
        base = Path(desc.base_path)

        # 尝试多个可能的子目录
        for subdir in ["references", "knowledge", "examples"]:
            full_path = base / subdir / ref_path
            if full_path.exists():
                try:
                    return full_path.read_text(encoding="utf-8")
                except Exception as e:
                    logger.warning("加载参考文档失败 %s: %s", full_path, e)

        return ""

    def find_skills_for_task(self, task_description: str, max_skills: int = 3) -> List[str]:
        """基于任务描述匹配最相关的技能名称。

        使用简单的关键词匹配（可与 DynamicRouter 协同升级）。
        """
        summaries = self.get_skill_index()
        if not summaries:
            return []

        task_lower = task_description.lower()
        scored = []

        for s in summaries:
            score = 0
            # 关键词匹配
            for kw in s.keywords:
                if kw.lower() in task_lower:
                    score += 2
            # 触发条件匹配
            if s.trigger and any(w in task_lower for w in s.trigger.lower().split()[:5]):
                score += 1
            # 类别匹配
            if s.category and s.category.lower() in task_lower:
                score += 1
            if score > 0:
                scored.append((score, s.name))

        scored.sort(key=lambda x: -x[0])
        return [name for _, name in scored[:max_skills]]

    def _get_cached(self, skill_name: str) -> Optional[SkillDescriptor]:
        """获取缓存的技能描述符（懒加载）。"""
        if skill_name not in self._cache:
            desc = self._bridge.load(skill_name)
            if desc:
                self._cache[skill_name] = desc
        return self._cache.get(skill_name)
