"""Evolution Event Tracking — 事件驱动的进化时间线 + A/B 任务类型成功率追踪

T1: EvolutionEvent 数据模型 + SQLite 存储 + REST API
T2: ABTracker 任务类型成功率 A/B 统计
"""

import json
import logging
import os
import sqlite3
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("evolution_events")

# ── 事件类型常量 ──
EVENT_TYPES = (
    "xp_granted",
    "skill_level_up",
    "career_promotion",
    "rule_created",
    "rule_evolved",
    "rule_demoted",
    "rule_approved",
    "domain_confidence_change",
)


@dataclass
class EvolutionEvent:
    """进化事件数据模型"""
    event_id: str
    event_type: str
    agent_id: str
    timestamp: str  # ISO format
    details: dict = field(default_factory=dict)
    task_id: str = ""
    before_state: dict = field(default_factory=dict)
    after_state: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


def new_event_id() -> str:
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EvolutionEventStore:
    """进化事件 SQLite 存储

    使用独立 SQLite 数据库（evolution.db），WAL 模式支持并发读。
    """

    def __init__(self, db_path: str):
        self._db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS evolution_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '{}',
                task_id TEXT NOT NULL DEFAULT '',
                before_state TEXT NOT NULL DEFAULT '{}',
                after_state TEXT NOT NULL DEFAULT '{}'
            );

            CREATE INDEX IF NOT EXISTS idx_evo_agent_ts
                ON evolution_events(agent_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_evo_type
                ON evolution_events(event_type);

            CREATE INDEX IF NOT EXISTS idx_evo_ts
                ON evolution_events(timestamp);
        """)
        self._conn.commit()

    def record_event(self, event: EvolutionEvent) -> None:
        """INSERT 一条事件"""
        with self._lock:
            self._conn.execute(
                """INSERT INTO evolution_events
                   (event_id, event_type, agent_id, timestamp, details, task_id, before_state, after_state)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event.event_id,
                    event.event_type,
                    event.agent_id,
                    event.timestamp,
                    json.dumps(event.details, ensure_ascii=False),
                    event.task_id,
                    json.dumps(event.before_state, ensure_ascii=False),
                    json.dumps(event.after_state, ensure_ascii=False),
                ),
            )
            self._conn.commit()

    def get_timeline(
        self,
        agent_id: str | None = None,
        event_type: str | None = None,
        since: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """查询事件时间线，支持多维过滤"""
        conditions = []
        params: list = []

        if agent_id:
            conditions.append("agent_id = ?")
            params.append(agent_id)
        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        if since:
            conditions.append("timestamp >= ?")
            params.append(since)

        where = " AND ".join(conditions) if conditions else "1=1"
        query = f"SELECT * FROM evolution_events WHERE {where} ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        with self._lock:
            rows = self._conn.execute(query, params).fetchall()

        results = []
        for row in rows:
            results.append({
                "event_id": row["event_id"],
                "event_type": row["event_type"],
                "agent_id": row["agent_id"],
                "timestamp": row["timestamp"],
                "details": json.loads(row["details"]) if isinstance(row["details"], str) else row["details"],
                "task_id": row["task_id"],
                "before_state": json.loads(row["before_state"]) if isinstance(row["before_state"], str) else row["before_state"],
                "after_state": json.loads(row["after_state"]) if isinstance(row["after_state"], str) else row["after_state"],
            })
        return results

    def get_summary(
        self,
        agent_id: str | None = None,
        period_days: int = 7,
    ) -> dict:
        """聚合统计：按事件类型计数、XP 变化、规则变更"""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
        conditions = ["timestamp >= ?"]
        params: list = [cutoff]

        if agent_id:
            conditions.append("agent_id = ?")
            params.append(agent_id)

        where = " AND ".join(conditions)

        with self._lock:
            # 按类型计数
            rows = self._conn.execute(
                f"SELECT event_type, COUNT(*) as cnt FROM evolution_events WHERE {where} GROUP BY event_type",
                params,
            ).fetchall()

            by_type = {row["event_type"]: row["cnt"] for row in rows}
            total = sum(by_type.values())

            # XP delta
            xp_events = self._conn.execute(
                f"""SELECT details FROM evolution_events
                    WHERE {where} AND event_type = 'xp_granted'""",
                params,
            ).fetchall()
            total_xp = 0
            for row in xp_events:
                try:
                    d = json.loads(row["details"]) if isinstance(row["details"], str) else row["details"]
                    total_xp += d.get("xp_gained", 0)
                except Exception:
                    pass

            # Rule changes
            rule_created = by_type.get("rule_created", 0)
            rule_evolved = by_type.get("rule_evolved", 0)
            rule_demoted = by_type.get("rule_demoted", 0)
            rule_approved = by_type.get("rule_approved", 0)

        return {
            "period_days": period_days,
            "total_events": total,
            "by_type": by_type,
            "xp_delta": total_xp,
            "rule_changes": {
                "created": rule_created,
                "evolved": rule_evolved,
                "demoted": rule_demoted,
                "approved": rule_approved,
            },
        }


# ══════════════════════════════════════════════════════════════════
# T2: A/B Task Type Success Rate Tracking
# ══════════════════════════════════════════════════════════════════


class ABTracker:
    """A/B 任务类型成功率追踪器

    对比「有经验规则注入」vs「无经验规则注入」的任务成功率，
    量化经验系统的实际价值。支持按规则质量分桶分析。
    """

    # 规则质量分桶阈值
    QUALITY_LOW = 0.4
    QUALITY_HIGH = 0.7

    def __init__(self, conn: sqlite3.Connection):
        """使用同一条 SQLite 连接（与 EvolutionEventStore 共享或独立均可）"""
        self._conn = conn
        self._lock = threading.Lock()
        self._init_tables()

    def _init_tables(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS task_type_performance (
                task_type TEXT NOT NULL,
                period_start TEXT NOT NULL,
                total_tasks INTEGER NOT NULL DEFAULT 0,
                tasks_with_rules INTEGER NOT NULL DEFAULT 0,
                success_with_rules INTEGER NOT NULL DEFAULT 0,
                success_without_rules INTEGER NOT NULL DEFAULT 0,
                rule_count_sum INTEGER NOT NULL DEFAULT 0,
                rule_score_sum REAL NOT NULL DEFAULT 0.0,
                PRIMARY KEY (task_type, period_start)
            );
        """)
        # 迁移：为已有表添加新列
        for col, col_def in [
            ("rule_count_sum", "INTEGER NOT NULL DEFAULT 0"),
            ("rule_score_sum", "REAL NOT NULL DEFAULT 0.0"),
        ]:
            try:
                existing = {r[1] for r in self._conn.execute("PRAGMA table_info(task_type_performance)").fetchall()}
                if col not in existing:
                    self._conn.execute(f"ALTER TABLE task_type_performance ADD COLUMN {col} {col_def}")
            except Exception:
                pass
        self._conn.commit()

    @staticmethod
    def _period_key() -> str:
        """当天日期作为周期 key"""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    @staticmethod
    def quality_bucket(avg_score: float) -> str:
        """规则质量分桶: low / medium / high"""
        if avg_score >= ABTracker.QUALITY_HIGH:
            return "high"
        if avg_score >= ABTracker.QUALITY_LOW:
            return "medium"
        return "low"

    def record_task(
        self,
        task_type: str,
        success: bool,
        has_rules: bool,
        rule_count: int = 0,
        avg_rule_score: float = 0.0,
    ) -> None:
        """记录一次任务执行结果（upsert 到当天统计行）

        Args:
            task_type: 任务类型
            success: 是否成功
            has_rules: 是否注入了经验规则
            rule_count: 注入的规则数量
            avg_rule_score: 注入规则的平均有效性评分
        """
        period = self._period_key()
        with self._lock:
            self._conn.execute(
                """INSERT OR IGNORE INTO task_type_performance
                   (task_type, period_start, total_tasks, tasks_with_rules,
                    success_with_rules, success_without_rules, rule_count_sum, rule_score_sum)
                   VALUES (?, ?, 0, 0, 0, 0, 0, 0.0)""",
                (task_type, period),
            )
            if has_rules:
                self._conn.execute(
                    """UPDATE task_type_performance
                       SET total_tasks = total_tasks + 1,
                           tasks_with_rules = tasks_with_rules + 1,
                           success_with_rules = success_with_rules + ?,
                           rule_count_sum = rule_count_sum + ?,
                           rule_score_sum = rule_score_sum + ?
                       WHERE task_type = ? AND period_start = ?""",
                    (1 if success else 0, rule_count, avg_rule_score, task_type, period),
                )
            else:
                self._conn.execute(
                    """UPDATE task_type_performance
                       SET total_tasks = total_tasks + 1,
                           success_without_rules = success_without_rules + ?
                       WHERE task_type = ? AND period_start = ?""",
                    (1 if success else 0, task_type, period),
                )
            self._conn.commit()

    def get_stats(
        self,
        task_type: str | None = None,
        period_days: int = 30,
    ) -> list[dict]:
        """查询任务类型成功率统计

        Returns:
            列表，每项含 task_type, total, with_rules_total,
            with_rules_success_rate, without_rules_total,
            without_rules_success_rate, improvement_pct,
            avg_rule_count, avg_rule_score
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).strftime("%Y-%m-%d")
        conditions = ["period_start >= ?"]
        params: list = [cutoff]
        if task_type:
            conditions.append("task_type = ?")
            params.append(task_type)

        where = " AND ".join(conditions)

        with self._lock:
            rows = self._conn.execute(
                f"""SELECT task_type,
                           SUM(total_tasks) as total,
                           SUM(tasks_with_rules) as with_rules_total,
                           SUM(success_with_rules) as with_rules_success,
                           SUM(success_without_rules) as without_rules_success,
                           SUM(rule_count_sum) as rc_sum,
                           SUM(rule_score_sum) as rs_sum
                    FROM task_type_performance
                    WHERE {where}
                    GROUP BY task_type
                    ORDER BY total DESC""",
                params,
            ).fetchall()

        results = []
        for row in rows:
            with_rules_total = row["with_rules_total"] or 0
            without_rules_total = (row["total"] or 0) - with_rules_total
            with_rules_success = row["with_rules_success"] or 0
            without_rules_success = row["without_rules_success"] or 0

            with_rules_rate = (with_rules_success / with_rules_total * 100) if with_rules_total > 0 else 0.0
            without_rules_rate = (without_rules_success / without_rules_total * 100) if without_rules_total > 0 else 0.0

            improvement = 0.0
            if without_rules_rate > 0:
                improvement = with_rules_rate - without_rules_rate

            avg_rule_count = round((row["rc_sum"] or 0) / with_rules_total, 2) if with_rules_total > 0 else 0.0
            avg_rule_score = round((row["rs_sum"] or 0.0) / with_rules_total, 4) if with_rules_total > 0 else 0.0

            results.append({
                "task_type": row["task_type"],
                "total": row["total"] or 0,
                "with_rules_total": with_rules_total,
                "with_rules_success_rate": round(with_rules_rate, 2),
                "without_rules_total": without_rules_total,
                "without_rules_success_rate": round(without_rules_rate, 2),
                "improvement_pct": round(improvement, 2),
                "avg_rule_count": avg_rule_count,
                "avg_rule_score": avg_rule_score,
            })

        return results

    def get_quality_stats(self, period_days: int = 30) -> dict:
        """按规则质量分桶的成功率统计

        将有规则注入的任务按 avg_rule_score 分为 low/medium/high 三桶，
        对比各桶成功率与无规则基线，回答"什么质量的规则才有用"。

        Returns:
            {
                "buckets": {
                    "low": {"total": int, "success_rate": float},
                    "medium": {...}, "high": {...},
                },
                "baseline": {"total": int, "success_rate": float},
                "insight": str,
            }
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).strftime("%Y-%m-%d")
        with self._lock:
            rows = self._conn.execute(
                """SELECT tasks_with_rules, success_with_rules,
                          rule_count_sum, rule_score_sum,
                          total_tasks, success_without_rules
                   FROM task_type_performance WHERE period_start >= ?""",
                (cutoff,),
            ).fetchall()

        buckets = {"low": {"total": 0, "success": 0}, "medium": {"total": 0, "success": 0}, "high": {"total": 0, "success": 0}}
        baseline_total = 0
        baseline_success = 0

        for row in rows:
            twr = row["tasks_with_rules"] or 0
            swr = row["success_with_rules"] or 0
            rc = row["rule_count_sum"] or 0
            rs = row["rule_score_sum"] or 0.0

            # 无规则基线
            total = row["total_tasks"] or 0
            baseline_total += total - twr
            baseline_success += row["success_without_rules"] or 0

            if twr > 0:
                avg_score = rs / twr
                bucket = self.quality_bucket(avg_score)
                buckets[bucket]["total"] += twr
                buckets[bucket]["success"] += swr

        def _rate(d: dict) -> float:
            return round(d["success"] / d["total"] * 100, 2) if d["total"] > 0 else 0.0

        result_buckets = {
            k: {"total": v["total"], "success_rate": _rate(v)}
            for k, v in buckets.items()
        }
        baseline_rate = round(baseline_success / baseline_total * 100, 2) if baseline_total > 0 else 0.0

        # 生成 insight
        high_rate = result_buckets["high"]["success_rate"]
        low_rate = result_buckets["low"]["success_rate"]
        if high_rate > baseline_rate + 5:
            insight = f"高质量规则显著提升成功率 ({high_rate}% vs 基线 {baseline_rate}%)"
        elif low_rate < baseline_rate:
            insight = f"低质量规则反而降低成功率 ({low_rate}% vs 基线 {baseline_rate}%)，建议加强审核"
        else:
            insight = "规则质量与成功率关联不显著，样本量可能不足"

        return {
            "buckets": result_buckets,
            "baseline": {"total": baseline_total, "success_rate": baseline_rate},
            "insight": insight,
        }
