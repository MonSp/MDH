"""
人工审批管理器 — 处理高危操作的人工审批流程

当后端检测到高危操作时，发送 human_approval_request 给前端，
等待用户审批后通过 human_approval_response 返回结果。
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, Awaitable, Optional, Dict

from protocol import ApprovalStatus, RiskLevel

logger = logging.getLogger(__name__)


@dataclass
class PendingApproval:
    """待审批请求"""
    id: str
    requester_id: str
    operation: str
    description: str
    risk_level: RiskLevel
    confidence: float
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: float = 0.0
    resolved_at: float = 0.0
    resolution_reason: str = ""
    task_id: str = ""
    gate_id: str = ""
    approver: str = ""
    _future: Optional[asyncio.Future] = field(default=None, repr=False)


class ApprovalManager:
    """人工审批管理器

    职责:
    1. 创建审批请求并发送给前端
    2. 等待前端的审批响应
    3. 管理审批超时和自动升级策略
    """

    def __init__(self, default_timeout: float = 300.0):
        self._pending: Dict[str, PendingApproval] = {}
        self._history: list[PendingApproval] = []
        self._default_timeout = default_timeout
        self._gate_audit: list[dict] = []

    async def request_approval(
        self,
        requester_id: str,
        operation: str,
        description: str,
        risk_level: RiskLevel = RiskLevel.MEDIUM,
        confidence: float = 0.5,
        send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
        timeout: Optional[float] = None,
        task_id: str = "",
        gate_id: str = "",
        approver: str = "",
    ) -> PendingApproval:
        """创建审批请求并发送给前端

        Args:
            requester_id: 请求者 ID (通常是 agent ID)
            operation: 操作描述
            description: 详细描述
            risk_level: 风险等级
            confidence: 置信度
            send_fn: 发送 WebSocket 消息的回调
            timeout: 超时时间（秒）
            task_id: 关联任务 ID（把关点引擎用）
            gate_id: 关联把关点 ID（把关点引擎用）
            approver: 指定把关人（空字符串表示默认审批流）

        Returns:
            PendingApproval 对象（包含 asyncio.Future 可等待）
        """
        request_id = str(uuid.uuid4())
        approval = PendingApproval(
            id=request_id,
            requester_id=requester_id,
            operation=operation,
            description=description,
            risk_level=risk_level,
            confidence=confidence,
            status=ApprovalStatus.PENDING,
            created_at=time.time(),
            task_id=task_id,
            gate_id=gate_id,
            approver=approver,
        )
        approval._future = asyncio.get_event_loop().create_future()

        self._pending[request_id] = approval

        # 发送给前端
        if send_fn:
            await send_fn({
                "type": "human_approval_request",
                "request": {
                    "id": approval.id,
                    "requesterId": approval.requester_id,
                    "operation": approval.operation,
                    "description": approval.description,
                    "riskLevel": approval.risk_level.value,
                    "confidence": approval.confidence,
                    "status": approval.status.value,
                    "createdAt": approval.created_at,
                    "taskId": approval.task_id,
                    "gateId": approval.gate_id,
                    "approver": approval.approver,
                },
            })

        logger.info("审批请求已创建: id=%s, operation=%s, risk=%s", request_id, operation, risk_level.value)
        return approval

    async def handle_response(
        self,
        request_id: str,
        approved: bool,
        reason: str = "",
        send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
    ) -> bool:
        """处理前端的审批响应

        Args:
            request_id: 审批请求 ID
            approved: 是否批准
            reason: 审批理由
            send_fn: 发送 WebSocket 消息的回调

        Returns:
            是否成功处理
        """
        approval = self._pending.get(request_id)
        if not approval:
            logger.warning("审批请求不存在: %s", request_id)
            return False

        if approval.status != ApprovalStatus.PENDING:
            logger.warning("审批请求已处理: %s, status=%s", request_id, approval.status.value)
            return False

        # 更新状态
        approval.status = ApprovalStatus.APPROVED if approved else ApprovalStatus.REJECTED
        approval.resolved_at = time.time()
        approval.resolution_reason = reason

        # 从待处理列表移到历史
        del self._pending[request_id]
        self._history.append(approval)

        # 解除 Future 阻塞
        if approval._future and not approval._future.done():
            approval._future.set_result({
                "approved": approved,
                "reason": reason,
                "request_id": request_id,
            })

        # 发送确认给前端
        if send_fn:
            await send_fn({
                "type": "human_approval_response",
                "requestId": request_id,
                "approved": approved,
                "reason": reason,
            })

        logger.info("审批已处理: id=%s, approved=%s, reason=%s", request_id, approved, reason)
        return True

    async def wait_for_decision(
        self,
        request_id: str,
        timeout: Optional[float] = None,
    ) -> dict:
        """等待审批决策

        Args:
            request_id: 审批请求 ID
            timeout: 超时时间（秒），None 使用默认超时

        Returns:
            {"approved": bool, "reason": str, "request_id": str}
        """
        approval = self._pending.get(request_id)
        if not approval or not approval._future:
            return {"approved": False, "reason": "Request not found", "request_id": request_id}

        effective_timeout = timeout if timeout is not None else self._default_timeout

        try:
            result = await asyncio.wait_for(approval._future, timeout=effective_timeout)
            return result
        except asyncio.TimeoutError:
            # 超时处理：记录状态后重新抛出，由调用方决定超时策略（如默认通过）
            approval.status = ApprovalStatus.EXPIRED
            approval.resolved_at = time.time()
            approval.resolution_reason = "Timeout"
            del self._pending[request_id]
            self._history.append(approval)
            logger.warning("审批超时: id=%s", request_id)
            raise

    async def request_gate(
        self,
        requester_id: str,
        operation: str,
        description: str,
        task_id: str = "",
        gate_id: str = "",
        approver: str = "",
        risk_level: RiskLevel = RiskLevel.MEDIUM,
        confidence: float = 0.5,
        send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
        timeout: Optional[float] = None,
    ) -> PendingApproval:
        """把关点请求：复用 request_approval，并记录 gate/requested 审计事件。"""
        pending = await self.request_approval(
            requester_id=requester_id,
            operation=operation,
            description=description,
            risk_level=risk_level,
            confidence=confidence,
            send_fn=send_fn,
            timeout=timeout,
            task_id=task_id,
            gate_id=gate_id,
            approver=approver,
        )
        self._gate_audit.append({
            "event": "gate/requested",
            "request_id": pending.id,
            "gate_id": gate_id,
            "task_id": task_id,
            "approver": approver,
        })
        return pending

    async def handle_gate_response(
        self,
        request_id: str,
        approved: bool,
        reason: str = "",
        send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
    ) -> bool:
        """把关点决定：复用 handle_response，并记录 gate/decided 审计事件。

        仅当 handle_response 真正解析了请求（request 存在且处于 PENDING）时才
        记录 decided 审计事件，保持 requested/decided 成对不变量；失败路径
        （request 不存在 / 已处理 / 已过期）直接返回 False，不写审计。
        """
        resolved = await self.handle_response(request_id, approved, reason=reason, send_fn=send_fn)
        if not resolved:
            return False
        gate_id, task_id, approver = "", "", ""
        for req in self._history:
            if req.id == request_id:
                gate_id, task_id, approver = req.gate_id, req.task_id, req.approver
                break
        self._gate_audit.append({
            "event": "gate/decided",
            "request_id": request_id,
            "gate_id": gate_id,
            "task_id": task_id,
            "approver": approver,
            "approved": approved,
            "reason": reason,
        })
        return True

    def get_gate_audit(self, gate_id: str = "") -> list[dict]:
        """把关点审计事件（requested/decided 成对）；gate_id 为空返回全部。

        返回元素级拷贝，防止调用方篡改内部审计日志。
        """
        if not gate_id:
            return [dict(e) for e in self._gate_audit]
        return [dict(e) for e in self._gate_audit if e.get("gate_id") == gate_id]

    def get_pending_requests(self) -> list[dict]:
        """获取所有待审批请求"""
        return [
            {
                "id": a.id,
                "requesterId": a.requester_id,
                "operation": a.operation,
                "description": a.description,
                "riskLevel": a.risk_level.value,
                "confidence": a.confidence,
                "status": a.status.value,
                "createdAt": a.created_at,
                "approver": a.approver,
                "taskId": a.task_id,
                "gateId": a.gate_id,
            }
            for a in self._pending.values()
        ]

    def get_pending_count(self) -> int:
        """获取待审批数量"""
        return len(self._pending)

    def get_history(self) -> list[dict]:
        """获取审批历史"""
        return [
            {
                "id": a.id,
                "requesterId": a.requester_id,
                "operation": a.operation,
                "approved": a.status == ApprovalStatus.APPROVED,
                "reason": a.resolution_reason,
                "resolvedAt": a.resolved_at,
            }
            for a in self._history
        ]

    def cancel_request(self, request_id: str) -> bool:
        """取消待审批请求"""
        approval = self._pending.get(request_id)
        if not approval:
            return False

        approval.status = ApprovalStatus.REJECTED
        approval.resolved_at = time.time()
        approval.resolution_reason = "Cancelled"

        if approval._future and not approval._future.done():
            approval._future.set_result({
                "approved": False,
                "reason": "Cancelled",
                "request_id": request_id,
            })

        del self._pending[request_id]
        self._history.append(approval)
        return True


# ── HITL 分级自动化 ──

# 白名单操作：只读、无副作用，自动通过
WHITELIST_OPERATIONS = frozenset({
    "read_file", "list_directory", "git_status", "git_diff", "git_log",
    "search_files", "grep_content",
    # Tier 1 扩展：常见开发操作自动通过（降低审批疲劳）
    "write_file", "edit_file", "run_tests", "run_linter",
    "create_document", "edit_document", "web_fetch",
})

# 高危操作：需要人工审批
HIGH_RISK_OPERATIONS = frozenset({
    "git_push", "git_commit",
})

# Shell 命令中的高危模式
HIGH_RISK_BASH_PATTERNS = [
    r'\brm\s+-rf\b', r'\bsudo\b', r'\bshutdown\b', r'\breboot\b',
    r'\bkill\s+-9\b', r'\bmkfs\b', r'\bdd\s+if=', r'\bformat\b',
    r'\bchmod\s+777\b', r'\bchown\s+root\b',
]


def classify_approval_tier(
    operation: str,
    description: str = "",
    context: Optional[Dict] = None,
) -> str:
    """分级判定审批层级。

    Returns:
        "auto_approve" — 白名单操作，无需审批
        "classifier" — 中等风险，由规则分类器判定
        "human" — 高危操作，需要人工审批
    """
    import re

    # Tier 1: 白名单 → 自动通过
    if operation in WHITELIST_OPERATIONS:
        return "auto_approve"

    # Tier 3: 高危操作 → 人工审批
    if operation in HIGH_RISK_OPERATIONS:
        return "human"

    # bash 操作需要检查命令内容
    if operation == "bash" and description:
        for pattern in HIGH_RISK_BASH_PATTERNS:
            if re.search(pattern, description, re.IGNORECASE):
                return "human"

    # Tier 2: 其他操作 → 分类器
    return "classifier"


def risk_classify(
    operation: str,
    description: str = "",
    context: Optional[Dict] = None,
) -> Dict:
    """风险分类器：对 classifier 层级的操作进行风险评估。

    Returns:
        {"approved": bool, "reason": str, "risk_score": float}
    """
    risk_score = 0.0
    reasons = []

    # 基于操作类型的基础风险分
    op_risk = {
        "write_file": 0.3,
        "edit_file": 0.3,
        "create_document": 0.2,
        "edit_document": 0.2,
        "bash": 0.6,
        "run_tests": 0.4,
        "run_linter": 0.2,
        "git_branch": 0.5,
    }
    risk_score = op_risk.get(operation, 0.5)

    # 上下文调整
    if context:
        # 文件路径风险
        path = context.get("path", "")
        if path:
            if any(p in path for p in ["/etc/", "/root/", "/var/", "/usr/"]):
                risk_score += 0.3
                reasons.append("系统目录")
            if path.endswith((".env", ".key", ".pem", "credentials")):
                risk_score += 0.4
                reasons.append("敏感文件")

    # bash 命令内容风险
    if operation == "bash" and description:
        import re
        # 中等风险命令
        medium_patterns = [
            r'\bcurl\b', r'\bwget\b', r'\bssh\b', r'\bscp\b',
            r'\bdocker\b', r'\bnpm\s+install\b', r'\bpip\s+install\b',
        ]
        for pattern in medium_patterns:
            if re.search(pattern, description, re.IGNORECASE):
                risk_score += 0.2
                reasons.append("网络/包管理命令")

    # 阈值判定
    if risk_score < 0.5:
        return {"approved": True, "reason": "低风险自动通过", "risk_score": risk_score}
    elif risk_score < 0.8:
        return {"approved": True, "reason": f"中等风险通过（{', '.join(reasons) or '操作类型'}）", "risk_score": risk_score}
    else:
        return {"approved": False, "reason": f"高风险需人工审批（{', '.join(reasons) or '综合评分'}）", "risk_score": risk_score}
