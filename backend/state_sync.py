"""
State Sync — 双层状态同步

任务前: 从中心数据库检索相关经验规则，注入到 A2A 任务 metadata
任务后: 从执行结果提取关键信息，写入 Agent 记忆
"""

import logging
import re
from typing import Dict, List, Optional

from experience_extractor import ExperienceExtractor
from agent_memory import AgentMemory

logger = logging.getLogger("state_sync")


class StateSyncManager:
    """双层状态同步管理器

    连接中心持久层（ExperienceExtractor + AgentMemory）和
    A2A 执行节点，实现任务前经验注入和任务后记忆回传。
    """

    def __init__(
        self,
        experience_extractor: ExperienceExtractor,
        memory_manager: AgentMemory = None,
        capability_boundary=None,
    ):
        self._experience = experience_extractor
        self._memory = memory_manager
        self._boundary = capability_boundary

    def prepare_task_metadata(
        self,
        task_description: str,
        agent_id: str,
        max_rules: int = 5,
    ) -> Dict:
        """任务前: 检索相关经验规则，构建注入 metadata

        Args:
            task_description: 任务描述
            agent_id: 执行节点 ID
            max_rules: 最多注入的规则数

        Returns:
            包含经验规则和技能上下文的 metadata dict
        """
        metadata = {}

        # 能力边界检测：检查任务是否落在已知领域
        if self._boundary:
            try:
                keywords = self._extract_keywords(task_description)
                boundary = self._boundary.detect_unknown_domain(keywords)
                if boundary.get("is_unknown"):
                    metadata["capability_warning"] = {
                        "is_unknown": True,
                        "best_confidence": boundary.get("best_confidence", 0),
                        "recommendation": boundary.get("recommendation", ""),
                    }
                    logger.warning("任务落入未知领域: confidence=%.2f", boundary.get("best_confidence", 0))
            except Exception as e:
                logger.debug("能力边界检测跳过: %s", e)

        # 检索相关经验规则
        try:
            keywords = self._extract_keywords(task_description)
            rules = self._experience.retrieve_relevant_rules(
                task_type="general",
                keywords=keywords,
            )
            if rules:
                metadata["experience_rules"] = [
                    {
                        "rule_id": r.get("rule_id", ""),
                        "action": r.get("action", ""),
                        "note": r.get("note", ""),
                        "effectiveness_score": r.get("effectiveness_score", 0),
                        "keywords": r.get("keywords", []),
                    }
                    for r in rules
                ]
                logger.info("注入 %d 条经验规则到任务 (agent=%s)", len(rules), agent_id)
        except Exception as e:
            logger.warning("经验规则检索失败: %s", e)

        # 检索 Agent 相关记忆作为技能上下文
        if self._memory:
            try:
                context = self._memory.recall_for_task(agent_id, task_description)
                if context:
                    metadata["skill_context"] = context
                    logger.info("注入记忆上下文到任务 (agent=%s)", agent_id)
            except Exception as e:
                logger.warning("记忆检索失败: %s", e)

        return metadata

    def process_task_result(
        self,
        agent_id: str,
        task_description: str,
        result_text: str,
        success: bool,
        task_id: str = "",
    ):
        """任务后: 从执行结果提取信息，写入 Agent 记忆

        Args:
            agent_id: 执行节点 ID
            task_description: 原始任务描述
            result_text: 执行结果文本
            success: 是否成功
            task_id: A2A 任务 ID
        """
        if not self._memory:
            return

        try:
            # 提取关键信息作为记忆
            memory_type = "task_summary" if success else "learning"
            importance = 0.7 if success else 0.5

            # 从结果中提取关键词
            keywords = self._extract_keywords(task_description)

            # 构造记忆内容
            content = self._build_memory_content(
                task_description, result_text, success
            )

            self._memory.add_memory(agent_id, {
                "type": memory_type,
                "content": content,
                "task_id": task_id,
                "keywords": keywords,
                "importance": importance,
            })
            logger.info("写入记忆: agent=%s type=%s success=%s",
                        agent_id, memory_type, success)

            # 如果任务失败，更新相关经验规则的有效性
            if not success:
                self._update_rule_effectiveness(task_description, False)

        except Exception as e:
            logger.warning("记忆写入失败: %s", e)

    def _extract_keywords(self, text: str) -> List[str]:
        """从文本中提取关键词

        注意: TS 端 (adapters/claude-code/src/sync.ts) 使用 stop-word 过滤，
        与本方法的 bigram 滑动窗口会产生不同结果。
        这是有意的设计：Python 端用于经验检索（需要精确匹配），
        TS 端用于本地记忆索引（需要更宽泛的召回）。
        """
        # 中文分词（简单滑动窗口）
        cn_words = []
        for i in range(len(text) - 1):
            if '\u4e00' <= text[i] <= '\u9fff' and '\u4e00' <= text[i+1] <= '\u9fff':
                cn_words.append(text[i:i+2])
        # 英文分词
        en_words = re.findall(r'[a-zA-Z_]{3,}', text)
        # 去重
        all_words = list(set(cn_words + en_words))
        return all_words[:10]

    def _build_memory_content(
        self, task: str, result: str, success: bool
    ) -> str:
        """构建记忆内容"""
        status = "成功" if success else "失败"
        # 截断结果避免过长
        result_preview = result[:500] if len(result) > 500 else result
        return f"任务[{status}]: {task}\n结果: {result_preview}"

    def _update_rule_effectiveness(self, task_description: str, success: bool):
        """更新相关规则的有效性评分"""
        try:
            keywords = self._extract_keywords(task_description)
            rules = self._experience.retrieve_relevant_rules(
                task_type="general",
                keywords=keywords,
            )
            for rule in rules[:3]:
                rule_id = rule.get("rule_id")
                if rule_id:
                    self._experience.update_rule_effectiveness(rule_id, success)
        except Exception as e:
            logger.warning("规则有效性更新失败: %s", e)
