"""
A2A Task Router — 根据任务特征选择最优执行节点

分析任务描述，匹配执行节点的能力，选择最优节点执行。
"""

import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

from a2a_registry import A2ARegistry, RegisteredAgent

logger = logging.getLogger("a2a_task_router")

# 任务特征 → 需要的技能标签
TASK_TAG_KEYWORDS = {
    # 文件操作
    "file": ["读取", "写入", "创建文件", "修改文件", "删除文件", "read_file", "write_file",
             "edit_file", "list_directory", "文件"],
    "git": ["git", "commit", "push", "pull", "branch", "merge", "rebase", "版本控制"],
    "shell": ["运行", "执行命令", "bash", "shell", "命令行", "终端", "run_tests", "run_linter"],
    "search": ["搜索", "查找", "grep", "search", "找一下"],
    # LLM
    "llm": ["对话", "翻译", "总结", "分析", "生成", "写作", "润色"],
    # 浏览器
    "browser": ["浏览器", "网页", "截图", "screenshot", "navigate", "playwright"],
}


@dataclass
class RoutingDecision:
    """路由决策结果"""
    agent: RegisteredAgent
    skill_id: str
    confidence: float
    reason: str
    matched_tags: List[str]


class A2ATaskRouter:
    """A2A 任务路由器

    根据任务描述匹配执行节点的能力，选择最优节点。
    """

    def __init__(self, registry: A2ARegistry):
        self._registry = registry

    def route(self, task_description: str, prefer_tags: List[str] = None) -> Optional[RoutingDecision]:
        """为任务选择最优执行节点

        Args:
            task_description: 任务描述
            prefer_tags: 优先考虑的标签

        Returns:
            RoutingDecision 或 None（无可用节点）
        """
        active_agents = self._registry.list_active()
        if not active_agents:
            logger.warning("A2A: 无可用执行节点")
            return None

        # 提取任务特征标签
        detected_tags = self._detect_tags(task_description)
        if prefer_tags:
            detected_tags = list(set(detected_tags + prefer_tags))

        if not detected_tags:
            # 默认需要本地执行能力
            detected_tags = ["file", "shell"]

        # 为每个节点计算匹配分
        candidates: List[Tuple[RegisteredAgent, str, float, List[str]]] = []

        for agent in active_agents:
            for skill in agent.card.skills:
                score, matched = self._score_match(detected_tags, skill.tags, agent)
                if score > 0:
                    candidates.append((agent, skill.id, score, matched))

        if not candidates:
            logger.warning("A2A: 无节点匹配标签 %s", detected_tags)
            return None

        # 按分数排序，取最高
        candidates.sort(key=lambda x: x[2], reverse=True)
        best_agent, best_skill, best_score, best_matched = candidates[0]

        reason = f"匹配标签: {best_matched}, 节点成功率: {best_agent.success_rate:.0%}"

        logger.info("A2A 路由: %s -> %s (skill=%s, score=%.2f)",
                     task_description[:50], best_agent.agent_id, best_skill, best_score)

        return RoutingDecision(
            agent=best_agent,
            skill_id=best_skill,
            confidence=best_score,
            reason=reason,
            matched_tags=best_matched,
        )

    def detect_needs_local_execution(self, task_description: str) -> bool:
        """判断任务是否需要本地执行（文件操作、Git、Shell）"""
        tags = self._detect_tags(task_description)
        local_tags = {"file", "git", "shell", "search", "browser"}
        return bool(set(tags) & local_tags)

    def _detect_tags(self, text: str) -> List[str]:
        """从文本中提取任务特征标签"""
        tags = []
        text_lower = text.lower()
        for tag, keywords in TASK_TAG_KEYWORDS.items():
            for kw in keywords:
                if kw.lower() in text_lower:
                    tags.append(tag)
                    break
        return list(set(tags))

    def _score_match(
        self,
        task_tags: List[str],
        skill_tags: List[str],
        agent: RegisteredAgent,
    ) -> Tuple[float, List[str]]:
        """计算任务标签与技能标签的匹配分

        评分公式:
        - 标签匹配率 (0.6): 匹配的标签数 / 任务标签数
        - 节点成功率 (0.3): 历史成功率
        - 标签覆盖率 (0.1): 匹配的标签数 / 技能标签数
        """
        task_set = set(task_tags)
        skill_set = set(skill_tags)
        matched = task_set & skill_set

        if not matched:
            return 0.0, []

        match_ratio = len(matched) / len(task_set)  # 任务标签命中率
        success_rate = agent.success_rate
        coverage = len(matched) / len(skill_set) if skill_set else 0

        score = match_ratio * 0.6 + success_rate * 0.3 + coverage * 0.1
        return score, list(matched)
