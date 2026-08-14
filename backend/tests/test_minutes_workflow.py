"""文档意图识别：速记文本 → 纪要 DAG（含把关节点）"""
import pytest
from minutes_workflow import MINUTES_KEYWORDS, build_minutes_workflow


def test_build_minutes_workflow_structure():
    wf = build_minutes_workflow("今天会议讨论了上线计划，需要形成待办")
    assert wf.workflow_id.startswith("minutes-")
    assert wf.execution_strategy == "sequential"
    assert len(wf.nodes) == 3
    ids = [n.node_id for n in wf.nodes]
    assert ids == ["extract", "draft", "proofread"]
    assert all(n.dept_id == "dept-docs" for n in wf.nodes)
    assert len(wf.edges) == 2
    assert wf.edges[0].source_node_id == "extract" and wf.edges[0].target_node_id == "draft"
    assert wf.edges[1].source_node_id == "draft" and wf.edges[1].target_node_id == "proofread"


def test_draft_node_has_gate():
    wf = build_minutes_workflow("速记内容")
    draft = next(n for n in wf.nodes if n.node_id == "draft")
    assert draft.gate == {"approver": "submitter", "stage": "review"}


def test_minutes_keywords_hit_document_mode():
    assert any(k in MINUTES_KEYWORDS for k in ("会议纪要", "速记", "待办"))


def test_custom_approver():
    wf = build_minutes_workflow("内容", approver="emp-1")
    draft = next(n for n in wf.nodes if n.node_id == "draft")
    assert draft.gate == {"approver": "emp-1", "stage": "review"}
