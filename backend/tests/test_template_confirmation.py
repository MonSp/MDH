import pytest

from approval_manager import ApprovalManager
from asset_evaluator import AssetEvaluator
from asset_store import AssetStore
from template_confirmation import TemplateConfirmation


def _make(tmp_path):
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    tc = TemplateConfirmation(store, AssetEvaluator(store), approvals)
    return store, approvals, tc


# 模板内容须过评测：有换行且 >50 字符（模板 quality 阈值 50）
_GOOD_CONTENT = (
    "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排\n"
    "发布范围\n风险预案\n回滚方案\n验收标准\n上线窗口\n值班安排"
)


@pytest.mark.asyncio
async def test_submit_evaluates_and_requests_gate(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", _GOOD_CONTENT, approver="emp-001")
    assert result["ok"] and result["asset_id"]
    pending = approvals.get_pending_requests()
    assert any(p["taskId"] == result["asset_id"] for p in pending)


@pytest.mark.asyncio
async def test_submit_evaluation_failure_rejects(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "坏模板", "标题")  # 质量不过
    assert not result["ok"]
    assert store.get(result.get("asset_id", "?")) is None  # 不入库


@pytest.mark.asyncio
async def test_on_gate_result_approve(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", _GOOD_CONTENT, approver="emp-001")
    pending = approvals.get_pending_requests()
    req = next(p for p in pending if p["taskId"] == result["asset_id"])
    await approvals.handle_gate_response(req["id"], True, reason="ok")
    assert store.get(result["asset_id"])["status"] == "approved"
    decided = [e for e in approvals.get_gate_audit(req["gateId"]) if e["event"] == "gate/decided"]
    assert decided  # 审计成对


@pytest.mark.asyncio
async def test_on_gate_result_reject_removes(tmp_path):
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", _GOOD_CONTENT, approver="emp-001")
    pending = approvals.get_pending_requests()
    req = next(p for p in pending if p["taskId"] == result["asset_id"])
    await approvals.handle_gate_response(req["id"], False, reason="不需要")
    assert store.get(result["asset_id"]) is None  # 拒绝 → 移除


@pytest.mark.asyncio
async def test_second_construction_does_not_double_wrap_bridge(tmp_path):
    """T6 评审护栏：同一 ApprovalManager 二次构造 TemplateConfirmation 不得二次包装
    handle_gate_response（幂等）——否则一次 gate 决定会重复驱动固化（approve_template 被调用两次）。"""
    from unittest.mock import MagicMock
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    tc1 = TemplateConfirmation(store, AssetEvaluator(store), approvals)
    wrapped_once = approvals.handle_gate_response
    assert getattr(approvals, "_template_bridge_installed", False) is True
    # 二次构造同一 ApprovalManager：护栏应直接返回，不再包装
    TemplateConfirmation(store, AssetEvaluator(store), approvals)
    assert approvals.handle_gate_response is wrapped_once
    # 行为核验：一次决定只驱动一次 approve_template（二次包装会重复触发）
    store.approve_template = MagicMock(wraps=store.approve_template)
    result = await tc1.submit("team-x", "发布计划模板", _GOOD_CONTENT, approver="emp-001")
    pending = approvals.get_pending_requests()
    req = next(p for p in pending if p["taskId"] == result["asset_id"])
    await approvals.handle_gate_response(req["id"], True, reason="ok")
    store.approve_template.assert_called_once()


@pytest.mark.asyncio
async def test_submit_persists_evaluation_results_into_asset(tmp_path):
    """T6 核验 [S4]：评测结果（checks/judge_score）随资产记录持久化，批准固化后审计可见。"""
    store, approvals, tc = _make(tmp_path)
    result = await tc.submit("team-x", "发布计划模板", _GOOD_CONTENT, approver="emp-001")
    asset = store.get(result["asset_id"])
    assert asset["checks"]["quality"] is True
    assert "judge_score" in asset
    # 批准固化后评测明细仍可从资产记录读取
    pending = approvals.get_pending_requests()
    req = next(p for p in pending if p["taskId"] == result["asset_id"])
    await approvals.handle_gate_response(req["id"], True, reason="ok")
    approved = store.get(result["asset_id"])
    assert approved["status"] == "approved"
    assert approved["checks"]["quality"] is True
