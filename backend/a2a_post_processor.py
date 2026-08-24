"""
A2A Post Processor — A2A 任务完成后的完整后处理流水线

确保通过 A2A 协议执行的任务与 Python 内部执行的任务享有相同的经验闭环：
1. 经验提炼（ExperienceExtractor）
2. XP 授予（AgentProfileManager）
3. 记忆写入（AgentMemory）
4. 路由统计更新（DynamicRouter）
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("a2a_post_processor")


class A2APostProcessor:
    """A2A 任务后处理流水线

    将 A2A 执行结果注入 Python 端的完整经验闭环，
    确保"数字员工越用越强"的产品承诺在 A2A 路由场景下同样成立。
    """

    def __init__(
        self,
        experience_extractor=None,
        agent_profile_manager=None,
        agent_memory=None,
        dynamic_router=None,
        webhook_manager=None,
        team_synergy=None,
    ):
        self._experience = experience_extractor
        self._profiles = agent_profile_manager
        self._memory = agent_memory
        self._router = dynamic_router
        self._webhooks = webhook_manager
        self._synergy = team_synergy

    async def process(
        self,
        task_description: str,
        result_text: str,
        success: bool,
        agent_id: str = "a2a-node",
        task_id: str = "",
        dept_id: str = "dept-software",
        xp_target: str = "executor",
    ):
        """A2A 任务完成后的完整后处理

        Args:
            task_description: 原始任务描述
            result_text: 执行结果文本
            success: 是否成功
            agent_id: 执行节点 ID（A2A 节点）
            task_id: A2A 任务 ID
            dept_id: 部门 ID（用于 XP 计算和路由统计）
            xp_target: XP 授予目标（数字员工 ID，默认 executor）
        """
        # 1. 经验提炼（归属于执行节点）
        if self._experience and success:
            self._distill_experience(task_description, result_text, agent_id)

        # 2. XP 授予（归属于数字员工，而非执行节点）
        if self._profiles:
            self._grant_xp(xp_target, task_description, success)

        # 3. 记忆写入（归属于数字员工）
        if self._memory:
            self._write_memory(xp_target, task_description, result_text, success, task_id)

        # 4. 路由统计更新
        if self._router:
            self._update_routing_stats(dept_id, success)

        # 5. Webhook 触发
        if self._webhooks:
            self._fire_webhook(task_description, success, xp_target, task_id)

        # 6. 团队协同记录
        if self._synergy:
            self._record_synergy(xp_target, task_description, success)

    def _distill_experience(self, task_description: str, result_text: str, agent_id: str):
        """从 A2A 任务结果中提炼经验规则"""
        try:
            # 调用 extract_from_meeting 需要 5 个位置参数
            project_id = f"a2a-{agent_id}"
            discussion_results = []
            review_result = {"passed": True, "score": 8.0}
            execution_results = {
                "success": True,
                "output": result_text[:2000],
                "tool_calls": [],
            }
            rules = self._experience.extract_from_meeting(
                project_id, task_description, discussion_results,
                review_result, execution_results,
            )
            if rules:
                logger.info("A2A 任务提炼 %d 条经验规则 (agent=%s)", len(rules), agent_id)
        except Exception as e:
            logger.warning("A2A 经验提炼失败: %s", e)

    def _grant_xp(self, agent_id: str, task_description: str, success: bool):
        """为执行任务的 agent 授予 XP"""
        try:
            if not success:
                return

            complexity = self._estimate_complexity(task_description)
            # grant_xp 签名: (agent_id, skill_id, task_success, review_score, task_complexity, skill_config)
            # 使用 "general" 作为通用 skill_id
            self._profiles.grant_xp(
                agent_id=agent_id,
                skill_id="general",
                task_success=True,
                review_score=8.0,
                task_complexity=complexity,
                skill_config={},
            )
            logger.info("A2A XP 授予: agent=%s complexity=%d", agent_id, complexity)
        except Exception as e:
            logger.warning("A2A XP 授予失败: %s", e)

    def _write_memory(self, agent_id: str, task_description: str, result_text: str,
                      success: bool, task_id: str):
        """将 A2A 任务结果写入 Agent 持久记忆"""
        try:
            import re
            # 提取关键词
            keywords = []
            for i in range(len(task_description) - 1):
                if '\u4e00' <= task_description[i] <= '\u9fff' and '\u4e00' <= task_description[i+1] <= '\u9fff':
                    keywords.append(task_description[i:i+2])
            keywords.extend(re.findall(r'[a-zA-Z_]{3,}', task_description))
            keywords = list(set(keywords))[:10]

            status = "成功" if success else "失败"
            result_preview = result_text[:500] if len(result_text) > 500 else result_text
            content = f"A2A任务[{status}]: {task_description}\n结果: {result_preview}"

            self._memory.add_memory(agent_id, {
                "type": "task_summary",
                "content": content,
                "task_id": task_id,
                "keywords": keywords,
                "importance": 0.7 if success else 0.5,
            })
            logger.info("A2A 记忆写入: agent=%s success=%s", agent_id, success)
        except Exception as e:
            logger.warning("A2A 记忆写入失败: %s", e)

    def _update_routing_stats(self, dept_id: str, success: bool):
        """更新路由统计（A2A 执行结果影响后续路由决策）"""
        try:
            self._router.update_stats(dept_id, success)
        except Exception as e:
            logger.warning("A2A 路由统计更新失败: %s", e)

    @staticmethod
    def _estimate_complexity(task_description: str) -> int:
        """估算任务复杂度 (1-5)"""
        text = task_description.lower()
        score = 1
        # 多步骤
        if any(kw in text for kw in ["首先", "然后", "最后", "first", "then", "finally"]):
            score += 1
        # 跨领域
        domains = ["前端", "后端", "测试", "部署", "数据库", "frontend", "backend", "test", "deploy"]
        if sum(1 for d in domains if d in text) >= 2:
            score += 1
        # 多动词
        verbs = ["设计", "开发", "实现", "测试", "部署", "重构", "优化"]
        if sum(1 for v in verbs if v in text) >= 3:
            score += 1
        # 文件操作多
        if text.count("文件") >= 3 or text.count("file") >= 3:
            score += 1
        return min(score, 5)

    def _fire_webhook(self, task_description: str, success: bool, agent_id: str, task_id: str):
        """触发 task.completed webhook"""
        try:
            self._webhooks.trigger("task.completed", {
                "task_id": task_id,
                "agent_id": agent_id,
                "success": success,
                "task_description": task_description[:200],
            })
        except Exception as e:
            logger.warning("Webhook 触发失败: %s", e)

    def _record_synergy(self, agent_id: str, task_description: str, success: bool):
        """记录团队协同数据"""
        try:
            self._synergy.record_team_task(
                agent_ids=[agent_id],
                task_type=task_description[:50],
                success=success,
            )
        except Exception as e:
            logger.warning("团队协同记录失败: %s", e)
