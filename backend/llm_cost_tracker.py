"""LLM 成本追踪器 — 记录每次 LLM 调用的 token/角色/成本

受 Cumora '每次 LLM 调用必须记账' 架构原则启发。
"""

import json
import logging
import os
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger("llm_cost")

# 模型定价（每 1M token，USD）
MODEL_PRICING = {
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "claude-opus-4-7": {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-7": {"input": 3.00, "output": 15.00},
    "claude-haiku-3-5": {"input": 0.80, "output": 4.00},
}
DEFAULT_PRICING = {"input": 1.00, "output": 2.00}


@dataclass
class LLMCallRecord:
    """单次 LLM 调用记录"""
    call_id: str
    timestamp: str
    model: str
    role: str           # agent turn / triage / review / discussion / classification
    agent_id: str
    task_id: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    duration_ms: int
    success: bool


class LLMCostTracker:
    """LLM 成本追踪器（线程安全，JSON 持久化）"""

    def __init__(self, data_dir: str):
        self._path = os.path.join(data_dir, "llm_costs.json")
        self._lock = threading.Lock()
        self._records: List[dict] = []
        self._load()

    def _load(self) -> None:
        if os.path.isfile(self._path):
            try:
                with open(self._path, encoding="utf-8") as f:
                    self._records = json.load(f)
            except Exception:
                self._records = []

    def _save(self) -> None:
        try:
            os.makedirs(os.path.dirname(self._path), exist_ok=True)
            tmp = self._path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._records, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._path)
        except Exception:
            logger.exception("Failed to save LLM cost records")

    @staticmethod
    def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
        """估算调用成本（USD）"""
        pricing = DEFAULT_PRICING
        for key, p in MODEL_PRICING.items():
            if key in model.lower():
                pricing = p
                break
        return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

    def record_call(
        self,
        model: str,
        role: str,
        agent_id: str = "",
        task_id: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_ms: int = 0,
        success: bool = True,
    ) -> LLMCallRecord:
        """记录一次 LLM 调用"""
        import uuid
        cost = self._estimate_cost(model, input_tokens, output_tokens)
        record = LLMCallRecord(
            call_id=str(uuid.uuid4())[:8],
            timestamp=datetime.now(timezone.utc).isoformat(),
            model=model,
            role=role,
            agent_id=agent_id,
            task_id=task_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6),
            duration_ms=duration_ms,
            success=success,
        )
        with self._lock:
            self._records.append(asdict(record))
            self._save()
        return record

    def get_summary(self) -> Dict:
        """成本汇总"""
        with self._lock:
            records = self._records

        if not records:
            return {"total_calls": 0, "total_cost_usd": 0, "by_role": {}, "by_model": {}, "by_agent": {}}

        total_cost = sum(r["cost_usd"] for r in records)
        total_tokens_in = sum(r["input_tokens"] for r in records)
        total_tokens_out = sum(r["output_tokens"] for r in records)

        by_role: Dict[str, Dict] = {}
        by_model: Dict[str, Dict] = {}
        by_agent: Dict[str, Dict] = {}

        for r in records:
            role = r.get("role", "unknown")
            model = r.get("model", "unknown")
            agent = r.get("agent_id", "unknown")

            if role not in by_role:
                by_role[role] = {"calls": 0, "cost_usd": 0, "tokens": 0}
            by_role[role]["calls"] += 1
            by_role[role]["cost_usd"] += r["cost_usd"]
            by_role[role]["tokens"] += r["input_tokens"] + r["output_tokens"]

            if model not in by_model:
                by_model[model] = {"calls": 0, "cost_usd": 0}
            by_model[model]["calls"] += 1
            by_model[model]["cost_usd"] += r["cost_usd"]

            if agent not in by_agent:
                by_agent[agent] = {"calls": 0, "cost_usd": 0}
            by_agent[agent]["calls"] += 1
            by_agent[agent]["cost_usd"] += r["cost_usd"]

        # 圆整
        for d in [by_role, by_model, by_agent]:
            for v in d.values():
                v["cost_usd"] = round(v["cost_usd"], 6)

        return {
            "total_calls": len(records),
            "total_cost_usd": round(total_cost, 6),
            "total_tokens_in": total_tokens_in,
            "total_tokens_out": total_tokens_out,
            "by_role": by_role,
            "by_model": by_model,
            "by_agent": by_agent,
        }

    def get_records(self, limit: int = 100) -> List[dict]:
        """获取最近的调用记录"""
        with self._lock:
            return list(reversed(self._records[-limit:]))


# 全局单例
_tracker: Optional[LLMCostTracker] = None


def get_tracker(data_dir: str = "") -> LLMCostTracker:
    global _tracker
    if _tracker is None:
        if not data_dir:
            data_dir = os.path.join(os.path.dirname(__file__), "data")
        _tracker = LLMCostTracker(data_dir)
    return _tracker
