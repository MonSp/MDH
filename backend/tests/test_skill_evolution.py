from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_evolve_from_feedback_writes_rule(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback(
        project_id="proj-minutes-1",
        task_type="minutes",
        transcript="会议讨论发布计划，确定 8 月 15 日上线。",
        feedback="审核修改：遗漏了行动项的责任人，需要为每项待办补充负责人与截止日期。",
        keywords=["纪要", "待办"],
    )
    assert result["ok"]
    assert result["count"] >= 1
    assert extractor.get_all_rules(status="approved")  # 规则已批准并写入增量区


def test_evolve_returns_zero_when_no_feedback(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback("p1", "minutes", "会议讨论发布计划。", "", ["纪要"])
    assert result["ok"] and result["count"] == 0


def test_evolve_preserves_task_type_and_keywords(tmp_path):
    # T4 评审 Important：evolve 后规则需保留调用方传入的 task_type 与 keywords，
    # 否则 retrieve_relevant_rules 的 type-match bonus(+2) 永久丢失（minutes 不在
    # _infer_task_type 白名单 → 原推断为 general）。
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback(
        project_id="proj-minutes-3",
        task_type="minutes",
        transcript="会议讨论发布计划。",
        feedback="审核修改：遗漏行动项责任人，需要补充负责人与截止日期。",
        keywords=["纪要", "待办"],
    )
    assert result["ok"] and result["count"] >= 1
    assert result["rule_id"]
    rule = extractor._load_rule(result["rule_id"])
    assert rule is not None
    assert rule.source_task_type == "minutes"
    assert "纪要" in rule.keywords and "待办" in rule.keywords
