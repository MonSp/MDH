"""coordinator seam：dept-docs 节点 prompt 注入资产上下文（_asset_context_builder）。

设计 [S3]：注入是增强非必需——无 builder / builder 异常 / 无 team_id 均不注入，
prompt 输出与现状逐字节一致；builder 非空时追加 `\n资产参考：\n` 段。
"""
import logging

import pytest

from meeting_coordinator import MeetingCoordinator


def _make_coordinator(builder=None):
    coord = MeetingCoordinator.__new__(MeetingCoordinator)
    coord._asset_context_builder = builder
    coord._approval_manager = None
    coord._workspace = None
    coord.logger = logging.getLogger("meeting_coordinator")
    return coord


def _make_node(node_id, dept_id, task_description):
    return type(
        "Node",
        (),
        {
            "node_id": node_id,
            "dept_id": dept_id,
            "task_description": task_description,
            "gate": None,  # _run_node_gate 读取 node.gate（无 gate 且无 approval_manager 时直接跳过）
        },
    )()


@pytest.mark.asyncio
async def test_docs_node_prompt_includes_asset_context(monkeypatch):
    captured = {}

    async def fake_loop(model, prompt, toolset, **kwargs):
        captured["prompt"] = prompt
        return {"result": "ok", "files_written": [], "tool_outputs": []}

    coord = _make_coordinator(builder=lambda team_id, task_type, keywords: f"\n资产参考：\n- 模板「会议纪要模板」：标题\n要点")
    monkeypatch.setattr(coord, "_get_model", lambda role: object())
    # 实例级 monkeypatch：避免类级替换后 bound-method 注入 self 导致的形参错位
    monkeypatch.setattr(coord, "_run_agent_execution_loop", fake_loop)

    node = _make_node("draft", "dept-docs", "撰写纪要初稿")
    await coord._execute_workflow_node(node, {"transcript": "会议讨论...", "team_id": "team-x"})
    assert "资产参考" in captured["prompt"]
    assert "会议纪要模板" in captured["prompt"]


@pytest.mark.asyncio
async def test_non_docs_node_or_no_builder_skips_injection(monkeypatch):
    captured = {}

    async def fake_loop(model, prompt, toolset, **kwargs):
        captured["prompt"] = prompt
        return {"result": "ok", "files_written": [], "tool_outputs": []}

    # 无 builder → 不注入
    coord = _make_coordinator(builder=None)
    monkeypatch.setattr(coord, "_get_model", lambda role: object())
    # 实例级 monkeypatch：避免类级替换后 bound-method 注入 self 导致的形参错位
    monkeypatch.setattr(coord, "_run_agent_execution_loop", fake_loop)
    node = _make_node("extract", "dept-docs", "提取要点")
    await coord._execute_workflow_node(node, {"transcript": "会议讨论..."})
    assert "资产参考" not in captured["prompt"]

    # builder 异常 → 吞掉不影响执行
    def broken_builder(team_id, task_type, keywords):
        raise RuntimeError("asset store down")

    coord2 = _make_coordinator(builder=broken_builder)
    monkeypatch.setattr(coord2, "_get_model", lambda role: object())
    monkeypatch.setattr(coord2, "_run_agent_execution_loop", fake_loop)
    node2 = _make_node("draft", "dept-docs", "撰写纪要初稿")
    await coord2._execute_workflow_node(node2, {"transcript": "会议讨论...", "team_id": "team-x"})
    assert "资产参考" not in captured["prompt"]  # 异常吞掉 → 无注入段
