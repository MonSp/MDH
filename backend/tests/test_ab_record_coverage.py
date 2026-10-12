"""AB 入表覆盖与质量回归（方案 A：堵漏 + 去重 + has_rules 语义）"""
import asyncio

from a2a_post_processor import A2APostProcessor
from coordinator_execution import run_simple_path
from protocol import WorkflowDefinition, WorkflowExecution, WorkflowExecutionStatus
from workflow_engine import WorkflowEngine


class FakeTracker:
    def __init__(self):
        self.calls = []

    def record_task(self, task_type, success, has_rules, rule_count=0, avg_rule_score=0.0):
        self.calls.append({
            "task_type": task_type, "success": success, "has_rules": has_rules,
            "rule_count": rule_count, "avg_rule_score": avg_rule_score,
        })


class FakeRule:
    def __init__(self, rule_id, effectiveness=0.8):
        self.rule_id = rule_id
        self.effectiveness_score = effectiveness


class FakeExtractor:
    def __init__(self, rules=None):
        self._rules = {r.rule_id: r for r in (rules or [])}

    def _infer_task_type(self, text):
        return "general"

    def _load_rule(self, rule_id):
        return self._rules.get(rule_id)


# ── 1. a2a_post 不再重复入表（原 has_rules 恒真污染） ──
def test_a2a_post_processor_no_longer_records_ab():
    tracker = FakeTracker()
    proc = A2APostProcessor(ab_tracker=tracker)
    asyncio.run(proc.process(
        task_description="写一个后端接口", result_text="done",
        success=True, agent_id="node-1", task_id="t1",
    ))
    assert tracker.calls == []


# ── 2. 工作流引擎终态统一入表 ──
def test_engine_records_completed_with_injected_rules():
    tracker = FakeTracker()
    ext = FakeExtractor([FakeRule("r1", 1.0), FakeRule("r2", 0.5)])
    eng = WorkflowEngine(persistence_dir=None, ab_tracker=tracker, experience_extractor=ext)

    definition = WorkflowDefinition(workflow_id="w1", name="wf", description="写一个 app 接口")
    execution = WorkflowExecution(
        execution_id="e1", workflow_id="w1",
        status=WorkflowExecutionStatus.COMPLETED,
        results={"n1": {"injected_rule_ids": ["r1", "r2"]}},
    )
    eng._record_ab(definition, execution)

    assert len(tracker.calls) == 1
    call = tracker.calls[0]
    assert call["success"] is True
    assert call["has_rules"] is True
    assert call["rule_count"] == 2
    assert call["avg_rule_score"] == 0.75  # (1.0+0.5)/2
    assert call["task_type"] == "software-dev"  # 真实静态分类器: desc 含 app


def test_engine_records_failed_without_rules():
    tracker = FakeTracker()
    eng = WorkflowEngine(persistence_dir=None, ab_tracker=tracker)
    definition = WorkflowDefinition(workflow_id="w1", name="wf", description="任务")
    execution = WorkflowExecution(
        execution_id="e1", workflow_id="w1",
        status=WorkflowExecutionStatus.FAILED, results={},
    )
    eng._record_ab(definition, execution)
    assert tracker.calls[0]["success"] is False
    assert tracker.calls[0]["has_rules"] is False
    assert tracker.calls[0]["rule_count"] == 0


def test_engine_skips_cancelled():
    tracker = FakeTracker()
    eng = WorkflowEngine(persistence_dir=None, ab_tracker=tracker)
    definition = WorkflowDefinition(workflow_id="w1", name="wf", description="任务")
    execution = WorkflowExecution(
        execution_id="e1", workflow_id="w1",
        status=WorkflowExecutionStatus.CANCELLED,
    )
    eng._record_ab(definition, execution)
    assert tracker.calls == []


# ── 3. triage-simple 分流入表（此前静默丢数据） ──
def test_run_simple_path_records_ab():
    tracker = FakeTracker()
    ext = FakeExtractor([FakeRule("r9", 0.6)])

    class Coord:
        _ab_tracker = tracker
        _workspace = None

        def _find_agent_id(self, role):
            return None

        async def _inject_experience(self, *a, **k):
            return "enhanced", ["r9"]

        def _recall_agent_memory(self, agent_id, text):
            return ""

        async def _msg(self, *a, **k):
            pass

        async def auto_assign_task(self, *a, **k):
            return {"task_id": "t1"}

        async def execute_assigned_tasks(self):
            return [{"agent_id": "agent-executor", "result": "done", "written_files": ["a.py"]}]

        def _estimate_task_complexity(self, text):
            return 1

        def _grant_task_xp(self, *a, **k):
            pass

        def _write_task_memory(self, *a, **k):
            pass

        def _update_routing_stats_safe(self):
            pass

        async def _run_skill_evolution(self, *a, **k):
            pass

        async def _update_injected_rule_effectiveness(self, *a, **k):
            pass

        def _save_snapshot(self):
            pass

        def _get_experience_extractor(self):
            return ext

        def _resolve_agent(self, agent_id):
            return None  # 轻量审查走默认 approved

    result = asyncio.run(run_simple_path(Coord(), "写个简单函数", "ceo-1", None))

    assert result["type"] == "simple_completed"
    assert len(tracker.calls) == 1
    call = tracker.calls[0]
    assert call["success"] is True          # 默认轻量审查 approved
    assert call["has_rules"] is True        # 真实注入了 r9
    assert call["rule_count"] == 1
    assert call["avg_rule_score"] == 0.6
    assert call["task_type"] == "general"  # FakeExtractor 分类
