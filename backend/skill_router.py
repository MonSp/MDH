"""
SkillRouter — 技能路由桥接器（配置层插件化 Phase 4）

将 ProgressiveSkillLoader 的 L0 索引注入 DynamicRouter 的路由表，
使技能成为可路由的目标（替代硬编码的部门映射）。

与 DynamicRouter 的四维加权评分协同：
- keyword_score: 技能 keywords 匹配
- semantic_score: 技能 trigger + description 语义相似度
- success_rate: 技能历史成功率（复用 DynamicRouter 自适应学习）
- priority: 技能优先级（category 映射）
"""

import logging
from typing import Dict, List, Optional, Tuple

from dynamic_router import DynamicRouter, RouteEntry
from progressive_skill_loader import ProgressiveSkillLoader, SkillSummary

logger = logging.getLogger("skill_router")


# 技能类别 → 部门 ID 映射（复用现有路由表结构）
CATEGORY_TO_DEPT = {
    "development": "dept-frontend",
    "testing": "dept-qa",
    "architecture": "dept-frontend",
    "devops": "dept-devops",
    "data": "dept-frontend",
    "design": "dept-frontend",
    "content": "dept-frontend",
    "security": "dept-qa",
}


class SkillRouter:
    """技能路由器 — 将技能索引注入路由系统。

    用法：
        loader = ProgressiveSkillLoader("/path/to/skill_packs")
        router = DynamicRouter("/path/to/routing_table.json")
        skill_router = SkillRouter(loader, router)

        # 注入技能到路由表
        skill_router.inject_skills()

        # 基于任务描述匹配技能
        matched = skill_router.route_by_skill("设计一个 REST API")
    """

    def __init__(
        self,
        skill_loader: ProgressiveSkillLoader,
        dynamic_router: DynamicRouter,
    ):
        self._loader = skill_loader
        self._router = dynamic_router
        self._skill_entries: Dict[str, RouteEntry] = {}

    def inject_skills(self) -> int:
        """将技能 L0 索引注入 DynamicRouter 路由表。

        每个技能生成一个 RouteEntry，与现有部门条目共存。

        Returns:
            注入的技能条目数
        """
        summaries = self._loader.get_skill_index()
        count = 0

        for s in summaries:
            dept_id = f"skill:{s.name}"
            entry = RouteEntry(
                dept_id=dept_id,
                dept_name=s.name,
                capability_desc=s.trigger or f"{s.category} 技能",
                capability_keywords=s.keywords + [s.name, s.category],
                tools=s.required_tools,
                success_rate=0.5,  # 初始中性值
                total_tasks=0,
                successful_tasks=0,
                last_active="",
                priority=self._category_priority(s.category),
            )
            self._skill_entries[dept_id] = entry
            # 同时注入到 DynamicRouter 的路由表
            self._router._table[dept_id] = entry
            count += 1

        logger.info("注入 %d 个技能到路由表", count)
        return count

    def route_by_skill(
        self, task_description: str, top_k: int = 3
    ) -> List[Tuple[str, float]]:
        """基于任务描述匹配最相关的技能。

        复用 DynamicRouter 的四维加权评分。

        Args:
            task_description: 任务描述
            top_k: 返回前 k 个结果

        Returns:
            [(skill_name, score), ...] 按分数降序
        """
        if not self._skill_entries:
            self.inject_skills()

        # 使用 DynamicRouter 的 rule_match + semantic_rank
        candidates = self._router.rule_match(task_description)
        # 只保留技能条目
        skill_candidates = [c for c in candidates if c.dept_id.startswith("skill:")]

        if not skill_candidates:
            # 回退到关键词直接匹配
            return self._fallback_keyword_match(task_description, top_k)

        # 语义排序
        ranked = self._router.semantic_rank(skill_candidates, task_description)

        results = []
        for entry, score in ranked[:top_k]:
            skill_name = entry.dept_name
            results.append((skill_name, score))

        return results

    def get_skill_route_table(self) -> Dict[str, dict]:
        """获取技能路由表的可序列化表示。"""
        return {
            dept_id: {
                "name": entry.dept_name,
                "desc": entry.capability_desc,
                "keywords": entry.capability_keywords,
                "tools": entry.tools,
                "priority": entry.priority,
            }
            for dept_id, entry in self._skill_entries.items()
        }

    def _fallback_keyword_match(
        self, task_description: str, top_k: int
    ) -> List[Tuple[str, float]]:
        """回退的关键词直接匹配（当 DynamicRouter 无命中时）。"""
        summaries = self._loader.get_skill_index()
        task_lower = task_description.lower()

        scored = []
        for s in summaries:
            score = 0.0
            for kw in s.keywords:
                if kw.lower() in task_lower:
                    score += 0.3
            if s.trigger and any(w in task_lower for w in s.trigger.lower().split()[:5]):
                score += 0.2
            if score > 0:
                scored.append((s.name, min(score, 1.0)))

        scored.sort(key=lambda x: -x[1])
        return scored[:top_k]

    @staticmethod
    def _category_priority(category: str) -> int:
        """类别 → 优先级映射（1-10，越高越优先）"""
        priority_map = {
            "development": 8,
            "testing": 7,
            "architecture": 9,
            "devops": 6,
            "security": 8,
            "data": 7,
            "design": 5,
            "content": 4,
        }
        return priority_map.get(category, 5)
