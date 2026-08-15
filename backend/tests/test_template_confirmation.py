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
