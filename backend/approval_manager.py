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

    async def request_approval(
        self,
        requester_id: str,
        operation: str,
        description: str,
        risk_level: RiskLevel = RiskLevel.MEDIUM,
        confidence: float = 0.5,
        send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
        timeout: Optional[float] = None,
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
            # 超时处理
            approval.status = ApprovalStatus.EXPIRED
            approval.resolved_at = time.time()
            approval.resolution_reason = "Timeout"
            del self._pending[request_id]
            self._history.append(approval)
            logger.warning("审批超时: id=%s", request_id)
            return {"approved": False, "reason": "Timeout", "request_id": request_id}

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
