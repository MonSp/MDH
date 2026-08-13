"""技能闭环自动触发：pending 规则自动审核→写增量区→打包"""

import os

from experience_extractor import ExperienceExtractor, ExperienceRule
from meeting_coordinator import MeetingCoordinator


class _FakePackager:
    def __init__(self):
        self.calls = []

    def full_package(self, **kwargs):
        self.calls.append(kwargs)
        return None  # 打包结果非本测试关注点


def _seed_pending_rule(extractor, rule_id="r-test-1", source_task_id="task-001"):
    rule = ExperienceRule(
        rule_id=rule_id,
        trigger_condition="task_type is software-dev and role is executor",
        action="建议采用事件驱动架构",
        note="来自executor的讨论建议",
        source_task_id=source_task_id,
        source_task_type="software-dev",
        rule_type="success_pattern",
        status="pending_review",
        keywords=["executor", "backend_dev"],
        created_at="2026-01-01T00:00:00+00:00",
    )
    extractor._save_rule(rule)
    return rule


def test_finalize_skill_evolution_approves_writes_and_packages(tmp_path):
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "experience"))
    packager = _FakePackager()
    _seed_pending_rule(extractor, source_task_id="proj-1")

    result = MeetingCoordinator._finalize_skill_evolution(
        object.__new__(MeetingCoordinator), extractor, packager, "proj-1"
    )

    assert result["approved"] == 1
    assert result["written"] == 1
    assert os.path.exists(tmp_path / "experience" / "approved" / "r-test-1.yaml")
    assert "backend_dev" in result["packaged"]
    assert packager.calls and packager.calls[0]["project_id"] == "proj-1"


def test_finalize_skill_evolution_no_pending_no_packaging(tmp_path):
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "experience"))
    packager = _FakePackager()

    result = MeetingCoordinator._finalize_skill_evolution(
        object.__new__(MeetingCoordinator), extractor, packager, "proj-2"
    )

    assert result == {"approved": 0, "written": 0, "packaged": []}
    assert packager.calls == []


def test_finalize_skill_evolution_skips_other_project_rules(tmp_path):
    """其他项目的 pending 规则不被采纳（防跨项目污染）"""
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "experience"))
    packager = _FakePackager()
    rule = _seed_pending_rule(extractor, rule_id="r-other-1")
    rule.source_task_id = "proj-other"
    extractor._save_rule(rule)

    result = MeetingCoordinator._finalize_skill_evolution(
        object.__new__(MeetingCoordinator), extractor, packager, "proj-1"
    )

    assert result["approved"] == 0
    assert packager.calls == []
