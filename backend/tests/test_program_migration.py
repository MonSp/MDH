"""沉淀/注入切换测试 (program-pivot T7, M1–M2)

验收：新任务 0 条新经验规则写入（写侧关停）；注入请求走 registry（读侧优先）；
旧读路径保留（未命中回退规则注入）。
"""

import uuid
from datetime import datetime, timezone

import pytest

import config as app_config
from experience_extractor import ExperienceExtractor, ExperienceRule
from program_injection import build_program_context
from program_registry import (
    ProgramManifest,
    ProgramRegistry,
    ProgramTrigger,
)


def _rule(action="做X") -> ExperienceRule:
    return ExperienceRule(
        rule_id=str(uuid.uuid4())[:8],
        trigger_condition="task",
        action=action,
        note="t",
        source_task_id="t-1",
        source_task_type="general",
        rule_type="success_pattern",
        status="pending_review",
        keywords=["测试"],
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@pytest.fixture()
def extractor(tmp_path):
    return ExperienceExtractor(incremental_dir=str(tmp_path / "exp"))


# ── M1 写侧关停 ──────────────────────────────────────


def test_save_new_rule_disabled_writes_nothing(extractor, monkeypatch):
    monkeypatch.setattr(app_config, "PROGRAM_PIVOT_DISABLE_RULE_WRITES", True)
    rule = _rule()
    returned = extractor._save_new_rule(rule)
    assert returned == rule.rule_id  # 返回 id 但不持久化
    assert extractor._load_rule(rule.rule_id) is None


def test_save_new_rule_enabled_writes(extractor, monkeypatch):
    monkeypatch.setattr(app_config, "PROGRAM_PIVOT_DISABLE_RULE_WRITES", False)
    rule = _rule()
    extractor._save_new_rule(rule)
    assert extractor._load_rule(rule.rule_id) is not None


def test_evolve_blocked_when_disabled(extractor, monkeypatch):
    monkeypatch.setattr(app_config, "PROGRAM_PIVOT_DISABLE_RULE_WRITES", True)
    rule = _rule()
    extractor._save_rule(rule)  # 存量写入（测试夹具）
    result = extractor.evolve_rule(rule.rule_id, "测试失败原因")
    # 关停时不允许产生新进化规则
    assert result is None


def test_human_feedback_rules_zero_when_disabled(tmp_path, monkeypatch):
    from human_feedback import HumanFeedbackManager

    monkeypatch.setattr(app_config, "PROGRAM_PIVOT_DISABLE_RULE_WRITES", True)
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "exp"))
    hf = HumanFeedbackManager(str(tmp_path), experience_extractor=extractor)
    created = hf._convert_suggestions_to_rules(
        {
            "specific_suggestions": ["应该先跑测试再提交"],
            "rating": "good",
            "task_description": "任务",
            "reviewer": "张三",
            "task_id": "t1",
        }
    )
    assert created == 0


# ── M2 读侧注入 ──────────────────────────────────────


def _program_pack(tmp_path, program_id="summary_prog", keyword="摘要") -> ProgramRegistry:
    reg = ProgramRegistry(str(tmp_path / "program_packs"))
    reg.create(
        ProgramManifest(
            program_id=program_id,
            version="1.0.0",
            description="生成摘要的成熟程序",
            trigger=ProgramTrigger(keywords=[keyword]),
        )
    )
    reg.promote(program_id)
    reg.record_validation(program_id, model="deepseek-chat")
    return reg


def test_build_program_context_hit(tmp_path):
    reg = _program_pack(tmp_path)
    ctx = build_program_context("请生成摘要：本周计划", registry=reg)
    assert "[program-context]" in ctx
    assert "summary_prog" in ctx


def test_build_program_context_miss_and_error(tmp_path):
    reg = _program_pack(tmp_path)
    assert build_program_context("无关任务", registry=reg) == ""
    assert build_program_context("", registry=reg) == ""
    assert build_program_context("x", registry=None, data_dir=None) == ""


def test_coordinator_workflow_injection_registry_first(tmp_path):
    from coordinator_workflow import build_node_experience_context

    reg = _program_pack(tmp_path)
    # coordinator._data_dir 指向 tmp_path → program_packs 在 tmp_path/program_packs
    class _Coord:
        _data_dir = str(tmp_path)

        def _get_experience_extractor(self):
            raise AssertionError("命中程序时不应触碰规则路径")

    ctx, rules = build_node_experience_context(_Coord(), "请生成摘要")
    assert "[program-context]" in ctx
    assert rules == []

    # 未命中 → 回退规则路径（extractor 返回空规则，不崩）
    class _CoordMiss:
        _data_dir = str(tmp_path / "empty")  # 无 packs

        def _get_experience_extractor(self):
            class _E:
                def _infer_task_type(self, t):
                    return "general"

                def retrieve_relevant_rules(self, task_type, keywords):
                    return []

                def build_experience_context(self, rules):
                    return ""
            return _E()

    ctx2, rules2 = build_node_experience_context(_CoordMiss(), "完全无关的内容")
    assert ctx2 == ""
    assert rules2 == []


def test_state_sync_registry_first(tmp_path):
    from state_sync import StateSyncManager

    reg = _program_pack(tmp_path)

    class _FakeExp:
        def retrieve_with_aging(self, **kwargs):
            raise AssertionError("命中程序时不应检索规则")

        def _extract_keywords(self, t):
            return set()

    mgr = StateSyncManager(experience_extractor=_FakeExp())
    mgr._data_dir = str(tmp_path)
    mgr._program_registry = reg
    meta = mgr.prepare_task_metadata("请生成摘要：x", agent_id="node-1")
    assert "program_context" in meta
    assert "summary_prog" in meta["program_context"]

    # 未命中 → 回退规则路径（空规则，正常返回）
    class _EmptyExp(_FakeExp):
        def retrieve_with_aging(self, **kwargs):
            return []

    mgr2 = StateSyncManager(experience_extractor=_EmptyExp())
    mgr2._data_dir = str(tmp_path / "none")
    mgr2._program_registry = None
    meta2 = mgr2.prepare_task_metadata("完全无关的内容", agent_id="node-2")
    assert "program_context" not in meta2
    assert meta2 == {} or "experience_rules" not in meta2


def test_orchestrator_injection_registry_first(tmp_path, monkeypatch):
    from task_orchestrator import TaskOrchestrator

    reg = _program_pack(tmp_path)
    # _get_experience_context 使用 backend/data 相对路径——monkeypatch 注入
    import program_injection as pi

    def fake_ctx(task_text, registry=None, model=None, data_dir=None):
        if "摘要" in task_text:
            return "\n\n[program-context] summary_prog"
        return ""

    monkeypatch.setattr(pi, "build_program_context", fake_ctx)
    # 无需完整 TaskOrchestrator 实例：直接测绑定函数逻辑较重，
    # 此处验证注入函数在命中时优先于 extractor（extractor 未构造即返回）
    # 通过构造未初始化对象调用未绑定方法
    orch = TaskOrchestrator.__new__(TaskOrchestrator)
    out = TaskOrchestrator._get_experience_context(orch, "请生成摘要")
    assert "[program-context]" in out

    out2 = TaskOrchestrator._get_experience_context(orch, "完全无关的内容")
    # 未命中回退：会构造 extractor 读 backend/data——不应抛异常
    assert isinstance(out2, str)
