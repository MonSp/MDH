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

        两层分析策略：
        1. 维度分析：基于 AB 数据的内在维度（规则效果、质量、数量）
        2. 时间区间分析：基于参数变更历史（需要跨天数据）

        Returns:
            OptimizationReport 包含参数变更提案
        """
        report = OptimizationReport(
            run_at=datetime.now(timezone.utc).isoformat(),
            data_period_days=period_days,
            total_tasks_analyzed=0,
        )

        cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).strftime("%Y-%m-%d")

        # Layer 1: 维度分析（不需要跨天数据）
        dim_proposals = self._analyze_dimensions(cutoff)
        report.proposals.extend(dim_proposals)

        # Layer 2: 时间区间分析（需要参数变更历史 + 跨天数据）
        for param in self._registry.list_params():
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

        # 去重：同名参数只保留最优提案
        seen: dict[str, TuningProposal] = {}
        for p in report.proposals:
            if p.param_name not in seen or p.expected_improvement > seen[p.param_name].expected_improvement:
                seen[p.param_name] = p
        report.proposals = sorted(seen.values(), key=lambda p: -p.expected_improvement)
        return report

    def _analyze_dimensions(self, cutoff: str) -> list[TuningProposal]:
        """维度分析：从 AB 数据的内在维度推导参数提案

        不依赖参数变更历史，单日数据即可分析。
        """
        proposals = []

        # 拉取聚合数据
        try:
            row = self._ab_conn.execute(
                """SELECT
                       SUM(total_tasks) as total,
                       SUM(tasks_with_rules) as with_rules,
                       SUM(success_with_rules) as success_wr,
                       SUM(success_without_rules) as success_wor,
                       SUM(rule_count_sum) as rule_count,
                       SUM(rule_score_sum) as rule_score
                   FROM task_type_performance
                   WHERE period_start >= ?""",
                (cutoff,),
            ).fetchone()
        except Exception:
            return proposals

        total = row["total"] or 0
        with_rules = row["with_rules"] or 0
        success_wr = row["success_wr"] or 0
        success_wor = row["success_wor"] or 0
        rule_count = row["rule_count"] or 0
        rule_score = row["rule_score"] or 0.0

        if total < 20:
            return proposals  # 总样本不足

        without_rules = total - with_rules
        wr_rate = success_wr / with_rules if with_rules > 0 else 0.0
        wor_rate = success_wor / without_rules if without_rules > 0 else 0.0
        improvement = (wr_rate - wor_rate) * 100  # 百分点
        avg_rule_score = rule_score / with_rules if with_rules > 0 else 0.0
        avg_rule_count = rule_count / with_rules if with_rules > 0 else 0.0

        # ── 提案 1: explore_ratio ──
        # 规则效果好 → 降低探索率（更多利用已知好规则）
        # 规则效果差 → 提高探索率（需要探索新领域）
        if with_rules >= self.MIN_SAMPLE_SIZE and without_rules >= self.MIN_SAMPLE_SIZE:
            current_explore = self._registry.get("experience.explore_ratio") or 0.2
            if improvement > 10:
                # 规则效果显著 → 降低探索
                proposed = max(0.05, current_explore - 0.05)
                conf = self._compute_confidence(min(with_rules, without_rules), total, improvement)
                proposals.append(TuningProposal(
                    param_name="experience.explore_ratio",
                    current_value=current_explore,
                    proposed_value=proposed,
                    expected_improvement=round(improvement * 0.1, 2),  # 预期收益的10%
                    confidence=conf,
                    sample_size=total,
                    reason=f"规则注入提升成功率 {improvement:.1f}%（{wr_rate:.1%} vs {wor_rate:.1%}），降低探索率以利用已验证规则",
                ))
            elif improvement < -5:
                # 规则反而有害 → 提高探索
                proposed = min(0.5, current_explore + 0.05)
                conf = self._compute_confidence(min(with_rules, without_rules), total, abs(improvement))
                proposals.append(TuningProposal(
                    param_name="experience.explore_ratio",
                    current_value=current_explore,
                    proposed_value=proposed,
                    expected_improvement=round(abs(improvement) * 0.05, 2),
                    confidence=conf,
                    sample_size=total,
                    reason=f"规则注入降低成功率 {improvement:.1f}%，提高探索率以跳出低质量规则",
                ))

        # ── 提案 2: demotion_threshold ──
        # 平均规则分数低 → 提高降级阈值（更严格地淘汰差规则）
        if with_rules >= self.MIN_SAMPLE_SIZE:
            current_demo = self._registry.get("experience.demotion_threshold") or 0.4
            if avg_rule_score < 0.5 and avg_rule_score > 0:
                proposed = min(0.6, current_demo + 0.05)
                conf = self._compute_confidence(with_rules, total, (0.5 - avg_rule_score) * 20)
                proposals.append(TuningProposal(
                    param_name="experience.demotion_threshold",
                    current_value=current_demo,
                    proposed_value=proposed,
                    expected_improvement=round((0.5 - avg_rule_score) * 10, 2),
                    confidence=conf,
                    sample_size=with_rules,
                    reason=f"平均规则分数 {avg_rule_score:.2f} 偏低，提高降级阈值以淘汰低质量规则",
                ))

        # ── 提案 3: auto_approve_min_confidence ──
        # 规则分数低 → 提高自动审批门槛
        if with_rules >= self.MIN_SAMPLE_SIZE:
            current_conf = self._registry.get("experience.auto_approve_min_confidence") or 0.7
            if avg_rule_score < 0.55:
                proposed = min(0.95, current_conf + 0.05)
                conf = self._compute_confidence(with_rules, total, (0.55 - avg_rule_score) * 15)
                proposals.append(TuningProposal(
                    param_name="experience.auto_approve_min_confidence",
                    current_value=current_conf,
                    proposed_value=proposed,
                    expected_improvement=round((0.55 - avg_rule_score) * 8, 2),
                    confidence=conf,
                    sample_size=with_rules,
                    reason=f"平均规则分数 {avg_rule_score:.2f} 偏低，提高自动审批门槛以保证规则质量",
                ))

        # ── 提案 4: evolution_min_usage ──
        # 注入规则多但成功率不高 → 降低进化触发门槛（让差规则更快被进化）
        if with_rules >= self.MIN_SAMPLE_SIZE and avg_rule_count > 3:
            current_evo = self._registry.get("experience.evolution_min_usage") or 5
            if wr_rate < 0.6:
                proposed = max(2, current_evo - 1)
                conf = self._compute_confidence(with_rules, total, (0.6 - wr_rate) * 10)
                proposals.append(TuningProposal(
                    param_name="experience.evolution_min_usage",
                    current_value=current_evo,
                    proposed_value=proposed,
                    expected_improvement=round((0.6 - wr_rate) * 5, 2),
                    confidence=conf,
                    sample_size=with_rules,
                    reason=f"注入 {avg_rule_count:.1f} 条规则但成功率仅 {wr_rate:.1%}，降低进化触发门槛加速规则迭代",
                ))

        return proposals

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
