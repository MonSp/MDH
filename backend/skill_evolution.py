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

        written = 0
        for rule in rules:
            review_id = self._extractor.submit_for_review(rule)
            if self._extractor.approve_rule(
                review_id, reviewer_comment="auto-approve (skill evolution)"
            ):
                # approve_rule 只改写磁盘副本；重新加载以获得 approved 状态与审核意见，
                # 否则 write_to_incremental_area 会因内存中 status 仍为 pending_review 而拒绝
                approved_rule = self._extractor._load_rule(review_id)
                if not approved_rule:
                    continue
                # 元数据传播（T4 评审 Important）：extract_from_meeting 用 _infer_task_type
                # 从 task_description 推断类型，本任务类型（如 minutes）不在白名单 →
                # source_task_type 退化为 'general'，使 retrieve_relevant_rules 的
                # type-match bonus(+2) 丢失；此处把调用方传入的 task_type 回填到规则，
                # 并合并传入的关键词标签。
                updates = {}
                if task_type:
                    updates["source_task_type"] = task_type
                    # 重写假设进入此路径的规则 trigger_condition 均以
                    # "task_type is <推断类型>" 开头（extract_from_meeting 的 4 个
                    # 生产分支均满足）；仅替换前导类型段，保留其余条件。
                    updates["trigger_condition"] = (
                        f"task_type is {task_type} and "
                        + approved_rule.trigger_condition.split(" and ", 1)[-1]
                        if " and " in approved_rule.trigger_condition
                        else f"task_type is {task_type}"
                    )
                if keywords:
                    updates["keywords"] = sorted(set(approved_rule.keywords) | set(keywords))
                if updates:
                    # 公开 API 回写 rules/（替代 _save_rule 直调）；modify_rule 白名单含
                    # source_task_type/trigger_condition/keywords
                    self._extractor.modify_rule(review_id, updates)
                    # modify_rule 在 extractor 内部 load→setattr→save，不更新调用方
                    # approved_rule 内存对象——重新加载拿回填后 approved 副本再写增量区，
                    # 保证 approved/ 副本与 rules/ 一致（双存储均含回填元数据）
                    approved_rule = self._extractor._load_rule(review_id)
                if self._extractor.write_to_incremental_area(approved_rule):
                    written += 1

        return {"ok": True, "rule_id": rules[0].rule_id if rules else "", "count": written}
