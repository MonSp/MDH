"""工作流节点经验注入回归（E4 workflow 0 注入根因修复）

此前节点 prompt 只有资产注入：串行 inject_experience 与
task_orchestrator._get_experience_context 都不在节点执行链上。
"""
from types import SimpleNamespace

import pytest

from coordinator_workflow import build_node_experience_context, execute_workflow_node
from protocol import WorkflowNode, WorkflowNodeStatus


class _FakeRule:
    def __init__(self, rule_id, effectiveness=0.8):
        self.rule_id = rule_id
        self.effectiveness_score = effectiveness


class _FakeExtractor:
    def __init__(self, rules=None, raise_error=False):
        self._rules = rules or []
        self._raise = raise_error

    def _infer_task_type(self, text):
        return "general"

    def retrieve_relevant_rules(self, task_type, keywords):
        if self._raise:
            raise RuntimeError("db down")
        return self._rules

    def build_experience_context(self, rules):
        return "[历史经验]\n" + "\n".join(f"- {r.rule_id} 的建议" for r in rules)

    def _load_rule(self, rule_id):
        for r in self._rules:
            if r.rule_id == rule_id:
                return r
        return None


def _coord(extractor):
    return SimpleNamespace(
        _get_experience_extractor=lambda: extractor,
        _workspace=None,
        _asset_context_builder=None,
        _approval_manager=None,
        _executor_url="",
        meeting=SimpleNamespace(agents=[]),
        _get_model=lambda role: object(),
        _find_agent_id=lambda role: None,
    )


def test_build_context_returns_rules_and_text():
    rules = [_FakeRule("r1"), _FakeRule("r2", 0.4)]
    coord = _coord(_FakeExtractor(rules))
    ctx, got = build_node_experience_context(coord, "写一个拍平 JSON 的函数")
    assert len(got) == 2
    assert ctx.startswith("\n\n[历史经验]")
    assert "r1 的建议" in ctx


def test_build_context_empty_when_no_rules():
    coord = _coord(_FakeExtractor([]))
    ctx, got = build_node_experience_context(coord, "任意任务")
    assert ctx == "" and got == []


def test_build_context_swallows_errors():
    coord = _coord(_FakeExtractor(raise_error=True))
    ctx, got = build_node_experience_context(coord, "任意任务")
    assert ctx == "" and got == []


def test_build_context_empty_task_text():
    coord = _coord(_FakeExtractor([_FakeRule("r1")]))
    ctx, got = build_node_experience_context(coord, "")
    assert ctx == "" and got == []


@pytest.mark.asyncio
async def test_execute_workflow_node_injects_experience():
    """节点执行：prompt 携带经验上下文，结果携带 injected_rule_ids"""
    captured = {}

    rules = [_FakeRule("r-abc"), _FakeRule("r-def", 0.2)]
    coord = _coord(_FakeExtractor(rules))

    async def fake_loop(model, prompt, toolset, on_model_error=None):
        captured["prompt"] = prompt
        return {"result": "done", "files_written": [], "tool_outputs": [], "verification": []}

    coord._run_agent_execution_loop = fake_loop

    node = WorkflowNode(
        node_id="n1",
        task_description="写一个把 TOML 拍平的函数",
        dept_id="dept-backend",
        status=WorkflowNodeStatus.PENDING,
    )
    result = await execute_workflow_node(coord, node, {})

    assert "[历史经验]" in captured["prompt"]
    assert "r-abc 的建议" in captured["prompt"]
    assert result["injected_rule_ids"] == ["r-abc", "r-def"]
