import os
import shutil
import tempfile

import pytest
import yaml

from experience_extractor import (
    ExecutionLog,
    ExperienceExtractor,
    ExperienceRule,
    _now_iso,
)


@pytest.fixture
def tmp_incremental_dir():
    """创建临时增量区目录"""
    d = tempfile.mkdtemp(prefix="test_experience_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def extractor(tmp_incremental_dir):
    return ExperienceExtractor(incremental_dir=tmp_incremental_dir)


def _make_success_log(**overrides) -> ExecutionLog:
    """构建成功日志"""
    defaults = dict(
        task_id="task-001",
        agent_id="agent-frontend",
        task_description="构建一个登录页面",
        task_type="web-dev",
        status="success",
        steps=[
            {"command": "navigate", "action": "navigate to login page", "tool": "browser"},
            {
                "command": "fill_field",
                "action": "fill username field",
                "tool": "browser",
                "is_decision": True,
                "selected_option": "css selector #username",
                "reason": "CSS 选择器比 XPath 更稳定",
            },
            {"command": "click_button", "action": "click submit button", "tool": "browser"},
        ],
        errors=[],
        corrections=[],
        final_output="登录页面构建成功",
        created_at=_now_iso(),
    )
    defaults.update(overrides)
    return ExecutionLog(**defaults)


def _make_failure_recovery_log(**overrides) -> ExecutionLog:
    """构建失败-修正日志"""
    defaults = dict(
        task_id="task-002",
        agent_id="agent-data",
        task_description="解析 Excel 数据文件",
        task_type="data-analysis",
        status="revision_success",
        steps=[
            {"command": "read_file", "action": "read Excel file", "tool": "openpyxl"},
            {"command": "process_data", "action": "process dataframe", "tool": "pandas"},
            {"command": "export_result", "action": "export to CSV", "tool": "pandas"},
        ],
        errors=[
            {
                "type": "MergedCellError",
                "message": "Cannot read merged cells in Excel",
                "step_index": 0,
            }
        ],
        corrections=[
            {
                "error_index": 0,
                "action": "preprocess with openpyxl to unmerge cells before reading",
                "command": "unmerge_cells",
                "description": "使用 openpyxl 先解除合并单元格再读取",
            }
        ],
        final_output="数据解析完成（经过修正）",
        created_at=_now_iso(),
    )
    defaults.update(overrides)
    return ExecutionLog(**defaults)


# ──────────────────── 从成功日志提炼规则 ────────────────────


class TestExtractFromSuccess:
    def test_extracts_decision_point_rule(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)

        decision_rules = [r for r in rules if "decision" in r.trigger_condition]
        assert len(decision_rules) >= 1
        rule = decision_rules[0]
        assert rule.rule_type == "success_pattern"
        assert rule.status == "pending_review"
        assert rule.source_task_id == "task-001"
        assert rule.source_task_type == "web-dev"
        assert "css selector #username" in rule.action

    def test_extracts_step_pattern_rule(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)

        pattern_rules = [r for r in rules if "follow steps pattern" in r.action]
        assert len(pattern_rules) >= 1
        rule = pattern_rules[0]
        assert rule.rule_type == "success_pattern"
        assert "navigate" in rule.action

    def test_returns_empty_for_failure_log(self, extractor):
        log = _make_success_log(status="failure")
        rules = extractor.extract_from_success(log)
        assert rules == []

    def test_keywords_include_task_type(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        assert len(rules) > 0
        for rule in rules:
            assert "web-dev" in rule.keywords

    def test_keywords_include_commands(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        all_keywords = set()
        for rule in rules:
            all_keywords.update(rule.keywords)
        assert "navigate" in all_keywords
        assert "fill_field" in all_keywords


# ──────────────────── 从失败-修正日志提炼规则 ────────────────────


class TestExtractFromFailureRecovery:
    def test_extracts_failure_avoidance_rule(self, extractor):
        log = _make_failure_recovery_log()
        rules = extractor.extract_from_failure_recovery(log)

        assert len(rules) >= 1
        rule = rules[0]
        assert rule.rule_type == "failure_avoidance"
        assert rule.status == "pending_review"
        assert "MergedCellError" in rule.trigger_condition
        assert "unmerge" in rule.action.lower()

    def test_returns_empty_without_errors(self, extractor):
        log = _make_failure_recovery_log(errors=[])
        rules = extractor.extract_from_failure_recovery(log)
        assert rules == []

    def test_returns_empty_without_corrections(self, extractor):
        log = _make_failure_recovery_log(corrections=[])
        rules = extractor.extract_from_failure_recovery(log)
        assert rules == []

    def test_keywords_include_error_type(self, extractor):
        log = _make_failure_recovery_log()
        rules = extractor.extract_from_failure_recovery(log)
        assert len(rules) > 0
        all_keywords = set()
        for rule in rules:
            all_keywords.update(rule.keywords)
        assert "MergedCellError" in all_keywords

    def test_unmatched_corrections_produce_correction_tip(self, extractor):
        log = _make_failure_recovery_log(
            errors=[{"type": "SomeError", "message": "generic error", "step_index": 99}],
            corrections=[{"action": "retry with different approach"}],
        )
        rules = extractor.extract_from_failure_recovery(log)
        assert len(rules) >= 1
        assert any(r.rule_type == "correction_tip" for r in rules)


# ──────────────────── 审核流程 ────────────────────


class TestReviewWorkflow:
    def _create_rule(self, extractor) -> ExperienceRule:
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        assert len(rules) > 0
        rule = rules[0]
        extractor.submit_for_review(rule)
        return rule

    def test_submit_for_review(self, extractor):
        rule = self._create_rule(extractor)
        assert rule.status == "pending_review"
        pending = extractor.get_pending_rules()
        assert any(r.rule_id == rule.rule_id for r in pending)

    def test_approve_rule(self, extractor):
        rule = self._create_rule(extractor)
        result = extractor.approve_rule(rule.rule_id, reviewer_comment="LGTM")
        assert result is True
        loaded = extractor._load_rule(rule.rule_id)
        assert loaded.status == "approved"
        assert "LGTM" in loaded.note

    def test_reject_rule(self, extractor):
        rule = self._create_rule(extractor)
        result = extractor.reject_rule(rule.rule_id, reason="Too generic")
        assert result is True
        loaded = extractor._load_rule(rule.rule_id)
        assert loaded.status == "rejected"
        assert "Too generic" in loaded.note

    def test_modify_rule(self, extractor):
        rule = self._create_rule(extractor)
        result = extractor.modify_rule(
            rule.rule_id,
            {"action": "updated action", "keywords": ["new-kw"]},
        )
        assert result is True
        loaded = extractor._load_rule(rule.rule_id)
        assert loaded.action == "updated action"
        assert "new-kw" in loaded.keywords

    def test_approve_nonexistent_rule(self, extractor):
        result = extractor.approve_rule("nonexistent-id")
        assert result is False

    def test_reject_nonexistent_rule(self, extractor):
        result = extractor.reject_rule("nonexistent-id", reason="Not found")
        assert result is False

    def test_modify_nonexistent_rule(self, extractor):
        result = extractor.modify_rule("nonexistent-id", {"action": "x"})
        assert result is False


def test_modify_rule_updates_source_task_type(tmp_path):
    # M4 评审登记技术债：modify_rule 白名单须含 source_task_type（skill_evolution
    # 元数据回填走公开 API 的前提）；否则更新被跳过（warning）→ 加载后仍为默认值。
    extractor = ExperienceExtractor(str(tmp_path))
    rule = ExperienceRule(
        rule_id="rule-modify-src-type",
        trigger_condition="task_type is general",
        action="test",
        note="",
        source_task_id="task-001",
        source_task_type="general",
        rule_type="success_pattern",
        status="pending_review",
        keywords=["a"],
        created_at=_now_iso(),
    )
    rule_id = extractor.submit_for_review(rule)
    assert extractor.modify_rule(rule_id, {"source_task_type": "minutes"})
    loaded = extractor._load_rule(rule_id)
    assert loaded.source_task_type == "minutes"


# ──────────────────── 写入增量区 ────────────────────


class TestWriteToIncrementalArea:
    def test_write_approved_rule(self, extractor, tmp_incremental_dir):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        # approve_rule 修改磁盘副本，需重新加载
        rule = extractor._load_rule(rule.rule_id)
        result = extractor.write_to_incremental_area(rule)
        assert result is True

        rules_path = os.path.join(tmp_incremental_dir, "rules", f"{rule.rule_id}.yaml")
        assert os.path.isfile(rules_path)

        with open(rules_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        assert data["rules"][0]["rule_id"] == rule.rule_id
        assert data["rules"][0]["status"] == "approved"

    def test_reject_unapproved_rule(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        rule.status = "pending_review"

        result = extractor.write_to_incremental_area(rule)
        assert result is False


# ──────────────────── 规则有效性追踪 ────────────────────


class TestRuleEffectiveness:
    def test_update_effectiveness_success(self, extractor, tmp_incremental_dir):
        """任务成功时 effectiveness_score 上升"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        assert extractor.update_rule_effectiveness(rule.rule_id, True) is True
        loaded = extractor._load_rule(rule.rule_id)
        assert loaded.usage_count == 1
        assert loaded.success_count == 1
        assert loaded.effectiveness_score == 1.0

    def test_update_effectiveness_failure(self, extractor, tmp_incremental_dir):
        """任务失败时 effectiveness_score 下降"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        # 先成功一次
        extractor.update_rule_effectiveness(rule.rule_id, True)
        # 再失败一次
        assert extractor.update_rule_effectiveness(rule.rule_id, False) is True
        loaded = extractor._load_rule(rule.rule_id)
        assert loaded.usage_count == 2
        assert loaded.success_count == 1
        assert loaded.effectiveness_score == 0.5

    def test_update_effectiveness_persists(self, extractor, tmp_incremental_dir):
        """有效性数据持久化到 YAML"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)
        extractor.update_rule_effectiveness(rule.rule_id, True)

        # 重新加载验证持久化
        reloaded = ExperienceExtractor(incremental_dir=tmp_incremental_dir)
        loaded = reloaded._load_rule(rule.rule_id)
        assert loaded.usage_count == 1
        assert loaded.success_count == 1
        assert loaded.effectiveness_score == 1.0

    def test_update_effectiveness_unknown_rule(self, extractor):
        """更新不存在的规则返回 False"""
        assert extractor.update_rule_effectiveness("nonexistent-id", True) is False

    def test_new_rule_defaults(self, extractor):
        """新建规则的 effectiveness 字段默认值为 0"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        assert rule.effectiveness_score == 0.0
        assert rule.usage_count == 0
        assert rule.success_count == 0

    def test_auto_demote_after_3_failures(self, extractor):
        """连续 3 次失败（score=0.0 < 0.4）自动降级为 pending_review"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        extractor.update_rule_effectiveness(rule.rule_id, False)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        # 2 次失败，还未降级
        assert extractor._load_rule(rule.rule_id).status == "approved"

        extractor.update_rule_effectiveness(rule.rule_id, False)
        # 3 次失败，自动降级
        assert extractor._load_rule(rule.rule_id).status == "pending_review"
        assert extractor._load_rule(rule.rule_id).usage_count == 3
        assert extractor._load_rule(rule.rule_id).effectiveness_score == 0.0

    def test_no_demote_when_mixed_results(self, extractor):
        """1 成功 2 失败（score=0.33 < 0.4）也会降级"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        extractor.update_rule_effectiveness(rule.rule_id, True)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        assert extractor._load_rule(rule.rule_id).status == "pending_review"
        assert abs(extractor._load_rule(rule.rule_id).effectiveness_score - 1/3) < 0.01

    def test_no_demote_when_score_adequate(self, extractor):
        """2 成功 1 失败（score=0.67 ≥ 0.4）不降级"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        extractor.update_rule_effectiveness(rule.rule_id, True)
        extractor.update_rule_effectiveness(rule.rule_id, True)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        assert extractor._load_rule(rule.rule_id).status == "approved"

    def test_scan_and_demote_batch(self, extractor):
        """批量扫描降级所有低有效性规则"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        # 模拟 3 次失败
        for _ in range(3):
            extractor.update_rule_effectiveness(rule.rule_id, False)

        # 已被 update_rule_effectiveness 自动降级，再手动改回 approved 测试批量扫描
        r = extractor._load_rule(rule.rule_id)
        r.status = "approved"
        extractor._save_rule(r)

        demoted = extractor.scan_and_demote_ineffective_rules()
        assert rule.rule_id in demoted
        assert extractor._load_rule(rule.rule_id).status == "pending_review"

    def test_demote_not_triggered_below_min_usage(self, extractor):
        """使用次数不足 3 次不触发降级"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        extractor.update_rule_effectiveness(rule.rule_id, False)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        assert extractor._load_rule(rule.rule_id).status == "approved"

    def test_boundary_score_exactly_04_not_demoted(self, extractor):
        """恰好 0.4 分（2/5）不降级 — 阈值是 < 0.4，不含等号"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        # 5 次使用：2 成功 3 失败 → 2/5 = 0.4 exactly
        extractor.update_rule_effectiveness(rule.rule_id, True)
        extractor.update_rule_effectiveness(rule.rule_id, True)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        extractor.update_rule_effectiveness(rule.rule_id, False)
        loaded = extractor._load_rule(rule.rule_id)
        assert loaded.effectiveness_score == 0.4
        assert loaded.status == "approved"  # 不降级

    def test_demoted_rule_not_retrieved(self, extractor):
        """降级后的规则不再被 retrieve_relevant_rules 返回"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)
        task_type = rule.source_task_type

        # 降级
        for _ in range(3):
            extractor.update_rule_effectiveness(rule.rule_id, False)
        assert extractor._load_rule(rule.rule_id).status == "pending_review"

        # 不再被检索
        retrieved = extractor.retrieve_relevant_rules(task_type, rule.keywords)
        retrieved_ids = [r.rule_id for r in retrieved]
        assert rule.rule_id not in retrieved_ids

    def test_demotion_persists_across_instances(self, extractor, tmp_incremental_dir):
        """降级状态跨 extractor 实例持久化"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        for _ in range(3):
            extractor.update_rule_effectiveness(rule.rule_id, False)
        assert extractor._load_rule(rule.rule_id).status == "pending_review"

        # 新实例仍读到 pending_review
        reloaded = ExperienceExtractor(incremental_dir=tmp_incremental_dir)
        assert reloaded._load_rule(rule.rule_id).status == "pending_review"
        assert reloaded._load_rule(rule.rule_id).usage_count == 3

    def test_reapprove_after_demotion(self, extractor):
        """降级后重新审批，规则恢复生效且有效性计数保留"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)

        for _ in range(3):
            extractor.update_rule_effectiveness(rule.rule_id, False)
        assert extractor._load_rule(rule.rule_id).status == "pending_review"

        # 重新审批
        extractor.approve_rule(rule.rule_id)
        reloaded = extractor._load_rule(rule.rule_id)
        assert reloaded.status == "approved"
        assert reloaded.usage_count == 3  # 历史计数保留
        assert reloaded.effectiveness_score == 0.0  # 评分保留

    def test_scan_demote_mixed_rules(self, extractor):
        """批量扫描：高分规则保留，低分规则降级"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule_good = rules[0]
        extractor.submit_for_review(rule_good)
        extractor.approve_rule(rule_good.rule_id)
        # 3 次成功
        for _ in range(3):
            extractor.update_rule_effectiveness(rule_good.rule_id, True)

        # 第二条规则：3 次失败
        log2 = _make_success_log()
        rules2 = extractor.extract_from_success(log2)
        rule_bad = rules2[0]
        rule_bad.rule_id = "bad-rule-id"
        extractor._save_rule(rule_bad)
        extractor.submit_for_review(rule_bad)
        extractor.approve_rule(rule_bad.rule_id)
        for _ in range(3):
            extractor.update_rule_effectiveness(rule_bad.rule_id, False)

        # 手动把降级的改回 approved（模拟绕过自动降级的旧规则）
        r = extractor._load_rule(rule_bad.rule_id)
        r.status = "approved"
        extractor._save_rule(r)

        demoted = extractor.scan_and_demote_ineffective_rules()
        assert rule_bad.rule_id in demoted
        assert rule_good.rule_id not in demoted
        assert extractor._load_rule(rule_good.rule_id).status == "approved"


# ──────────────────── 检索相关规则 ────────────────────


class TestRetrieveRelevantRules:
    def _approve_and_write(self, extractor, log) -> ExperienceRule:
        rules = extractor.extract_from_success(log)
        assert len(rules) > 0
        rule = rules[0]
        extractor.submit_for_review(rule)
        extractor.approve_rule(rule.rule_id)
        extractor.write_to_incremental_area(rule)
        return rule

    def test_retrieve_by_task_type(self, extractor):
        log = _make_success_log()
        self._approve_and_write(extractor, log)

        results = extractor.retrieve_relevant_rules("web-dev", ["navigate"])
        assert len(results) >= 1
        assert all(r.status == "approved" for r in results)

    def test_retrieve_returns_empty_for_no_match(self, extractor):
        log = _make_success_log()
        self._approve_and_write(extractor, log)

        results = extractor.retrieve_relevant_rules("machine-learning", ["neural-network"])
        assert len(results) == 0

    def test_retrieve_does_not_return_pending(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        extractor.submit_for_review(rule)
        # 未批准，不应出现在检索结果中

        results = extractor.retrieve_relevant_rules("web-dev", ["navigate"])
        assert all(r.rule_id != rule.rule_id for r in results)

    def test_retrieve_sorted_by_relevance(self, extractor):
        log1 = _make_success_log(task_id="task-a", steps=[
            {"command": "navigate", "action": "open page", "tool": "browser"},
        ])
        log2 = _make_success_log(task_id="task-b", steps=[
            {"command": "navigate", "action": "open page", "tool": "browser", "is_decision": True, "selected_option": "direct_url", "reason": "faster"},
            {"command": "click_button", "action": "submit form", "tool": "browser"},
            {"command": "fill_field", "action": "input data", "tool": "browser"},
        ])
        self._approve_and_write(extractor, log1)
        self._approve_and_write(extractor, log2)

        results = extractor.retrieve_relevant_rules("web-dev", ["navigate", "click_button", "fill_field"])
        assert len(results) >= 2


# ──────────────────── 规则级团队隔离 ────────────────────


def test_retrieve_relevant_rules_filters_by_team(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    rule_a = ExperienceRule(rule_id="r-a", trigger_condition="task_type is minutes", action="a",
                            note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                            status="approved", keywords=["纪要"], created_at="t", team_id="team-a")
    rule_b = ExperienceRule(rule_id="r-b", trigger_condition="task_type is minutes", action="b",
                            note="", source_task_id="p2", source_task_type="minutes", rule_type="correction_tip",
                            status="approved", keywords=["纪要"], created_at="t", team_id="team-b")
    extractor.submit_for_review(rule_a); extractor.approve_rule("r-a")
    extractor.submit_for_review(rule_b); extractor.approve_rule("r-b")
    assert [r.rule_id for r in extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-a")] == ["r-a"]
    assert [r.rule_id for r in extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-b")] == ["r-b"]
    assert len(extractor.retrieve_relevant_rules("minutes", ["纪要"])) == 2  # 空 team_id → 全局（向后兼容）


def test_retrieve_relevant_rules_old_rule_invisible_to_team(tmp_path):
    """T7 评审 Important #2 语义锁定：旧规则（team_id=""）对团队检索不可见
    （fail-closed 严格过滤）。存量规则在团队注入场景为死数据，需 migrate/re-tag
    （迁移策略登记为后续任务，不在本次实现范围内）。"""
    extractor = ExperienceExtractor(str(tmp_path))
    old_rule = ExperienceRule(rule_id="r-old", trigger_condition="task_type is minutes", action="a",
                              note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                              status="approved", keywords=["纪要"], created_at="t", team_id="")
    extractor.submit_for_review(old_rule); extractor.approve_rule("r-old")
    # 团队检索（非空 team_id）不得返回 team_id="" 的旧规则
    assert extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-a") == []
    # 空 team_id（全局检索）仍可见——向后兼容
    assert [r.rule_id for r in extractor.retrieve_relevant_rules("minutes", ["纪要"])] == ["r-old"]


def test_migrate_rules_team_id_backfills_and_isolates(tmp_path):
    """T44 后续项：存量 team_id="" 规则对团队检索不可见（fail-closed 注入死数据）。
    migrate_rules_team_id 把未归属规则批量回填到指定团队；已含 team_id 的规则不动；
    幂等（重复调用返回 0）。"""
    extractor = ExperienceExtractor(str(tmp_path))
    r_old = ExperienceRule(rule_id="r-old", trigger_condition="task_type is minutes", action="a",
                           note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                           status="approved", keywords=["纪要"], created_at="t")  # 缺 team_id → ""（旧规则兼容）
    r_team = ExperienceRule(rule_id="r-team", trigger_condition="task_type is minutes", action="b",
                            note="", source_task_id="p2", source_task_type="minutes", rule_type="correction_tip",
                            status="approved", keywords=["纪要"], created_at="t", team_id="team-a")
    extractor.submit_for_review(r_old); extractor.approve_rule("r-old")
    extractor.submit_for_review(r_team); extractor.approve_rule("r-team")

    # 迁移前：团队检索（team-x）严格过滤——team_id="" 的 r-old 不可见
    assert extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-x") == []

    # 迁移：仅 r-old 回填（r-team 已含 team_id 不计）
    assert extractor.migrate_rules_team_id("team-x") == 1

    # 迁移后：team-x 检索含 r-old；r-team 仍归 team-a
    assert [r.rule_id for r in extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-x")] == ["r-old"]
    assert extractor._load_rule("r-old").team_id == "team-x"
    assert extractor._load_rule("r-team").team_id == "team-a"

    # 幂等：再次迁移返回 0
    assert extractor.migrate_rules_team_id("team-x") == 0


def test_migrate_rules_team_id_specific_subset(tmp_path):
    """rule_ids 子集迁移：仅回填指定规则，未指定规则保持 "" 不变。"""
    extractor = ExperienceExtractor(str(tmp_path))
    r1 = ExperienceRule(rule_id="r1", trigger_condition="task_type is minutes", action="a",
                        note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                        status="approved", keywords=["纪要"], created_at="t")
    r2 = ExperienceRule(rule_id="r2", trigger_condition="task_type is minutes", action="b",
                        note="", source_task_id="p2", source_task_type="minutes", rule_type="correction_tip",
                        status="approved", keywords=["纪要"], created_at="t")
    extractor.submit_for_review(r1); extractor.approve_rule("r1")
    extractor.submit_for_review(r2); extractor.approve_rule("r2")

    # 仅迁移 r1
    assert extractor.migrate_rules_team_id("team-x", rule_ids=["r1"]) == 1
    assert extractor._load_rule("r1").team_id == "team-x"
    assert extractor._load_rule("r2").team_id == ""


def test_migrate_rules_team_id_empty_target_is_noop(tmp_path):
    """空 team_id 目标是 no-op：返回 0，不迁移、不写盘（规则保持未归属）。"""
    extractor = ExperienceExtractor(str(tmp_path))
    r_old = ExperienceRule(rule_id="r-old", trigger_condition="task_type is minutes", action="a",
                           note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                           status="approved", keywords=["纪要"], created_at="t")
    extractor.submit_for_review(r_old); extractor.approve_rule("r-old")

    # 空目标：guard 直接返回 0，未归属规则保持 "" 不变
    assert extractor.migrate_rules_team_id("") == 0
    assert extractor._load_rule("r-old").team_id == ""


def test_migrate_rules_team_id_empty_list_is_noop(tmp_path):
    """空 rule_ids 列表是 no-op：返回 0，规则不动。"""
    extractor = ExperienceExtractor(str(tmp_path))
    r_old = ExperienceRule(rule_id="r-old", trigger_condition="task_type is minutes", action="a",
                           note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                           status="approved", keywords=["纪要"], created_at="t")
    extractor.submit_for_review(r_old); extractor.approve_rule("r-old")

    assert extractor.migrate_rules_team_id("team-x", rule_ids=[]) == 0
    assert extractor._load_rule("r-old").team_id == ""


# ──────────────────── 构建上下文文本 ────────────────────


class TestBuildContext:
    def test_build_context_with_rules(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        context = extractor.build_experience_context(rules)
        assert "历史经验参考" in context
        assert "触发条件" in context
        assert "建议动作" in context

    def test_build_context_empty_rules(self, extractor):
        context = extractor.build_experience_context([])
        assert context == ""

    def test_build_context_contains_keywords(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        context = extractor.build_experience_context(rules)
        assert "web-dev" in context


# ──────────────────── 查询方法 ────────────────────


class TestQueryMethods:
    def test_get_pending_rules(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        for rule in rules:
            extractor.submit_for_review(rule)

        pending = extractor.get_pending_rules()
        assert len(pending) == len(rules)
        assert all(r.status == "pending_review" for r in pending)

    def test_get_all_rules(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        for rule in rules:
            extractor.submit_for_review(rule)

        all_rules = extractor.get_all_rules()
        assert len(all_rules) == len(rules)

    def test_get_all_rules_filter_by_status(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        extractor.submit_for_review(rules[0])
        extractor.approve_rule(rules[0].rule_id)
        extractor.submit_for_review(rules[1])

        approved = extractor.get_all_rules(status="approved")
        assert len(approved) == 1
        assert approved[0].rule_id == rules[0].rule_id

        pending = extractor.get_all_rules(status="pending_review")
        assert len(pending) == 1
        assert pending[0].rule_id == rules[1].rule_id


# ──────────────────── 经验注入到任务描述 ────────────────────


class TestExperienceInjection:
    """验证经验规则可以被检索并注入到任务描述中"""

    def test_retrieve_and_inject_into_task_description(self, extractor):
        """模拟 meeting_coordinator 的经验注入流程"""
        # 1. 提取并批准规则
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        for rule in rules:
            extractor.submit_for_review(rule)
            extractor.approve_rule(rule.rule_id)

        # 2. 模拟新任务到来时的检索
        task_type = "web-dev"
        content_kw = {"navigate", "click", "button", "web-dev"}
        past_rules = extractor.retrieve_relevant_rules(task_type, sorted(content_kw))
        assert len(past_rules) > 0, "应检索到已批准的规则"

        # 3. 构建经验上下文并注入任务描述
        exp_context = extractor.build_experience_context(past_rules[:5])
        assert exp_context, "经验上下文不应为空"

        task_desc = "开发一个用户登录页面"
        enhanced = f"{task_desc}\n\n{exp_context}"

        assert "历史经验参考" in enhanced
        assert "navigate" in enhanced or "click" in enhanced or "web-dev" in enhanced
        assert len(enhanced) > len(task_desc)

    def test_injection_skipped_when_no_rules(self, extractor):
        """无已批准规则时，注入应为空"""
        task_type = "unknown-type"
        past_rules = extractor.retrieve_relevant_rules(task_type, ["nonexistent"])
        assert past_rules == []

    def test_injection_respects_approval_status(self, extractor):
        """只有 approved 状态的规则才能被检索"""
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        # 只提交审核，不批准
        for rule in rules:
            extractor.submit_for_review(rule)

        past_rules = extractor.retrieve_relevant_rules("web-dev", ["navigate"])
        assert past_rules == [], "pending_review 状态的规则不应被检索"

    def test_experience_keywords_from_discussion_results(self, extractor):
        """验证从讨论结果中提取的关键词能改善检索"""
        # 创建并批准一条规则
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        extractor.submit_for_review(rules[0])
        extractor.approve_rule(rules[0].rule_id)

        # 用任务描述关键词检索（可能不够精确）
        basic_results = extractor.retrieve_relevant_rules("web-dev", ["开发"])

        # 用讨论结果中的关键词补充
        discussion_kw = {"navigate", "click_button", "fill_field"}
        enriched_results = extractor.retrieve_relevant_rules("web-dev", sorted(discussion_kw | {"开发"}))

        # 补充关键词后应检索到更多或相同的结果
        assert len(enriched_results) >= len(basic_results)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
