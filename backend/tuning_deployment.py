"""参数部署管理器 — 影子验证 + 受控部署 + 自动回滚

Phase 3: 影子验证 — 新参数先记录决策，不实际执行，对比旧参数
Phase 4: 受控部署 — 版本化变更，指标劣化自动回滚
"""

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("tuning_deployment")


@dataclass
class DeploymentRecord:
    """一次参数部署记录"""
    deployment_id: str
    param_name: str
    old_value: float
    new_value: float
    status: str  # shadow / active / promoted / rolled_back / expired
    created_at: str
    promoted_at: str = ""
    rolled_back_at: str = ""
    reason: str = ""
    # 影子验证期间的统计
    shadow_tasks: int = 0
    shadow_decisions_match: int = 0  # 新旧参数决策一致的次数
    shadow_decisions_differ: int = 0  # 决策不同的次数
    # 部署后的指标追踪
    baseline_success_rate: float = 0.0  # 部署前的成功率
    post_deploy_success_rate: float = 0.0  # 部署后的成功率
    post_deploy_tasks: int = 0


@dataclass
class ShadowDecision:
    """影子验证中的单次决策记录"""
    deployment_id: str
    task_type: str
    old_decision: str  # 旧参数下的决策描述
    new_decision: str  # 新参数下的决策描述
    match: bool
    timestamp: str


