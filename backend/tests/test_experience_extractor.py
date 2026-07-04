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

        approved_path = os.path.join(tmp_incremental_dir, "approved", f"{rule.rule_id}.yaml")
        assert os.path.isfile(approved_path)

        with open(approved_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        assert data["rules"][0]["rule_id"] == rule.rule_id

    def test_reject_unapproved_rule(self, extractor):
        log = _make_success_log()
        rules = extractor.extract_from_success(log)
        rule = rules[0]
        rule.status = "pending_review"

        result = extractor.write_to_incremental_area(rule)
        assert result is False


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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
