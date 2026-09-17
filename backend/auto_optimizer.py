"""自动优化编排器 — 定期驱动完整的 RSI 闭环

周期性执行：
1. 运行离线优化器分析 AB 数据
2. 对高置信提案自动启动影子验证
3. 评估已完成的影子验证，晋升通过的
4. 检查活跃部署，回滚劣化的
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger("auto_optimizer")


class AutoOptimizer:
    """自动优化编排器

    将 optimizer → shadow → promote → rollback 串联为一个周期性任务。
    每轮只处理有限数量的变更，避免同时改太多参数。
    """

    # 每轮最多自动启动的影子验证数
    MAX_SHADOWS_PER_CYCLE = 2
    # 每轮最多晋升的部署数
    MAX_PROMOTIONS_PER_CYCLE = 1
    # 提案最低置信度才自动启动影子
    MIN_AUTO_SHADOW_CONFIDENCE = 0.5

    def __init__(self, registry, optimizer, deployment):
        self._registry = registry
        self._optimizer = optimizer
        self._deployment = deployment
        self._last_run: str = ""
        self._cycle_count = 0

    def run_cycle(self) -> dict:
        """执行一轮完整的自动优化

        Returns:
            本轮操作摘要
        """
        self._cycle_count += 1
        summary = {
            "cycle": self._cycle_count,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "shadows_started": [],
            "shadows_evaluated": [],
            "promoted": [],
            "rolled_back": [],
            "proposals_generated": 0,
        }

        # Step 1: 检查自动回滚
        try:
            rolled_back = self._deployment.check_rollbacks()
            summary["rolled_back"] = rolled_back
            if rolled_back:
                logger.warning("自动回滚 %d 个部署", len(rolled_back))
        except Exception as e:
            logger.warning("回滚检查失败: %s", e)

        # Step 2: 评估已完成的影子验证，晋升通过的
        promoted_count = 0
        try:
            shadows = self._deployment.list_deployments(status="shadow")
            for d in shadows:
                if promoted_count >= self.MAX_PROMOTIONS_PER_CYCLE:
                    break
                eval_result = self._deployment.evaluate_shadow(d["deployment_id"])
                if eval_result.get("ready"):
                    if self._deployment.promote(d["deployment_id"]):
                        promoted_count += 1
                        summary["promoted"].append({
                            "deployment_id": d["deployment_id"],
                            "param": d["param_name"],
                            "new_value": d["new_value"],
                        })
                        logger.info("自动晋升: %s = %.4f", d["param_name"], d["new_value"])
                elif eval_result.get("samples", 0) > 0:
                    summary["shadows_evaluated"].append({
                        "deployment_id": d["deployment_id"],
                        "match_rate": eval_result.get("match_rate"),
                        "samples": eval_result.get("samples"),
                        "ready": False,
                    })
        except Exception as e:
            logger.warning("影子评估失败: %s", e)

        # Step 3: 运行优化器，对高置信提案启动影子验证
        try:
            report = self._optimizer.run(period_days=30)
            summary["proposals_generated"] = len(report.proposals)

            shadows_started = 0
            for proposal in report.proposals:
                if shadows_started >= self.MAX_SHADOWS_PER_CYCLE:
                    break
                if proposal.confidence < self.MIN_AUTO_SHADOW_CONFIDENCE:
                    continue
                # 跳过需要审批的参数
                param = self._registry.get_param(proposal.param_name)
                if param and param.requires_approval:
                    continue
                # 跳过已有活跃部署的参数
                existing = [
                    d for d in self._deployment.list_deployments()
                    if d["param_name"] == proposal.param_name and d["status"] in ("shadow", "active")
                ]
                if existing:
                    continue

                dep_id = self._deployment.start_shadow(
                    proposal.param_name, proposal.proposed_value,
                    reason=f"自动优化: {proposal.reason}",
                )
                if dep_id:
                    shadows_started += 1
                    summary["shadows_started"].append({
                        "deployment_id": dep_id,
                        "param": proposal.param_name,
                        "current": proposal.current_value,
                        "proposed": proposal.proposed_value,
                        "confidence": proposal.confidence,
                    })
                    logger.info("自动启动影子验证: %s %.4f→%.4f (conf=%.2f)",
                                proposal.param_name, proposal.current_value,
                                proposal.proposed_value, proposal.confidence)
        except Exception as e:
            logger.warning("优化器运行失败: %s", e)

        self._last_run = summary["timestamp"]
        return summary

    def get_status(self) -> dict:
        return {
            "cycle_count": self._cycle_count,
            "last_run": self._last_run,
            "max_shadows_per_cycle": self.MAX_SHADOWS_PER_CYCLE,
            "max_promotions_per_cycle": self.MAX_PROMOTIONS_PER_CYCLE,
            "min_auto_shadow_confidence": self.MIN_AUTO_SHADOW_CONFIDENCE,
        }