class DeploymentManager:
    """参数部署管理器

    生命周期: shadow → active → promoted / rolled_back
    """

    # 影子验证最少样本量
    SHADOW_MIN_SAMPLES = 20
    # 影子验证决策一致率阈值（低于此值说明新参数行为差异大，需人工确认）
    SHADOW_MATCH_THRESHOLD = 0.7
    # 自动回滚：部署后成功率下降超过此百分点
    ROLLBACK_DROP_THRESHOLD = 5.0
    # 自动回滚：最少任务数（避免小样本误判）
    ROLLBACK_MIN_TASKS = 30
    # 部署观察期（小时）
    OBSERVATION_HOURS = 48

    def __init__(self, registry, ab_conn, config_path: str):
        self._registry = registry
        self._ab_conn = ab_conn
        self._config_path = config_path
        self._lock = threading.Lock()
        self._deployments: dict[str, DeploymentRecord] = {}
        self._shadow_decisions: list[ShadowDecision] = []
        self._load()

    # ──────────────────── 影子验证 (Phase 3) ────────────────────

    def start_shadow(self, param_name: str, proposed_value: float, reason: str = "") -> str | None:
        """启动影子验证：新参数并行运行但不实际生效

        Returns:
            deployment_id，失败返回 None
        """
        param = self._registry.get_param(param_name)
        if param is None:
            logger.warning("参数 %s 未注册", param_name)
            return None

        old_value = param.current
        new_value = param.clamp(proposed_value)

        if abs(new_value - old_value) < 1e-9:
            logger.info("参数 %s 新旧值相同，跳过影子验证", param_name)
            return None

        # 检查是否已有同参数的活跃部署
        for d in self._deployments.values():
            if d.param_name == param_name and d.status in ("shadow", "active"):
                logger.info("参数 %s 已有活跃部署 %s，跳过", param_name, d.deployment_id)
                return None

        deployment_id = f"deploy-{param_name.replace('.', '-')}-{int(datetime.now(timezone.utc).timestamp())}"

        # 记录部署前的基线成功率
        baseline = self._get_recent_success_rate(days=7)

        record = DeploymentRecord(
            deployment_id=deployment_id,
            param_name=param_name,
            old_value=old_value,
            new_value=new_value,
            status="shadow",
            created_at=datetime.now(timezone.utc).isoformat(),
            reason=reason,
            baseline_success_rate=baseline,
        )

        with self._lock:
            self._deployments[deployment_id] = record
            self._save()

        logger.info("影子验证启动: %s (%.4f → %.4f), 基线成功率 %.1f%%",
                     deployment_id, old_value, new_value, baseline * 100)
        return deployment_id

    def record_shadow_decision(
        self,
        deployment_id: str,
        task_type: str,
        old_decision: str,
        new_decision: str,
    ) -> bool:
        """记录一次影子验证决策对比"""
        with self._lock:
            record = self._deployments.get(deployment_id)
            if record is None or record.status != "shadow":
                return False

            match = old_decision == new_decision
            decision = ShadowDecision(
                deployment_id=deployment_id,
                task_type=task_type,
                old_decision=old_decision,
                new_decision=new_decision,
                match=match,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
            self._shadow_decisions.append(decision)
            record.shadow_tasks += 1
            if match:
                record.shadow_decisions_match += 1
            else:
                record.shadow_decisions_differ += 1
            self._save()
            return True

    def evaluate_shadow(self, deployment_id: str) -> dict:
        """评估影子验证结果，决定是否可以晋升为活跃部署

        Returns:
            {"ready": bool, "match_rate": float, "samples": int, "recommendation": str}
        """
        with self._lock:
            record = self._deployments.get(deployment_id)
            if record is None:
                return {"ready": False, "reason": "部署不存在"}
            if record.status != "shadow":
                return {"ready": False, "reason": f"状态为 {record.status}，非影子阶段"}

            samples = record.shadow_tasks
            match_rate = (record.shadow_decisions_match / samples) if samples > 0 else 0.0

        if samples < self.SHADOW_MIN_SAMPLES:
            return {
                "ready": False,
                "match_rate": round(match_rate, 3),
                "samples": samples,
                "recommendation": f"样本不足（{samples}/{self.SHADOW_MIN_SAMPLES}），继续观察",
            }

        if match_rate >= self.SHADOW_MATCH_THRESHOLD:
            return {
                "ready": True,
                "match_rate": round(match_rate, 3),
                "samples": samples,
                "recommendation": f"决策一致率 {match_rate:.0%}，可以晋升为活跃部署",
            }
        else:
            return {
                "ready": False,
                "match_rate": round(match_rate, 3),
                "samples": samples,
                "recommendation": f"决策一致率 {match_rate:.0%} 低于阈值 {self.SHADOW_MATCH_THRESHOLD:.0%}，"
                                  f"新参数行为差异大，建议人工审查",
            }

    def promote(self, deployment_id: str) -> bool:
        """将影子验证通过的部署晋升为活跃部署（实际生效）"""
        with self._lock:
            record = self._deployments.get(deployment_id)
            if record is None or record.status != "shadow":
                return False

            # 实际修改参数值
            success = self._registry.set_value(
                record.param_name, record.new_value,
                reason=f"部署 {deployment_id} 影子验证通过",
                applied_by="deployment",
            )
            if not success:
                return False

            record.status = "active"
            record.promoted_at = datetime.now(timezone.utc).isoformat()
            # 重新记录基线（部署时刻的成功率）
            record.baseline_success_rate = self._get_recent_success_rate(days=1)
            self._save()

        logger.info("部署 %s 晋升为活跃: %s = %.4f", deployment_id, record.param_name, record.new_value)
        return True

    # ──────────────────── 自动回滚 (Phase 4) ────────────────────

    def check_rollbacks(self) -> list[dict]:
        """检查所有活跃部署，自动回滚指标劣化的

        Returns:
            被回滚的部署列表
        """
        rolled_back = []
        now = datetime.now(timezone.utc)

        with self._lock:
            active = [d for d in self._deployments.values() if d.status == "active"]

        for record in active:
            # 检查观察期是否已过
            if record.promoted_at:
                promoted = datetime.fromisoformat(record.promoted_at)
                if now - promoted < timedelta(hours=self.OBSERVATION_HOURS):
                    continue  # 还在观察期内

            # 获取部署后的成功率
            post_rate = self._get_recent_success_rate(days=2)
            post_tasks = self._get_recent_task_count(days=2)

            with self._lock:
                record.post_deploy_success_rate = post_rate
                record.post_deploy_tasks = post_tasks

            # 样本不足，跳过
            if post_tasks < self.ROLLBACK_MIN_TASKS:
                continue

            # 成功率下降超过阈值 → 自动回滚
            drop = (record.baseline_success_rate - post_rate) * 100
            if drop >= self.ROLLBACK_DROP_THRESHOLD:
                logger.warning(
                    "部署 %s 指标劣化: 基线 %.1f%% → 当前 %.1f%% (下降 %.1f%%)，自动回滚",
                    record.deployment_id,
                    record.baseline_success_rate * 100,
                    post_rate * 100,
                    drop,
                )
                if self._rollback(record):
                    rolled_back.append({
                        "deployment_id": record.deployment_id,
                        "param_name": record.param_name,
                        "baseline_rate": round(record.baseline_success_rate * 100, 1),
                        "post_rate": round(post_rate * 100, 1),
                        "drop_pct": round(drop, 1),
                    })

        return rolled_back

    def _rollback(self, record: DeploymentRecord) -> bool:
        """回滚一个部署到旧值"""
        success = self._registry.set_value(
            record.param_name, record.old_value,
            reason=f"自动回滚: 部署 {record.deployment_id} 指标劣化",
            applied_by="rollback",
        )
        if success:
            with self._lock:
                record.status = "rolled_back"
                record.rolled_back_at = datetime.now(timezone.utc).isoformat()
                self._save()
        return success

    def manual_rollback(self, deployment_id: str) -> bool:
        """手动回滚"""
        with self._lock:
            record = self._deployments.get(deployment_id)
            if record is None or record.status not in ("shadow", "active"):
                return False
        return self._rollback(record)

    # ──────────────────── 查询 ────────────────────

    def list_deployments(self, status: str | None = None) -> list[dict]:
        with self._lock:
            deployments = list(self._deployments.values())
        if status:
            deployments = [d for d in deployments if d.status == status]
        return [asdict(d) for d in sorted(deployments, key=lambda d: d.created_at, reverse=True)]

    def get_deployment(self, deployment_id: str) -> dict | None:
        with self._lock:
            record = self._deployments.get(deployment_id)
            return asdict(record) if record else None

    def get_shadow_decisions(self, deployment_id: str, limit: int = 50) -> list[dict]:
        with self._lock:
            decisions = [d for d in self._shadow_decisions if d.deployment_id == deployment_id]
        return [asdict(d) for d in decisions[-limit:]]

    # ──────────────────── 内部工具 ────────────────────

    def _get_recent_success_rate(self, days: int = 7) -> float:
        """从 AB Tracker 获取近期成功率"""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        try:
            row = self._ab_conn.execute(
                """SELECT SUM(total_tasks) as t,
                          SUM(success_with_rules + success_without_rules) as s
                   FROM task_type_performance WHERE period_start >= ?""",
                (cutoff,),
            ).fetchone()
            tasks = row["t"] or 0 if row else 0
            success = row["s"] or 0 if row else 0
            return success / tasks if tasks > 0 else 0.0
        except Exception:
            return 0.0

    def _get_recent_task_count(self, days: int = 7) -> int:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        try:
            row = self._ab_conn.execute(
                "SELECT SUM(total_tasks) as t FROM task_type_performance WHERE period_start >= ?",
                (cutoff,),
            ).fetchone()
            return row["t"] or 0 if row else 0
        except Exception:
            return 0

    def _save(self):
        try:
            data = {
                "deployments": {k: asdict(v) for k, v in self._deployments.items()},
                "shadow_decisions": [asdict(d) for d in self._shadow_decisions[-500:]],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            tmp = self._config_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._config_path)
        except Exception:
            logger.exception("部署状态保存失败")

    def _load(self):
        if not os.path.isfile(self._config_path):
            return
        try:
            with open(self._config_path, encoding="utf-8") as f:
                data = json.load(f)
            for k, v in data.get("deployments", {}).items():
                self._deployments[k] = DeploymentRecord(**v)
            for d in data.get("shadow_decisions", []):
                self._shadow_decisions.append(ShadowDecision(**d))
            logger.info("部署状态加载: %d 个部署, %d 条影子决策",
                         len(self._deployments), len(self._shadow_decisions))
        except Exception:
            logger.exception("部署状态加载失败")
