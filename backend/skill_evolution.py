"""技能进化接线：把关差异 → 经验规则 → CoW 增量区。

设计 [S6]：复用 ExperienceExtractor（extract_from_meeting 既有提炼逻辑 +
write_to_incremental_area 增量区），把关反馈作为 review_result 输入。
纯新增模块，不改 experience_extractor.py 内部。
"""

from experience_extractor import ExperienceExtractor


class SkillEvolution:
    """把关差异 → 经验规则 → 增量区的接线，消费既有 ExperienceExtractor。"""

    def __init__(self, extractor: ExperienceExtractor):
        self._extractor = extractor

    def evolve_from_feedback(
        self,
        project_id: str,
        task_type: str,
        transcript: str,
        feedback: str,
        keywords: list,
        team_id: str = "",
    ) -> dict:
        """从把关（审查）反馈中提炼经验规则，经审核后写入增量区。

        Args:
            project_id: 项目 ID（extract_from_meeting 将其作为规则的
                source_task_id，实现项目隔离防污染）
            task_type: 任务类型（拼接进 task_description 供类型推断与关键词提炼）
            transcript: 会议/讨论记录（作为 discussion_results 的 content 输入）
            feedback: 把关（审查）反馈文本；为空时直接返回 {"ok": True, "count": 0}
            keywords: 关键词标签（合并进提炼规则的关键词并回写磁盘，
                直接影响 retrieve_relevant_rules 的检索相关度）
            team_id: 归属团队 ID（回填规则，实现规则级团队隔离；空 = 全局/未隔离）

        Returns:
            {"ok": True, "rule_id": <首条提炼规则 id 或空串（首条 id，
            非已写入保证）>, "count": <写入增量区条数>}
        """
        if not feedback or not feedback.strip():
            return {"ok": True, "count": 0}

        # 按 extract_from_meeting（experience_extractor.py:606-719）实际解析逻辑构造输入：
        # - discussion_results 读取 parsed_stance/role/content（stance in support/modify
        #   且 content > 20 字才成规则）
        # - review_result 读取 reviewer_feedback / monitor_feedback（把关反馈作为
        #   reviewer_feedback 输入，保证非空反馈必产出一条 correction_tip 规则）
        # - execution_results 读取 written_files（本次接线不提供文件产出）
        # 不用 "[{task_type}] " 前缀拼 task_description（T5 评审 Important）：
        # bracket 标签会被 _extract_content_keywords 提炼进规则 keywords（如
        # "minutes"），使 retrieve_relevant_rules 仅凭 task_type 词即可命中，
        # 掩盖 keywords 回填的检索效果；类型由下方 source_task_type 回填修复。
        rules = self._extractor.extract_from_meeting(
            project_id=project_id,
            task_description=transcript[:120],
            discussion_results=[
                {
                    "parsed_stance": "support",
                    "role": "assistant",
                    "content": transcript,
                }
            ],
            review_result={"reviewer_feedback": feedback},
            execution_results=[],
        )

        submitted = []
        for rule in rules:
            review_id = self._extractor.submit_for_review(rule)
            # 元数据传播：回填 task_type 和 keywords 到待审核规则
            updates = {}
            if task_type:
                updates["source_task_type"] = task_type
                updates["trigger_condition"] = (
                    f"task_type is {task_type} and "
                    + rule.trigger_condition.split(" and ", 1)[-1]
                    if " and " in rule.trigger_condition
                    else f"task_type is {task_type}"
                )
            if keywords:
                updates["keywords"] = sorted(set(rule.keywords) | set(keywords))
            if team_id:
                updates["team_id"] = team_id
            if updates:
                self._extractor.modify_rule(review_id, updates)
            submitted.append(review_id)

        # 不再自动审批 — 规则保持 pending_review 状态，等待人工审核
        # 前端 ExperienceRulePanel 提供 approve/reject 操作
        return {"ok": True, "rule_id": submitted[0] if submitted else "", "count": len(submitted)}
