"""离线参数优化器 — 从 A/B 数据中找最优参数

不在线改参数，而是：
1. 从 AB Tracker 拉取历史数据
2. 按参数值分桶分析
3. 找到使成功率最大化的参数值
4. 生成参数变更提案
"""

import logging
import math
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("tuning_optimizer")


@dataclass
class TuningProposal:
    """参数调优提案"""
    param_name: str
    current_value: float
    proposed_value: float
    expected_improvement: float  # 预期成功率提升（百分点）
    confidence: float            # 置信度 0-1
    sample_size: int             # 支撑数据量
    reason: str = ""


@dataclass
class OptimizationReport:
    """优化报告"""
    run_at: str
    data_period_days: int
    total_tasks_analyzed: int
    proposals: list[TuningProposal] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)  # 数据不足等跳过原因

    def to_dict(self) -> dict:
        return {
            "run_at": self.run_at,
            "data_period_days": self.data_period_days,
            "total_tasks_analyzed": self.total_tasks_analyzed,
            "proposals": [
                {
                    "param_name": p.param_name,
                    "current_value": p.current_value,
                    "proposed_value": p.proposed_value,
                    "expected_improvement": p.expected_improvement,
                    "confidence": p.confidence,
                    "sample_size": p.sample_size,
                    "reason": p.reason,
                }
                for p in self.proposals
            ],
            "skipped": self.skipped,
        }


