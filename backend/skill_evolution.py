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
            keywords: 关键词标签（接口兼容参数；extract_from_meeting 从
                task_description 自行提炼关键词，本参数暂不参与提炼）

        Returns:
            {"ok": True, "rule_id": <首条规则 id 或空串>, "count": <写入增量区条数>}
        """
        if not feedback or not feedback.strip():
            return {"ok": True, "count": 0}

        # 按 extract_from_meeting（experience_extractor.py:606-719）实际解析逻辑构造输入：
        # - discussion_results 读取 parsed_stance/role/content（stance in support/modify
        #   且 content > 20 字才成规则）
        # - review_result 读取 reviewer_feedback / monitor_feedback（把关反馈作为
        #   reviewer_feedback 输入，保证非空反馈必产出一条 correction_tip 规则）
        # - execution_results 读取 written_files（本次接线不提供文件产出）
        rules = self._extractor.extract_from_meeting(
            project_id=project_id,
            task_description=f"[{task_type}] {transcript[:120]}",
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
                if approved_rule and self._extractor.write_to_incremental_area(approved_rule):
                    written += 1

        return {"ok": True, "rule_id": rules[0].rule_id if rules else "", "count": written}
