import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
from enum import Enum

logger = logging.getLogger(__name__)

# 审计事件默认持久化目录：<backend>/data/session_logs/audit.jsonl（data/* 已 gitignore）
DEFAULT_AUDIT_LOG_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "session_logs"
)


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class AuditEntry:
    id: str
    agent_id: str
    operation: str
    target: str
    risk_level: RiskLevel
    allowed: bool
    reason: str
    timestamp: float
    signers: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """转为 JSON 序列化 dict；复用 SessionEvent 事件结构判别字段（event_type='audit'）。"""
        risk_level = (
            self.risk_level.value
            if isinstance(self.risk_level, RiskLevel)
            else str(self.risk_level)
        )
        return {
            "event_type": "audit",
            "id": self.id,
            "agent_id": self.agent_id,
            "operation": self.operation,
            "target": self.target,
            "risk_level": risk_level,
            "allowed": self.allowed,
            "reason": self.reason,
            "timestamp": self.timestamp,
            "signers": list(self.signers),
        }


@dataclass
class RateLimitConfig:
    capability: str
    max_operations: int
    window_seconds: float


@dataclass
class OperationRequest:
    agent_id: str
    capability: str
    operation: str
    target: str
    params: Optional[Dict] = None


class SecurityMiddleware:
    def __init__(self, audit_log_dir: Optional[str] = None) -> None:
        self._high_risk_capabilities: set[str] = {"browser_automation", "file_operation"}
        self._dual_signature_capabilities: set[str] = {"browser_automation"}
        # 工具级风险映射：高危操作需要明确批准
        self._high_risk_tools: set[str] = {"bash"}
        self._denied_patterns: list[str] = [
            "rm -rf /", "rm -rf /*", "mkfs", "dd if=", "> /dev/",
            "chmod 777 /", "shutdown", "reboot", "halt",
            ":(){ :|:& };:",  # fork bomb
        ]
        self._rate_limits: Dict[str, RateLimitConfig] = {
            "browser_automation": RateLimitConfig("browser_automation", 10, 60.0),
            "file_operation": RateLimitConfig("file_operation", 10, 60.0),
        }
        self._audit_log: List[AuditEntry] = []
        self._operation_counts: Dict[str, Tuple[int, float]] = {}
        self._pending_signatures: Dict[str, dict] = {}
        # 审计事件持久化目录（None → 默认 backend/data/session_logs；写入失败降级内存）
        self._audit_log_dir: Optional[str] = (
            audit_log_dir if audit_log_dir is not None else DEFAULT_AUDIT_LOG_DIR
        )

    def check_operation(
        self,
        agent_id: str,
        capability: str,
        operation: str,
        target: str,
    ) -> dict:
        # 检查拒绝模式（危险命令直接拒绝）
        for pattern in self._denied_patterns:
            if pattern in operation:
                self._log_audit(agent_id, operation, target, capability, False, f"Denied: matches pattern '{pattern}'", [])
                return {"allowed": False, "requires_signature": False, "reason": f"Dangerous operation blocked: {pattern}"}

        # 检查高危工具（需要 dual signature）
        # 同时检查 capability 和 operation，因为调用方可能传工具名作为 capability
        if capability in self._high_risk_tools or operation in self._high_risk_tools:
            pending_id = str(uuid.uuid4())
            self._pending_signatures[pending_id] = {
                "request": OperationRequest(agent_id, capability, operation, target),
                "signers": [],
            }
            self._log_audit(agent_id, operation, target, capability, False, "High-risk tool requires approval", [])
            return {
                "allowed": False,
                "requires_signature": True,
                "pending_id": pending_id,
                "reason": f"High-risk tool '{capability}' requires approval",
            }

        if not self._check_rate_limit(agent_id, capability):
            self._log_audit(agent_id, operation, target, capability, False, "Rate limit exceeded", [])
            return {"allowed": False, "requires_signature": False, "reason": "Rate limit exceeded"}

        if capability in self._dual_signature_capabilities:
            pending_id = str(uuid.uuid4())
            self._pending_signatures[pending_id] = {
                "request": OperationRequest(agent_id, capability, operation, target),
                "signers": [],
            }
            self._log_audit(agent_id, operation, target, capability, False, "Requires dual signature", [])
            return {
                "allowed": False,
                "requires_signature": True,
                "pending_id": pending_id,
                "reason": "Requires dual signature",
            }

        self._log_audit(agent_id, operation, target, capability, True, "Operation approved", [])
        return {"allowed": True, "requires_signature": False, "reason": "Operation approved"}

    def sign_operation(self, pending_id: str, signer_id: str) -> dict:
        if pending_id not in self._pending_signatures:
            return {"approved": False, "reason": "Pending signature request not found"}

        pending = self._pending_signatures[pending_id]
        if signer_id in pending["signers"]:
            return {"approved": False, "reason": "Signer has already signed"}

        pending["signers"].append(signer_id)

        if len(pending["signers"]) >= 2:
            request = pending["request"]
            del self._pending_signatures[pending_id]
            self._log_audit(
                request.agent_id, request.operation, request.target,
                request.capability, True, "Dual signature approved",
                pending["signers"],
            )
            return {"approved": True, "reason": "Operation approved with dual signature"}

        return {
            "approved": False,
            "reason": f"Requires {2 - len(pending['signers'])} more signature(s)",
        }

    def get_audit_log(
        self,
        agent_id: Optional[str] = None,
        operation: Optional[str] = None,
        risk_level: Optional[RiskLevel] = None,
    ) -> List[AuditEntry]:
        entries = self._audit_log
        if agent_id:
            entries = [e for e in entries if e.agent_id == agent_id]
        if operation:
            entries = [e for e in entries if e.operation == operation]
        if risk_level:
            entries = [e for e in entries if e.risk_level == risk_level]
        return entries

    def is_high_risk(self, capability: str) -> bool:
        return capability in self._high_risk_capabilities

    def requires_dual_signature(self, capability: str) -> bool:
        return capability in self._dual_signature_capabilities

    def _check_rate_limit(self, agent_id: str, capability: str) -> bool:
        config = self._rate_limits.get(capability)
        if not config:
            return True

        key = f"{agent_id}:{capability}"
        now = time.time()

        if key not in self._operation_counts:
            self._operation_counts[key] = (1, now)
            return True

        count, window_start = self._operation_counts[key]
        if now - window_start > config.window_seconds:
            self._operation_counts[key] = (1, now)
            return True

        if count >= config.max_operations:
            return False

        self._operation_counts[key] = (count + 1, window_start)
        return True

    def _log_audit(
        self,
        agent_id: str,
        operation: str,
        target: str,
        capability: str,
        allowed: bool,
        reason: str,
        signers: List[str],
    ) -> None:
        risk_level = self._determine_risk_level(capability)
        entry = AuditEntry(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            operation=operation,
            target=target,
            risk_level=risk_level,
            allowed=allowed,
            reason=reason,
            timestamp=time.time(),
            signers=signers,
        )
        self._audit_log.append(entry)
        self._persist_audit(entry)

    def _persist_audit(self, entry: AuditEntry) -> None:
        """审计事件持久化：追加写 <dir>/audit.jsonl（IOError/OSError 降级内存）。"""
        if not self._audit_log_dir:
            return
        try:
            os.makedirs(self._audit_log_dir, exist_ok=True)
            path = os.path.join(self._audit_log_dir, "audit.jsonl")
            with open(path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry.to_dict(), ensure_ascii=False) + "\n")
        except (IOError, OSError):
            # IOError 静默降级为纯内存模式，不破坏 _log_audit 调用方行为
            logger.warning(
                "audit.jsonl 追加失败（降级为内存模式）: %s", self._audit_log_dir
            )

    def _determine_risk_level(self, capability: str) -> RiskLevel:
        if capability in self._high_risk_capabilities:
            return RiskLevel.HIGH
        return RiskLevel.LOW