class TuningOptimizer:
    """离线参数优化器

    使用 AB Tracker 数据 + 参数变更历史，
    分析不同参数值下的任务成功率差异。
    """

    # 最小样本量：每个参数值分桶至少需要这么多任务
    MIN_SAMPLE_SIZE = 10
    # 最小置信度：低于此值的提案直接丢弃
    MIN_CONFIDENCE = 0.3

    def __init__(self, registry, ab_conn: sqlite3.Connection):
        self._registry = registry
        self._ab_conn = ab_conn

    def run(self, period_days: int = 30) -> OptimizationReport:
        """运行一轮优化分析

        Returns:
            OptimizationReport 包含参数变更提案
        """
        report = OptimizationReport(
            run_at=datetime.now(timezone.utc).isoformat(),
            data_period_days=period_days,
            total_tasks_analyzed=0,
        )

        cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).strftime("%Y-%m-%d")

        # 分析每个已注册参数
        for param in self._registry.list_params():
            # 需要审批的参数只分析不提案
            proposals = self._analyze_param(param, cutoff, period_days)
            if proposals:
                if param.requires_approval:
                    for p in proposals:
                        p.reason += " [需人工确认]"
                    report.proposals.extend(proposals)
                else:
                    report.proposals.extend(proposals)

        # 统计总任务数
        try:
            row = self._ab_conn.execute(
                "SELECT SUM(total_tasks) as t FROM task_type_performance WHERE period_start >= ?",
                (cutoff,),
            ).fetchone()
            report.total_tasks_analyzed = row["t"] or 0 if row else 0
        except Exception:
            pass

        # 按预期提升排序
        report.proposals.sort(key=lambda p: -p.expected_improvement)
        return report

    def _analyze_param(self, param, cutoff: str, period_days: int) -> list[TuningProposal]:
        """分析单个参数的最优值"""
        # 从参数变更历史中获取不同值对应的成功率
        history = self._registry.get_history(param.name, limit=100)
        if not history:
            # 无变更历史 → 没有对比数据
            return []

        # 按参数值分桶：收集每个参数值生效期间的任务数据
        # 简化实现：用变更时间点切割 AB 数据
        buckets: dict[str, dict] = {}  # value_key → {tasks, successes}
        changes = sorted(history, key=lambda h: h["timestamp"])

        # 构建时间区间
        intervals = []
        prev_time = cutoff
        prev_value = None
        for change in changes:
            if prev_value is not None:
                intervals.append((prev_time, change["timestamp"], prev_value))
            prev_time = change["timestamp"]
            prev_value = change["new_value"]
        # 最后一个区间到当前
        if prev_value is not None:
            intervals.append((prev_time, datetime.now(timezone.utc).isoformat(), prev_value))

        if not intervals:
            return []

        # 按区间查询 AB 数据
        for start, end, value in intervals:
            try:
                rows = self._ab_conn.execute(
                    """SELECT SUM(total_tasks) as t, SUM(success_with_rules + success_without_rules) as s
                       FROM task_type_performance
                       WHERE period_start >= ? AND period_start <= ?""",
                    (start[:10], end[:10]),
                ).fetchall()
                for row in rows:
                    tasks = row["t"] or 0
                    success = row["s"] or 0
                    if tasks > 0:
                        key = f"{value:.4f}"
                        if key not in buckets:
                            buckets[key] = {"tasks": 0, "success": 0}
                        buckets[key]["tasks"] += tasks
                        buckets[key]["success"] += success
            except Exception:
                continue

        # 需要至少 2 个不同值的桶才有对比意义
        valid_buckets = {k: v for k, v in buckets.items() if v["tasks"] >= self.MIN_SAMPLE_SIZE}
        if len(valid_buckets) < 2:
            return []

        # 计算每个桶的成功率
        rates = {}
        for key, data in valid_buckets.items():
            rates[key] = data["success"] / data["tasks"] if data["tasks"] > 0 else 0.0

        # 找最优桶
        best_key = max(rates, key=rates.get)
        best_value = float(best_key)
        best_rate = rates[best_key]

        # 当前值的桶
        current_key = f"{param.current:.4f}"
        current_rate = rates.get(current_key, 0.0)

        # 预期提升
        improvement = (best_rate - current_rate) * 100  # 百分点

        # 置信度：基于样本量和提升幅度
        total_samples = sum(d["tasks"] for d in valid_buckets.values())
        best_samples = valid_buckets[best_key]["tasks"]
        confidence = self._compute_confidence(best_samples, total_samples, improvement)

        if improvement < 0.5 or confidence < self.MIN_CONFIDENCE:
            return []  # 提升不显著

        proposal = TuningProposal(
            param_name=param.name,
            current_value=param.current,
            proposed_value=param.clamp(best_value),
            expected_improvement=round(improvement, 2),
            confidence=round(confidence, 3),
            sample_size=total_samples,
            reason=f"分析 {len(valid_buckets)} 个参数值区间，{best_key} 时成功率 {best_rate:.1%}（当前 {current_rate:.1%}）",
        )
        return [proposal]

    @staticmethod
    def _compute_confidence(best_samples: int, total_samples: int, improvement_pct: float) -> float:
        """计算提案置信度（基于样本量和提升幅度的启发式）"""
        if total_samples == 0:
            return 0.0
        # 样本量因子：样本越多越可信
        sample_factor = min(1.0, math.log2(max(best_samples, 1)) / 5)
        # 提升幅度因子：提升越大越可信
        improvement_factor = min(1.0, improvement_pct / 10.0)
        return sample_factor * 0.6 + improvement_factor * 0.4

    def apply_proposals(self, report: OptimizationReport, auto_apply: bool = False) -> list[dict]:
        """应用提案到注册表

        Args:
            report: 优化报告
            auto_apply: True 时自动应用不需要审批的提案

        Returns:
            应用结果列表
        """
        results = []
        for proposal in report.proposals:
            param = self._registry.get_param(proposal.param_name)
            if param is None:
                results.append({"param": proposal.param_name, "applied": False, "reason": "参数不存在"})
                continue

            if param.requires_approval and auto_apply:
                results.append({"param": proposal.param_name, "applied": False, "reason": "需要人工确认"})
                continue

            if auto_apply:
                success = self._registry.set_value(
                    proposal.param_name, proposal.proposed_value,
                    reason=f"自动优化: {proposal.reason}",
                    applied_by="optimizer",
                )
                results.append({
                    "param": proposal.param_name,
                    "applied": success,
                    "old_value": proposal.current_value,
                    "new_value": proposal.proposed_value,
                    "improvement": proposal.expected_improvement,
                })
            else:
                results.append({
                    "param": proposal.param_name,
                    "applied": False,
                    "reason": "待人工确认",
                    "proposal": {
                        "current": proposal.current_value,
                        "proposed": proposal.proposed_value,
                        "improvement": proposal.expected_improvement,
                    },
                })
        return results
