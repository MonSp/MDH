"""审批/检查点相关协议类型"""

from dataclasses import dataclass, field
from enum import Enum


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ApprovalRequest:
    id: str
    requester_id: str
    operation: str
    description: str
    risk_level: RiskLevel = RiskLevel.MEDIUM
    confidence: float = 0.5
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: float = 0.0


@dataclass
class Checkpoint:
    id: str
    task_id: str
    step_index: int
    state_snapshot: dict = field(default_factory=dict)
    created_at: float = 0.0


@dataclass
class AuditEntry:
    id: str
    agent_id: str
    operation: str
    target: str
    risk_level: RiskLevel = RiskLevel.LOW
    result: str = ""
    details: dict = field(default_factory=dict)
    timestamp: float = 0.0


@dataclass
class CompensateAction:
    description: str
    action_type: str = ""
    params: dict = field(default_factory=dict)


# ── 序列化函数 ──

def approval_request_to_dict(req: ApprovalRequest) -> dict:
    return {
        "id": req.id,
        "requester_id": req.requester_id,
        "operation": req.operation,
        "description": req.description,
        "risk_level": req.risk_level.value,
        "confidence": req.confidence,
        "status": req.status.value,
        "created_at": req.created_at,
    }


def checkpoint_to_dict(cp: Checkpoint) -> dict:
    return {
        "id": cp.id,
        "task_id": cp.task_id,
        "step_index": cp.step_index,
        "state_snapshot": cp.state_snapshot,
        "created_at": cp.created_at,
    }


def audit_entry_to_dict(entry: AuditEntry) -> dict:
    return {
        "id": entry.id,
        "agent_id": entry.agent_id,
        "operation": entry.operation,
        "target": entry.target,
        "risk_level": entry.risk_level.value,
        "result": entry.result,
        "details": entry.details,
        "timestamp": entry.timestamp,
    }


def compensate_action_to_dict(action: CompensateAction) -> dict:
    return {
        "description": action.description,
        "action_type": action.action_type,
        "params": action.params,
    }


def dict_to_approval_request(data: dict) -> ApprovalRequest:
    return ApprovalRequest(
        id=data["id"],
        requester_id=data["requester_id"],
        operation=data["operation"],
        description=data["description"],
        risk_level=RiskLevel(data["risk_level"]) if "risk_level" in data else RiskLevel.MEDIUM,
        confidence=data.get("confidence", 0.5),
        status=ApprovalStatus(data["status"]) if "status" in data else ApprovalStatus.PENDING,
        created_at=data.get("created_at", 0.0),
    )


def dict_to_checkpoint(data: dict) -> Checkpoint:
    return Checkpoint(
        id=data["id"],
        task_id=data["task_id"],
        step_index=data["step_index"],
        state_snapshot=data.get("state_snapshot", {}),
        created_at=data.get("created_at", 0.0),
    )


def dict_to_audit_entry(data: dict) -> AuditEntry:
    return AuditEntry(
        id=data["id"],
        agent_id=data["agent_id"],
        operation=data["operation"],
        target=data["target"],
        risk_level=RiskLevel(data["risk_level"]) if "risk_level" in data else RiskLevel.LOW,
        result=data.get("result", ""),
        details=data.get("details", {}),
        timestamp=data.get("timestamp", 0.0),
    )


def dict_to_compensate_action(data: dict) -> CompensateAction:
    return CompensateAction(
        description=data["description"],
        action_type=data.get("action_type", ""),
        params=data.get("params", {}),
    )
