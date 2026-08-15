"""模板固化流程：评测 → 员工把关确认 → 入库/拒绝。

设计 [S5]：复用 ApprovalManager（把关点引擎）——模板固化 = 一个 gate 请求，
员工决定即入库许可；审计成对（gate/requested + gate/decided）。

接线说明：构造时消费侧包装 approvals.handle_gate_response，使 template: 关口
的批准/拒绝决定自动驱动 on_gate_result（员工批准 → approve_template；拒绝 →
reject_template）。不改 ApprovalManager 内部。

首次构造优先（first-instance-wins）：_bridge_gate_decisions 对同一 ApprovalManager
实例只在其首次构造 TemplateConfirmation 时生效；该管理器二次构造（即便 store/
evaluator 不同）会因 _template_bridge_installed 静默跳过接线，新实例的
on_gate_result 不会被 gate 决定驱动。
"""

from asset_evaluator import AssetEvaluator
from asset_store import AssetStore
from approval_manager import ApprovalManager


class TemplateConfirmation:
    def __init__(self, store: AssetStore, evaluator: AssetEvaluator, approvals: ApprovalManager):
        self._store = store
        self._evaluator = evaluator
        self._approvals = approvals
        self._bridge_gate_decisions()

    def _bridge_gate_decisions(self):
        """把关决定 → 模板入库/拒绝 接线（消费侧包装，不改 ApprovalManager 内部）。

        设计 [S5]：员工批准 (handle_gate_response) → AssetStore.approve_template。
        仅对 template: 关口的决定生效；其余关口请求原样透传。

        幂等护栏（T6 评审 Important）：同一 ApprovalManager 二次构造 TemplateConfirmation
        时不再重复包装 handle_gate_response，否则一次 gate 决定会重复驱动固化。
        """
        if getattr(self._approvals, "_template_bridge_installed", False):
            return
        original = self._approvals.handle_gate_response

        async def wrapped(request_id: str, approved: bool, reason: str = "", send_fn=None) -> bool:
            task_id = gate_id = approver = ""
            for p in self._approvals.get_pending_requests():
                if p["id"] == request_id:
                    task_id = p.get("taskId", "")
                    gate_id = p.get("gateId", "")
                    approver = p.get("approver", "")
                    break
            resolved = await original(request_id, approved, reason=reason, send_fn=send_fn)
            if resolved and task_id and gate_id.startswith("template:"):
                await self.on_gate_result(task_id, approved, approver=approver)
            return resolved

        self._approvals.handle_gate_response = wrapped
        self._approvals._template_bridge_installed = True

    async def submit(self, team_id: str, title: str, content: str, source_task_id: str = "", approver: str = "") -> dict:
        asset_id = self._store.propose_template(team_id, title, content, source_task_id=source_task_id, approver=approver)
        asset = self._store.get(asset_id)
        result = self._evaluator.evaluate(asset)
        # 评测结果回填资产记录（[S4] 规格行，T6 核验）：checks/judge_score 随资产持久化，
        # 批准固化后可从资产文件读到评测明细（审计可见）。
        asset["checks"] = result.checks
        asset["judge_score"] = result.judge_score
        self._store._write_asset(asset["team_id"], asset)
        if not result.passed:
            self._store.reject_template(asset_id, result.reason)
            return {"ok": False, "reason": f"评测不过: {result.reason}", "checks": result.checks}
        pending = await self._approvals.request_gate(
            requester_id="asset-service",
            operation="template_confirm",
            description=f"模板固化确认: {title}",
            task_id=asset_id,
            gate_id=f"template:{asset_id}",
            approver=approver,
            timeout=60.0,
        )
        return {"ok": True, "asset_id": asset_id, "request_id": pending.id}

    async def on_gate_result(self, asset_id: str, approved: bool, approver: str = "") -> bool:
        if approved:
            return self._store.approve_template(asset_id, approver)
        return self._store.reject_template(asset_id, "员工拒绝")
