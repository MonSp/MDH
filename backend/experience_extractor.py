"""经验提炼器 - 从执行日志中提炼可复用的经验规则

负责分析员工智能体的执行日志（成功/失败），提炼经验规则并写入技能增量区。
支持规则审核流程和基于关键词的检索。
"""

import logging
import os
import re
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

import yaml

logger = logging.getLogger("experience_extractor")


@dataclass
class ExecutionLog:
    """执行日志"""

    task_id: str
    agent_id: str
    task_description: str
    task_type: str  # 任务类型（如 web-dev, data-analysis）
    status: str  # success / failure / revision_success
    steps: list  # 执行步骤列表
    errors: list  # 错误列表（如有）
    corrections: list  # 修正记录（如有）
    final_output: str  # 最终输出摘要
    created_at: str


@dataclass
class ExperienceRule:
    """经验规则"""

    rule_id: str
    trigger_condition: str  # 触发条件描述
    action: str  # 建议动作
    note: str  # 补充说明
    source_task_id: str  # 来源任务 ID
    source_task_type: str  # 来源任务类型
    rule_type: str  # success_pattern / failure_avoidance / correction_tip
    status: str  # pending_review / approved / rejected
    keywords: list[str]  # 关键词标签
    created_at: str
    team_id: str = ""  # 归属团队（"" = 全局/未隔离——旧规则兼容）
    source_agent_id: str = ""  # 来源 agent ID（用于 mentor 匹配）
    effectiveness_score: float = 0.0  # 有效性评分（成功/总使用）
    usage_count: int = 0  # 被注入任务的次数
    success_count: int = 0  # 注入后任务成功的次数
    parent_rule_id: str = ""  # 进化来源规则 ID（非空 = 本规则是进化产生的）
    evolution_count: int = 0  # 本规则被进化的次数
    last_used_at: str = ""  # 最后一次被注入的时间（用于老化机制）


def _now_iso() -> str:
    """返回当前 UTC 时间的 ISO 格式字符串"""
    return datetime.now(timezone.utc).isoformat()


def _new_rule_id() -> str:
    """生成新的规则 ID"""
    return str(uuid.uuid4())


def _extract_keywords_from_steps(steps: list[dict], task_type: str) -> list[str]:
    """从执行步骤中提取关键词标签"""
    keywords = set()
    keywords.add(task_type)
    for step in steps:
        if not isinstance(step, dict):
            continue
        cmd = step.get("command", "")
        if cmd:
            keywords.add(cmd)
        action_desc = step.get("action", "")
        if isinstance(action_desc, str):
            for word in action_desc.split():
                if len(word) > 2 and word.isalpha():
                    keywords.add(word.lower())
        tool = step.get("tool", "")
        if tool:
            keywords.add(tool)
    return sorted(keywords)


def _extract_keywords_from_errors(errors: list[dict]) -> list[str]:
    """从错误列表中提取关键词标签"""
    keywords = set()
    for err in errors:
        if not isinstance(err, dict):
            continue
        err_type = err.get("type", "")
        if err_type:
            keywords.add(err_type)
        err_msg = err.get("message", "")
        if isinstance(err_msg, str):
            for word in err_msg.split():
                if len(word) > 3 and word.isalpha():
                    keywords.add(word.lower())
    return sorted(keywords)


def _identify_decision_points(steps: list[dict]) -> list[dict]:
    """识别关键决策点"""
    decision_points = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        if step.get("is_decision") or step.get("decision") or step.get("selected_option") or step.get("chosen_approach"):
            decision_points.append(step)
    return decision_points


class ExperienceExtractor:
    """经验提炼器

    从执行日志中提炼可复用的经验规则，支持审核流程，
    将通过审核的规则写入技能增量区。
    """

    DEDUP_KEYWORD_THRESHOLD = 0.8  # 关键词 Jaccard 相似度阈值
    AUTO_APPROVE_RULE_TYPES = frozenset({"success_pattern", "correction_tip"})
    AUTO_APPROVE_MIN_CONFIDENCE = 0.7
    def __init__(self, incremental_dir: str, llm_caller: Callable | None = None, event_store=None,
                 knowledge_network=None, team_federation=None, tuning_registry=None):
        """初始化经验提炼器

        Args:
            incremental_dir: 技能增量区根目录
            llm_caller: 可选的 LLM 调用函数 (prompt: str) -> str。
                        提供后启用 LLM 蒸馏；为 None 时跳过 LLM 蒸馏。
            event_store: 可选的 EvolutionEventStore 实例，用于记录进化事件
            knowledge_network: 可选的 KnowledgeNetwork 实例，用于联动进化
            team_federation: 可选的 TeamFederation 实例，用于跨团队发布
            tuning_registry: 可选的 TuningRegistry 实例，提供动态参数覆盖
        """
        self._incremental_dir = incremental_dir
        self._llm_caller = llm_caller
        self._rules_dir = os.path.join(incremental_dir, "rules")
        self._demotion_log_path = os.path.join(incremental_dir, "demotion_log.json")
        os.makedirs(self._rules_dir, exist_ok=True)
        # SQLite 存储（每实例独立连接，线程安全）
        from db import get_db
        self._db_path = os.path.join(incremental_dir, "rules.db")
        self._db = get_db(self._db_path)
        self._lock = threading.Lock()
        self._event_store = event_store
        self._knowledge_network = knowledge_network
        self._team_federation = team_federation
        self._tuning = tuning_registry
        self._deployment = None  # 影子部署管理器（server 晚绑定，extractor 创建更早）

    def attach_deployment(self, deployment_manager) -> None:
        """晚绑定影子部署管理器（server 中 extractor 创建早于 DeploymentManager）"""
        self._deployment = deployment_manager

    def _record_demotion_shadow(self, score: float, in_window: bool) -> None:
        """demotion_threshold 影子：按新旧阈值各判一次降级决策"""
        dep = self._deployment
        if dep is None or not in_window:
            return
        try:
            for new_val in dep.shadow_new_values("experience.demotion_threshold"):
                old_d = "demote" if score < self.demotion_threshold else "keep"
                new_d = "demote" if score < float(new_val) else "keep"
                dep.record_shadows_for_param(
                    "experience.demotion_threshold", old_d, new_d, "rule_demotion",
                )
        except Exception as e:
            logger.debug("demotion 影子决策记录失败: %s", e)

    def _tp(self, name: str, default: float) -> float:
        """从 TuningRegistry 获取参数值，无 registry 或未注册时返回默认值"""
        if self._tuning is not None:
            val = self._tuning.get(name)
            if val is not None:
                return val
        return default

    # ──────────────────── 规则存储 (SQLite) ────────────────────

    def _rule_file_path(self, rule_id: str) -> str:
        return os.path.join(self._rules_dir, f"{rule_id}.yaml")

    def _save_rule(self, rule: ExperienceRule) -> None:
        """保存规则到 SQLite（线程安全）"""
        import json as _json
        with self._lock:
            self._db.execute(
                """INSERT OR REPLACE INTO experience_rules
                   (rule_id, trigger_condition, action, note, source_task_id, source_task_type,
                    rule_type, status, keywords, created_at, team_id, source_agent_id,
                    effectiveness_score, usage_count, success_count, parent_rule_id,
                    evolution_count, last_used_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (rule.rule_id, rule.trigger_condition, rule.action, rule.note,
                 rule.source_task_id, rule.source_task_type, rule.rule_type, rule.status,
                 _json.dumps(rule.keywords, ensure_ascii=False), rule.created_at,
                 rule.team_id, rule.source_agent_id, rule.effectiveness_score,
                 rule.usage_count, rule.success_count, rule.parent_rule_id,
                 rule.evolution_count, rule.last_used_at),
            )
            self._db.commit()

    def _load_rule(self, rule_id: str) -> ExperienceRule | None:
        """从 SQLite 加载规则（线程安全）"""
        with self._lock:
            row = self._db.execute(
                "SELECT * FROM experience_rules WHERE rule_id = ?", (rule_id,)
            ).fetchone()
        if not row:
            return None
        return self._row_to_rule(row)

    def _row_to_rule(self, row) -> ExperienceRule:
        """将数据库行转为 ExperienceRule"""
        import json as _json
        kw = row["keywords"]
        if isinstance(kw, str):
            try:
                kw = _json.loads(kw)
            except Exception:
                kw = []
        return ExperienceRule(
            rule_id=row["rule_id"],
            trigger_condition=row["trigger_condition"],
            action=row["action"],
            note=row["note"] or "",
            source_task_id=row["source_task_id"],
            source_task_type=row["source_task_type"],
            rule_type=row["rule_type"],
            status=row["status"],
            keywords=kw if isinstance(kw, list) else [],
            created_at=row["created_at"],
            team_id=row["team_id"] or "",
            source_agent_id=row["source_agent_id"] or "",
            effectiveness_score=float(row["effectiveness_score"] or 0.0),
            usage_count=int(row["usage_count"] or 0),
            success_count=int(row["success_count"] or 0),
            parent_rule_id=row["parent_rule_id"] or "",
            evolution_count=int(row["evolution_count"] or 0),
            last_used_at=row["last_used_at"] or "",
        )

    def _list_rule_ids(self) -> list[str]:
        """列出所有规则 ID"""
        rows = self._db.execute("SELECT rule_id FROM experience_rules").fetchall()
        return [r["rule_id"] for r in rows]

    @property
    def dedup_keyword_threshold(self) -> float:
        return self._tp("experience.dedup_keyword_threshold", self.DEDUP_KEYWORD_THRESHOLD)


    @property
    def auto_approve_min_confidence(self) -> float:
        return self._tp("experience.auto_approve_min_confidence", self.AUTO_APPROVE_MIN_CONFIDENCE)

    def _find_duplicate_rule(self, rule: ExperienceRule) -> ExperienceRule | None:
        """查找与给定规则高度相似的已有规则（关键词 Jaccard > 阈值且 action 前缀相似）"""
        rule_kw = set(k.lower() for k in rule.keywords)
        if not rule_kw:
            return None
        action_prefix = rule.action[:50].lower()

        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM experience_rules WHERE status IN ('approved', 'pending_review')"
            ).fetchall()
        for row in rows:
            if row["rule_id"] == rule.rule_id:
                continue
            existing = self._row_to_rule(row)
            existing_kw = set(k.lower() for k in existing.keywords)
            if not existing_kw:
                continue
            # Jaccard 相似度
            intersection = len(rule_kw & existing_kw)
            union = len(rule_kw | existing_kw)
            jaccard = intersection / union if union else 0.0
            if jaccard >= self.dedup_keyword_threshold:
                # 关键词高度重叠时再检查 action 前缀
                if existing.action[:50].lower() == action_prefix:
                    return existing
        return None

    def _rule_writes_disabled(self) -> bool:
        """program-pivot M1：规则新增写入关闭（读与存量状态更新保留）。"""
        try:
            import config as app_config
            return bool(getattr(app_config, "PROGRAM_PIVOT_DISABLE_RULE_WRITES", False))
        except Exception:
            return False

    def _save_new_rule(self, rule: ExperienceRule, auto_approve: bool = True) -> str:
        """统一的新规则保存入口：去重 → 保存 → 自动审批

        所有创建新规则的路径都应走此方法，确保去重检查不被绕过。

        Args:
            rule: 待保存的规则
            auto_approve: 是否尝试 LLM 自动审批（仅低风险类型）

        Returns:
            规则 ID（去重命中时返回已有规则 ID；写入关闭时返回未持久化的 ID）
        """
        # program-pivot M1：新规则写入关停，沉淀改走 ProgramCompiler
        if self._rule_writes_disabled():
            logger.info(
                "program-pivot: rule writes disabled, skip new rule %s",
                rule.rule_id[:8],
            )
            return rule.rule_id

        # 去重检查
        duplicate = self._find_duplicate_rule(rule)
        if duplicate is not None:
            logger.info("Rule %s 与已有规则 %s 高度相似，合并而非新增", rule.rule_id[:8], duplicate.rule_id[:8])
            return duplicate.rule_id

        rule.status = "pending_review"
        self._save_rule(rule)
        logger.info("Rule %s saved", rule.rule_id)

        # LLM 自动审批：仅低风险规则类型
        if auto_approve and rule.rule_type in self.AUTO_APPROVE_RULE_TYPES and self._llm_caller is not None:
            self._try_auto_approve(rule)

        # Prometheus 计数器
        try:
            from prometheus_metrics import EVOLUTION_EVENTS
            EVOLUTION_EVENTS.labels(event_type="rule_created").inc()
        except ImportError:
            pass
        # 记录 rule_created 事件
        if self._event_store:
            try:
                from evolution_events import EvolutionEvent, new_event_id
                self._event_store.record_event(EvolutionEvent(
                    event_id=new_event_id(),
                    event_type="rule_created",
                    agent_id=rule.source_agent_id or "",
                    timestamp=_now_iso(),
                    details={
                        "rule_id": rule.rule_id,
                        "rule_type": rule.rule_type,
                        "source_task_type": rule.source_task_type,
                    },
                    task_id=rule.source_task_id,
                ))
            except Exception:
                pass
        return rule.rule_id

    def submit_for_review(self, rule: ExperienceRule) -> str:
        """提交规则审核（委托给 _save_new_rule）

        Args:
            rule: 待审核的经验规则
        Returns:
            规则 ID（去重命中时返回已有规则 ID）
        """
        return self._save_new_rule(rule, auto_approve=True)

    def _try_auto_approve(self, rule: ExperienceRule) -> bool:
        """用 LLM judge 评估规则质量，高置信时自动审批

        仅对 AUTO_APPROVE_RULE_TYPES 中的低风险规则调用。
        LLM 失败或置信度不足时保持 pending_review。
        """
        prompt = (
            "你是经验规则质量审核员。请评估以下经验规则是否可以自动批准。\n\n"
            f"## 规则内容\n"
            f"- 类型: {rule.rule_type}\n"
            f"- 触发条件: {rule.trigger_condition}\n"
            f"- 建议动作: {rule.action}\n"
            f"- 补充说明: {rule.note}\n"
            f"- 关键词: {', '.join(rule.keywords)}\n\n"
            "评估标准：\n"
            "1. 规则是否具体可操作（非空泛描述）\n"
            "2. 触发条件是否清晰\n"
            "3. 建议动作是否合理安全\n"
            "4. 是否存在明显错误或误导\n\n"
            "输出 JSON（不要 markdown 代码块）：\n"
            '{"approved": true/false, "confidence": 0.0-1.0, "reason": "评估理由"}\n'
            "只输出 JSON。"
        )

        raw = self._sync_llm_call(prompt, timeout=15)
        if not raw:
            return False

        # 解析响应
        import json as _json
        import re as _re
        text = raw.strip()
        if text.startswith("```"):
            text = _re.sub(r"^```(?:json)?\s*\n?", "", text)
            text = _re.sub(r"\n?```\s*$", "", text).strip()
        try:
            data = _json.loads(text)
        except _json.JSONDecodeError:
            m = _re.search(r"\{.*\}", text, _re.DOTALL)
            if not m:
                return False
            try:
                data = _json.loads(m.group())
            except _json.JSONDecodeError:
                return False

        if not isinstance(data, dict):
            return False

        approved = data.get("approved", False)
        confidence = float(data.get("confidence", 0.0))
        reason = str(data.get("reason", ""))[:200]

        if approved and confidence >= self.auto_approve_min_confidence:
            rule.status = "approved"
            rule.note = f"{rule.note}\n[LLM自动审批] 置信度 {confidence:.0%}：{reason}"
            self._save_rule(rule)
            logger.info("Rule %s LLM 自动审批通过 (confidence=%.2f)", rule.rule_id[:8], confidence)
            # 记录事件
            if self._event_store:
                try:
                    from evolution_events import EvolutionEvent, new_event_id
                    self._event_store.record_event(EvolutionEvent(
                        event_id=new_event_id(),
                        event_type="rule_approved",
                        agent_id=rule.source_agent_id or "",
                        timestamp=_now_iso(),
                        details={"rule_id": rule.rule_id, "auto_approved": True, "confidence": confidence},
                        before_state={"status": "pending_review"},
                        after_state={"status": "approved"},
                    ))
                except Exception:
                    pass
            return True

        logger.info("Rule %s LLM 审核未通过 (approved=%s, confidence=%.2f)", rule.rule_id[:8], approved, confidence)
        return False

    def _sync_llm_call(self, prompt: str, timeout: int = 15) -> str | None:
        """同步调用 LLM，失败返回 None"""
        if self._llm_caller is None:
            return None
        try:
            import asyncio
            if asyncio.iscoroutinefunction(self._llm_caller):
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = None
                if loop and loop.is_running():
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        future = pool.submit(asyncio.run, self._llm_caller(prompt))
                        return future.result(timeout=timeout + 5)
                else:
                    return asyncio.get_event_loop().run_until_complete(
                        asyncio.wait_for(self._llm_caller(prompt), timeout=timeout)
                    )
            else:
                return self._llm_caller(prompt)
        except Exception:
            logger.debug("LLM call failed", exc_info=True)
            return None

    def approve_rule(self, rule_id: str, reviewer_comment: str = "") -> bool:
        """批准规则

        Args:
            rule_id: 规则 ID
            reviewer_comment: 审核意见
        Returns:
            操作是否成功
        """
        rule = self._load_rule(rule_id)
        if rule is None:
            logger.warning("Cannot approve: rule %s not found", rule_id)
            return False

        rule.status = "approved"
        if reviewer_comment:
            rule.note = f"{rule.note}\n[审核意见] {reviewer_comment}"
        self._save_rule(rule)
        logger.info("Rule %s approved", rule_id)
        # Prometheus 计数器
        try:
            from prometheus_metrics import EVOLUTION_EVENTS
            EVOLUTION_EVENTS.labels(event_type="rule_approved").inc()
        except ImportError:
            pass
        # 记录 rule_approved 事件
        if self._event_store:
            try:
                from evolution_events import EvolutionEvent, new_event_id
                self._event_store.record_event(EvolutionEvent(
                    event_id=new_event_id(),
                    event_type="rule_approved",
                    agent_id=rule.source_agent_id or "",
                    timestamp=_now_iso(),
                    details={"rule_id": rule_id, "rule_type": rule.rule_type},
                    before_state={"status": "pending_review"},
                    after_state={"status": "approved"},
                ))
            except Exception:
                pass
        return True

    def reject_rule(self, rule_id: str, reason: str) -> bool:
        """拒绝规则

        Args:
            rule_id: 规则 ID
            reason: 拒绝原因
        Returns:
            操作是否成功
        """
        rule = self._load_rule(rule_id)
        if rule is None:
            logger.warning("Cannot reject: rule %s not found", rule_id)
            return False

        rule.status = "rejected"
        rule.note = f"{rule.note}\n[拒绝原因] {reason}"
        self._save_rule(rule)
        logger.info("Rule %s rejected: %s", rule_id, reason)
        return True

    def modify_rule(self, rule_id: str, updates: dict) -> bool:
        """修改规则

        Args:
            rule_id: 规则 ID
            updates: 需要更新的字段
        Returns:
            操作是否成功
        """
        rule = self._load_rule(rule_id)
        if rule is None:
            logger.warning("Cannot modify: rule %s not found", rule_id)
            return False

        allowed_fields = {
            "trigger_condition",
            "action",
            "note",
            "rule_type",
            "status",
            "keywords",
            "source_task_type",  # 任务类型（注入类型加分用）
            "team_id",  # 归属团队（规则级团队隔离）
        }
        for key, value in updates.items():
            if key in allowed_fields:
                setattr(rule, key, value)
            else:
                logger.warning("Field '%s' is not modifiable, skipped", key)

        self._save_rule(rule)
        logger.info("Rule %s modified", rule_id)
        return True

    # ──────────────────── 降级日志 ────────────────────

    def _append_demotion_log(self, rule: ExperienceRule, reason: str) -> None:
        """追加一条降级记录到 SQLite"""
        self._db.execute(
            """INSERT INTO demotion_log
               (rule_id, trigger_condition, action, rule_type, effectiveness_score,
                usage_count, success_count, reason, team_id, demoted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (rule.rule_id, rule.trigger_condition, rule.action, rule.rule_type,
             round(rule.effectiveness_score, 4), rule.usage_count, rule.success_count,
             reason, rule.team_id, _now_iso()),
        )
        self._db.commit()

    def get_demotion_log(self) -> list[dict]:
        """获取降级日志（最近的在前）"""
        rows = self._db.execute(
            "SELECT * FROM demotion_log ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    # ──────────────────── 抗过拟合机制 ────────────────────

    MAX_SAME_DOMAIN_EVOLUTIONS = 3  # 同一领域短期内最多进化次数
    EXPLORE_RATIO = 0.2  # 探索比例：20% 的注入使用随机规则
    AGING_DAYS = 30  # 规则老化天数

    @property
    def explore_ratio(self) -> float:
        return self._tp("experience.explore_ratio", self.EXPLORE_RATIO)

    @property
    def aging_days(self) -> float:
        return self._tp("experience.aging_days", self.AGING_DAYS)

    def retrieve_with_aging(self, task_type: str, keywords: list[str], team_id: str = "") -> list[ExperienceRule]:
        """带老化机制的规则检索

        - 老规则（超过 AGING_DAYS 未使用）降权
        - 高分规则优先
        - 20% 概率注入随机规则（探索）
        """
        import random as _random
        from datetime import datetime, timedelta, timezone

        rules = self.retrieve_relevant_rules(task_type, keywords, team_id)
        if not rules:
            return []

        now = datetime.now(timezone.utc)
        aging_threshold = now - timedelta(days=self.aging_days)

        # 计算每个规则的综合得分
        scored = []
        for rule in rules:
            score = rule.effectiveness_score

            # 老化降权：超过 AGING_DAYS 未使用，得分减半
            if rule.last_used_at:
                try:
                    last_used = datetime.fromisoformat(rule.last_used_at)
                    if last_used < aging_threshold:
                        score *= 0.5
                except (ValueError, TypeError):
                    pass

            scored.append((score, rule))

        # 探索/利用平衡
        scored.sort(key=lambda x: x[0], reverse=True)
        if len(scored) >= 3:
            u = _random.random()
            if u < self.explore_ratio:
                # 探索：从非首位中随机选一条，与首位交换（确保低分规则有机会被注入）
                explore_idx = _random.randint(1, len(scored) - 1)
                scored[0], scored[explore_idx] = scored[explore_idx], scored[0]
            # explore_ratio 影子：同一 u 在新旧阈值下各判一次（确定性对比）
            dep = self._deployment
            if dep is not None:
                try:
                    for new_val in dep.shadow_new_values("experience.explore_ratio"):
                        old_d = "explore" if u < self.explore_ratio else "exploit"
                        new_d = "explore" if u < float(new_val) else "exploit"
                        dep.record_shadows_for_param(
                            "experience.explore_ratio", old_d, new_d, "rule_retrieval",
                        )
                except Exception as e:
                    logger.debug("explore_ratio 影子决策记录失败: %s", e)

        return [rule for _, rule in scored]

    SHARE_MIN_SCORE = 0.7
    SHARE_MIN_USAGE = 5

    def get_share_recommendations(self) -> list[dict]:
        """推荐高分规则发布到共享池

        条件：approved + effectiveness_score ≥ 0.7 + usage_count ≥ 5
        """
        recommendations = []
        for rule_id in self._list_rule_ids():
            rule = self._load_rule(rule_id)
            if (rule is not None
                    and rule.status == "approved"
                    and rule.effectiveness_score >= self.SHARE_MIN_SCORE
                    and rule.usage_count >= self.SHARE_MIN_USAGE):
                recommendations.append({
                    "rule_id": rule.rule_id,
                    "trigger_condition": rule.trigger_condition,
                    "action": rule.action,
                    "rule_type": rule.rule_type,
                    "effectiveness_score": rule.effectiveness_score,
                    "usage_count": rule.usage_count,
                    "success_count": rule.success_count,
                    "keywords": rule.keywords,
                    "team_id": rule.team_id,
                })
        recommendations.sort(key=lambda x: x["effectiveness_score"], reverse=True)
        return recommendations

    # ──────────────────── 规则自进化 ────────────────────

    EVOLUTION_MIN_USAGE = 5
    EVOLUTION_MIN_SCORE = 0.3

    @property
    def evolution_min_usage(self) -> float:
        return self._tp("experience.evolution_min_usage", self.EVOLUTION_MIN_USAGE)

    @property
    def evolution_min_score(self) -> float:
        return self._tp("experience.evolution_min_score", self.EVOLUTION_MIN_SCORE)
    EVOLUTION_MAX_COUNT = 3  # 单条规则最多进化 3 次

    def _try_llm_evolve_sync(self, original: ExperienceRule, failure_reason: str) -> dict | None:
        """尝试用 LLM 生成改进版规则，失败返回 None"""
        if self._llm_caller is None:
            return None
        prompt = (
            "你是一位经验规则优化专家。请根据以下信息改进这条经验规则。\n\n"
            f"## 原规则\n"
            f"- 触发条件: {original.trigger_condition}\n"
            f"- 建议动作: {original.action}\n"
            f"- 有效性: {original.effectiveness_score:.0%} ({original.success_count}/{original.usage_count})\n"
        )
        if failure_reason:
            prompt += f"\n## 最近失败原因\n{failure_reason[:500]}\n"
        prompt += (
            "\n请输出改进后的规则，JSON 格式（不要 markdown 代码块）：\n"
            '{"trigger_condition": "改进后的触发条件", "action": "改进后的建议动作"}\n'
            "只输出 JSON，不要其他内容。"
        )
        try:
            import asyncio
            if asyncio.iscoroutinefunction(self._llm_caller):
                raw = asyncio.get_event_loop().run_until_complete(
                    asyncio.wait_for(self._llm_caller(prompt), timeout=20)
                )
            else:
                raw = self._llm_caller(prompt)
        except Exception:
            logger.debug("LLM evolution call failed", exc_info=True)
            return None

        # 解析响应
        import json as _json
        import re as _re
        text = raw.strip() if isinstance(raw, str) else ""
        if text.startswith("```"):
            text = _re.sub(r"^```(?:json)?\s*\n?", "", text)
            text = _re.sub(r"\n?```\s*$", "", text).strip()
        try:
            data = _json.loads(text)
        except _json.JSONDecodeError:
            m = _re.search(r"\{.*\}", text, _re.DOTALL)
            if not m:
                return None
            try:
                data = _json.loads(m.group())
            except _json.JSONDecodeError:
                return None
        if not isinstance(data, dict):
            return None
        result = {}
        if data.get("action"):
            result["action"] = str(data["action"])[:300]
        if data.get("trigger_condition"):
            result["trigger_condition"] = str(data["trigger_condition"])[:300]
        return result if result else None

    def _has_cycle_in_chain(self, rule_id: str, max_depth: int = 20) -> bool:
        """沿 parent_rule_id 链上溯检测循环，超过 max_depth 也视为异常"""
        visited: set[str] = set()
        current = rule_id
        depth = 0
        while current:
            if current in visited or depth > max_depth:
                return True
            visited.add(current)
            rule = self._load_rule(current)
            if not rule:
                break
            current = rule.parent_rule_id
            depth += 1
        return False

    @staticmethod
    def _extract_constraints_from_failure(failure_reason: str) -> str:
        """从失败原因中提取关键约束"""
        constraints = []
        lower = failure_reason.lower()
        if "错误" in failure_reason or "error" in lower:
            constraints.append("确保代码无语法错误")
        if "遗漏" in failure_reason or "missing" in lower:
            constraints.append("检查是否有遗漏的边界情况")
        if "性能" in failure_reason or "performance" in lower:
            constraints.append("关注性能优化")
        if "安全" in failure_reason or "security" in lower:
            constraints.append("注意安全漏洞")
        return "；".join(constraints) if constraints else ""

    def get_evolution_chain(self, rule_id: str) -> list[dict]:
        """获取规则的进化链（从原始到最新）"""
        chain = []
        current_id = rule_id
        visited = set()

        # 向前追溯（找到原始规则）
        while current_id and current_id not in visited:
            visited.add(current_id)
            rule = self._load_rule(current_id)
            if not rule:
                break
            chain.insert(0, {
                "rule_id": rule.rule_id,
                "trigger_condition": rule.trigger_condition,
                "action": rule.action,
                "effectiveness_score": rule.effectiveness_score,
                "usage_count": rule.usage_count,
                "status": rule.status,
                "evolution_count": rule.evolution_count,
                "parent_rule_id": rule.parent_rule_id,
                "created_at": rule.created_at,
            })
            current_id = rule.parent_rule_id

        # 向后查找（找到进化后的规则）
        rows = self._db.execute(
            "SELECT * FROM experience_rules WHERE parent_rule_id = ?",
            (rule_id,),
        ).fetchall()
        for row in rows:
            rid = row["rule_id"]
            if rid not in visited:
                chain.extend(self.get_evolution_chain(rid))

        return chain

    def get_evolution_log(self) -> list[dict]:
        """获取进化日志"""
        rows = self._db.execute(
            "SELECT * FROM evolution_log ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def _append_evolution_log(self, original: ExperienceRule, evolved: ExperienceRule, failure_reason: str) -> None:
        """记录进化事件到 SQLite"""
        self._db.execute(
            """INSERT INTO evolution_log
               (original_rule_id, evolved_rule_id, trigger_condition, original_action,
                evolved_action, original_score, usage_count, failure_reason, evolved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (original.rule_id, evolved.rule_id, original.trigger_condition,
             original.action, evolved.action, original.effectiveness_score,
             original.usage_count, failure_reason[:200], _now_iso()),
        )
        self._db.commit()


    def get_demotion_stats(self) -> dict:
        """降级统计报表：按类型/团队/时间聚合，含复审率"""
        from collections import Counter
        log = self.get_demotion_log()  # 倒序（最近在前）
        if not log:
            return {"total": 0, "by_rule_type": {}, "by_team": {}, "avg_score": 0,
                    "re_approval_rate": 0, "timeline": [], "top_rules": []}

        # 按类型
        by_type = Counter(e.get("rule_type", "unknown") for e in log)
        # 按团队
        by_team = Counter(e.get("team_id", "") or "(global)" for e in log)
        # 平均降级评分
        scores = [e["effectiveness_score"] for e in log if "effectiveness_score" in e]
        avg_score = sum(scores) / len(scores) if scores else 0.0

        # 复审率：被降级的规则当前是否已重新审批
        demoted_rule_ids = list({e["rule_id"] for e in log})
        re_approved = 0
        for rid in demoted_rule_ids:
            rule = self._load_rule(rid)
            if rule and rule.status == "approved":
                re_approved += 1
        re_approval_rate = re_approved / len(demoted_rule_ids) if demoted_rule_ids else 0.0

        # 按天聚合时间线（最近 14 天）
        day_counts: dict[str, int] = {}
        for e in log:
            day = e.get("demoted_at", "")[:10]
            if day:
                day_counts[day] = day_counts.get(day, 0) + 1
        timeline = sorted(day_counts.items(), reverse=True)[:14]

        # 降级次数最多的规则
        rule_counts = Counter(e["rule_id"] for e in log)
        top_rules = []
        for rid, count in rule_counts.most_common(5):
            entry = next(e for e in log if e["rule_id"] == rid)
            rule = self._load_rule(rid)
            top_rules.append({
                "rule_id": rid,
                "trigger_condition": entry.get("trigger_condition", ""),
                "action": entry.get("action", ""),
                "demotion_count": count,
                "current_status": rule.status if rule else "unknown",
                "last_score": entry.get("effectiveness_score", 0),
            })

        return {
            "total": len(log),
            "by_rule_type": dict(by_type),
            "by_team": dict(by_team),
            "avg_score": round(avg_score, 4),
            "re_approval_rate": round(re_approval_rate, 4),
            "timeline": [{"date": d, "count": c} for d, c in timeline],
            "top_rules": top_rules,
        }

    # 有效性阈值：连续使用 ≥ 此次数且成功率 < 此分数时自动降级
    DEMOTION_MIN_USAGE = 3
    DEMOTION_THRESHOLD = 0.4

    @property
    def demotion_threshold(self) -> float:
        return self._tp("experience.demotion_threshold", self.DEMOTION_THRESHOLD)

    def update_rule_effectiveness(self, rule_id: str, success: bool) -> bool:
        """更新规则有效性评分，低于阈值自动降级为 pending_review

        Args:
            rule_id: 规则 ID
            success: 本次注入后任务是否成功
        Returns:
            更新是否成功
        """
        rule = self._load_rule(rule_id)
        if rule is None:
            return False
        rule.usage_count += 1
        if success:
            rule.success_count += 1
        rule.effectiveness_score = rule.success_count / rule.usage_count if rule.usage_count else 0.0
        rule.last_used_at = _now_iso()
        # 影子对比（新旧 demotion_threshold 各判一次）
        self._record_demotion_shadow(
            rule.effectiveness_score,
            rule.status == "approved" and rule.usage_count >= self.DEMOTION_MIN_USAGE,
        )
        # 自动降级：使用次数足够但有效性过低
        if (rule.status == "approved"
                and rule.usage_count >= self.DEMOTION_MIN_USAGE
                and rule.effectiveness_score < self.demotion_threshold):
            rule.status = "pending_review"
            reason = f"score={rule.effectiveness_score:.2f} ({rule.success_count}/{rule.usage_count}) < {self.demotion_threshold:.0%} threshold"
            logger.warning("Rule %s auto-demoted: %s", rule_id, reason)
            self._append_demotion_log(rule, reason)
            # 记录 rule_demoted 事件
            if self._event_store:
                try:
                    from evolution_events import EvolutionEvent, new_event_id
                    self._event_store.record_event(EvolutionEvent(
                        event_id=new_event_id(),
                        event_type="rule_demoted",
                        agent_id=rule.source_agent_id or "",
                        timestamp=_now_iso(),
                        details={"rule_id": rule_id, "reason": reason, "score": rule.effectiveness_score},
                        before_state={"status": "approved"},
                        after_state={"status": "pending_review"},
                    ))
                except Exception:
                    pass
        # program-pivot M4: 规则自进化已删除（沉淀走 ProgramCompiler）
        self._save_rule(rule)
        logger.info("Rule %s effectiveness updated: score=%.2f (%d/%d)",
                     rule_id, rule.effectiveness_score, rule.success_count, rule.usage_count)
        return True

    def scan_and_demote_ineffective_rules(self) -> list[str]:
        """扫描所有已批准规则，降级有效性过低的规则

        Returns:
            被降级的规则 ID 列表
        """
        demoted = []
        for rule_id in self._list_rule_ids():
            rule = self._load_rule(rule_id)
            if rule is None:
                continue
            self._record_demotion_shadow(
                rule.effectiveness_score,
                rule.status == "approved" and rule.usage_count >= self.DEMOTION_MIN_USAGE,
            )
            if (rule.status == "approved"
                    and rule.usage_count >= self.DEMOTION_MIN_USAGE
                    and rule.effectiveness_score < self.demotion_threshold):
                rule.status = "pending_review"
                self._save_rule(rule)
                demoted.append(rule_id)
                reason = f"batch scan: score={rule.effectiveness_score:.2f} ({rule.success_count}/{rule.usage_count})"
                logger.warning("Rule %s batch-demoted: %s", rule_id, reason)
                self._append_demotion_log(rule, reason)
                # 记录 rule_demoted 事件
                if self._event_store:
                    try:
                        from evolution_events import EvolutionEvent, new_event_id
                        self._event_store.record_event(EvolutionEvent(
                            event_id=new_event_id(),
                            event_type="rule_demoted",
                            agent_id=rule.source_agent_id or "",
                            timestamp=_now_iso(),
                            details={"rule_id": rule_id, "reason": reason, "score": rule.effectiveness_score},
                            before_state={"status": "approved"},
                            after_state={"status": "pending_review"},
                        ))
                    except Exception:
                        pass
        return demoted

    # ──────────────────── 写入增量区 ────────────────────

    def write_to_incremental_area(self, rule: ExperienceRule) -> bool:
        """将审核通过的规则写入增量区

        Args:
            rule: 已批准的经验规则
        Returns:
            写入是否成功
        """
        if rule.status != "approved":
            logger.warning("Rule %s is not approved (status=%s), cannot write", rule.rule_id, rule.status)
            return False

        data = {
            "rules": [
                {
                    "rule_id": rule.rule_id,
                    "trigger_condition": rule.trigger_condition,
                    "action": rule.action,
                    "note": rule.note,
                    "source_task_id": rule.source_task_id,
                    "source_task_type": rule.source_task_type,
                    "rule_type": rule.rule_type,
                    "status": rule.status,
                    "keywords": rule.keywords,
                    "created_at": rule.created_at,
                }
            ]
        }

        path = os.path.join(self._rules_dir, f"{rule.rule_id}.yaml")
        try:
            with open(path, "w", encoding="utf-8") as f:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            logger.info("Rule %s written to incremental area", rule.rule_id)
            return True
        except Exception:
            logger.exception("Failed to write rule %s to incremental area", rule.rule_id)
            return False

    # ──────────────────── 检索与上下文 ────────────────────

    def _fts_available(self) -> bool:
        """检查 FTS5 表是否存在"""
        try:
            self._db.execute("SELECT 1 FROM experience_rules_fts LIMIT 1")
            return True
        except Exception:
            return False

    def retrieve_relevant_rules(self, task_type: str, keywords: list[str], team_id: str = "") -> list[ExperienceRule]:
        """根据任务特征检索相关经验规则

        优先使用 FTS5 全文检索预过滤候选集，再 Python 侧精排。
        FTS5 不可用时回退到 SQL 全表扫描 + Python 关键词匹配。

        Args:
            task_type: 任务类型
            keywords: 关键词列表
            team_id: 团队 ID（非空时仅返回同团队规则；空 = 全局，向后兼容）
        Returns:
            按相关度排序的规则列表
        """
        query_keywords = set(k.lower() for k in keywords)
        query_keywords.add(task_type.lower())

        # FTS5 预过滤：用关键词构造 MATCH 查询，缩小候选集
        candidate_ids: set[str] | None = None
        if self._fts_available() and query_keywords:
            # 转义 FTS5 特殊字符，用 OR 连接关键词
            safe_terms = []
            for kw in list(query_keywords)[:10]:
                escaped = kw.replace('"', '""')
                safe_terms.append(f'"{escaped}"')
            if safe_terms:
                fts_query = " OR ".join(safe_terms)
                try:
                    with self._lock:
                        fts_rows = self._db.execute(
                            "SELECT rule_id FROM experience_rules_fts WHERE experience_rules_fts MATCH ?",
                            (fts_query,),
                        ).fetchall()
                    candidate_ids = {r["rule_id"] for r in fts_rows}
                except Exception:
                    candidate_ids = None  # FTS 查询失败，回退全表
            if candidate_ids is not None and not candidate_ids:
                # FTS 空命中不判负：unicode61 对中文不分词，短查询词
                # （如"函数"）匹配不到规则里的整词 token，回退全表交给精排
                candidate_ids = None

        # 加载候选规则（FTS 命中集 或 SQL 全量 approved）
        with self._lock:
            if candidate_ids is not None:
                if not candidate_ids:
                    return []
                placeholders = ",".join("?" * len(candidate_ids))
                if team_id:
                    rows = self._db.execute(
                        f"SELECT * FROM experience_rules WHERE rule_id IN ({placeholders}) AND status = 'approved' AND team_id = ?",
                        list(candidate_ids) + [team_id],
                    ).fetchall()
                else:
                    rows = self._db.execute(
                        f"SELECT * FROM experience_rules WHERE rule_id IN ({placeholders}) AND status = 'approved'",
                        list(candidate_ids),
                    ).fetchall()
            else:
                # 回退：SQL 全量过滤
                if team_id:
                    rows = self._db.execute(
                        "SELECT * FROM experience_rules WHERE status = 'approved' AND team_id = ?",
                        (team_id,),
                    ).fetchall()
                else:
                    rows = self._db.execute(
                        "SELECT * FROM experience_rules WHERE status = 'approved'"
                    ).fetchall()

        scored: list[tuple] = []
        for row in rows:
            rule = self._row_to_rule(row)
            rule_keywords = set(k.lower() for k in rule.keywords)
            overlap = len(rule_keywords & query_keywords)
            # 类型匹配加分
            if rule.source_task_type.lower() == task_type.lower():
                overlap += 2
            if overlap == 0:
                # 内容级重叠：查询词与规则文本（关键词/触发条件/动作）的包含关系，
                # 弥补精确交集与整词 FTS 都命不中的情况（如 E5"拍平"类任务查 E1 规则）
                rule_text = (
                    " ".join(rule_keywords) + " "
                    + (rule.trigger_condition or "").lower() + " "
                    + (rule.action or "").lower()
                )
                query_text = " ".join(query_keywords)
                for qk in query_keywords:
                    if len(qk) >= 2 and qk in rule_text:
                        overlap += 1
                for rk in rule_keywords:
                    if len(rk) >= 2 and rk in query_text:
                        overlap += 1
            if overlap > 0:
                scored.append((overlap, rule))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [rule for _, rule in scored]

    def retrieve_with_shared(
        self,
        task_type: str,
        keywords: list[str],
        team_id: str = "",
        shared_pool_dir: str = "",
        limit: int = 10,
    ) -> list[dict]:
        """跨项目经验检索：本地规则 + 共享池规则联合搜索。

        Args:
            task_type: 任务类型
            keywords: 搜索关键词
            team_id: 团队 ID（本地规则过滤用）
            shared_pool_dir: 共享池目录路径（空则不搜索共享池）
            limit: 返回数量限制

        Returns:
            按相关度排序的规则列表（dict 格式，含 source 字段标识来源）
        """
        query_keywords = set(k.lower() for k in keywords)
        if task_type:
            query_keywords.add(task_type.lower())

        results = []

        # 1. 搜索本地规则
        local_rules = self.retrieve_relevant_rules(task_type, keywords, team_id)
        for rule in local_rules[:limit]:
            rule_keywords = set(k.lower() for k in rule.keywords)
            overlap = len(rule_keywords & query_keywords)
            if rule.source_task_type.lower() == task_type.lower():
                overlap += 2
            results.append({
                "score": overlap,
                "source": "local",
                "trigger_condition": rule.trigger_condition,
                "action": rule.action,
                "note": rule.note,
                "keywords": rule.keywords,
                "rule_type": rule.rule_type,
            })

        # 2. 搜索共享池
        if shared_pool_dir:
            try:
                from shared_experience_pool import SharedExperiencePool
                pool = SharedExperiencePool(shared_pool_dir)
                shared_rules = pool.search(task_type=task_type, keywords=list(keywords), limit=limit)
                for rule in shared_rules:
                    rule_keywords = set(k.lower() for k in rule.keywords)
                    overlap = len(rule_keywords & query_keywords)
                    if task_type and rule.rule_type.lower() == task_type.lower():
                        overlap += 2
                    results.append({
                        "score": overlap,
                        "source": f"shared:{rule.source_project}",
                        "trigger_condition": rule.trigger_condition,
                        "action": rule.action,
                        "note": rule.note,
                        "keywords": rule.keywords,
                        "rule_type": rule.rule_type,
                        "usage_count": rule.usage_count,
                    })
            except Exception as e:
                logger.debug("共享池搜索跳过: %s", e)

        # 3. 按分数排序，去重
        results.sort(key=lambda x: -x["score"])
        return results[:limit]

    def migrate_rules_team_id(self, team_id: str, rule_ids: list[str] | None = None) -> int:
        """存量规则 team_id 回填（规则级团队隔离迁移）。

        team_id 严格过滤（fail-closed）下 team_id="" 的存量规则对团队检索不可见
        （注入死数据）——本方法把未归属规则批量回填到指定团队，返回迁移条数。
        已含 team_id 的规则与未命中规则不计；幂等（重复调用返回 0）。
        """
        if not team_id:
            return 0
        ids = rule_ids if rule_ids is not None else self._list_rule_ids()
        migrated = 0
        for rule_id in ids:
            rule = self._load_rule(rule_id)
            if rule is None or rule.team_id:
                continue
            if self.modify_rule(rule_id, {"team_id": team_id}):
                migrated += 1
        logger.info("Migrated %d rules to team %s", migrated, team_id)
        return migrated

    def build_experience_context(self, rules: list[ExperienceRule]) -> str:
        """将规则格式化为可注入的提示上下文（完整版）

        Args:
            rules: 经验规则列表
        Returns:
            格式化的上下文文本
        """
        if not rules:
            return ""

        lines = ["## 历史经验参考", ""]
        for i, rule in enumerate(rules, 1):
            lines.append(f"### 经验 {i}")
            lines.append(f"- **触发条件**: {rule.trigger_condition}")
            lines.append(f"- **建议动作**: {rule.action}")
            if rule.note:
                lines.append(f"- **补充说明**: {rule.note}")
            lines.append(f"- **来源类型**: {rule.rule_type}")
            lines.append(f"- **关键词**: {', '.join(rule.keywords)}")
            lines.append("")

        return "\n".join(lines)

    def build_experience_summary(self, rules: list[ExperienceRule], max_rules: int = 5) -> str:
        """渐进披露：生成精简版经验摘要（仅触发条件 + 建议动作），减少 context 消耗。

        完整详情在 agent 需要时可通过 retrieve_relevant_rules 按需加载。
        """
        if not rules:
            return ""

        lines = ["## 经验摘要（精简版）", ""]
        for i, rule in enumerate(rules[:max_rules], 1):
            action_preview = rule.action[:80] + ("..." if len(rule.action) > 80 else "")
            lines.append(f"{i}. [{rule.rule_type}] {rule.trigger_condition} → {action_preview}")

        if len(rules) > max_rules:
            lines.append(f"\n（共 {len(rules)} 条，显示前 {max_rules} 条，完整版可按需加载）")

        return "\n".join(lines)

    # ──────────────────── 查询方法 ────────────────────

    def get_pending_rules(self) -> list[ExperienceRule]:
        """获取待审核的规则列表

        Returns:
            待审核规则列表
        """
        return self.get_all_rules(status="pending_review")

    def get_all_rules(self, status: str | None = None) -> list[ExperienceRule]:
        """获取所有规则

        Args:
            status: 按状态过滤（可选）
        Returns:
            规则列表
        """
        if status:
            rows = self._db.execute(
                "SELECT * FROM experience_rules WHERE status = ?", (status,)
            ).fetchall()
        else:
            rows = self._db.execute("SELECT * FROM experience_rules").fetchall()
        return [self._row_to_rule(r) for r in rows]

    @staticmethod
    def _infer_task_type(task_description: str) -> str:
        """从任务描述推断任务类型"""
        desc = task_description.lower()
        if any(kw in desc for kw in ['ppt', '演示', '幻灯片']):
            return 'ppt-design'
        if any(kw in desc for kw in ['视频', '短片', '动画']):
            return 'video-production'
        if any(kw in desc for kw in ['小说', '故事', '写作', '文章']):
            return 'content-writing'
        if any(kw in desc for kw in ['代码', '开发', '系统', '程序', '网站', 'app']):
            return 'software-dev'
        if any(kw in desc for kw in ['数据', '分析', '报表']):
            return 'data-analysis'
        return 'general'

    @staticmethod
    def _extract_content_keywords(text: str) -> set:
        """从文本中提取内容关键词（中文词+英文词）"""
        keywords = set()
        # 提取中文词（2-6字）
        for kw in re.findall(r'[\u4e00-\u9fff]{2,6}', text):
            keywords.add(kw)
        # 提取英文词（3字母以上）
        for kw in re.findall(r'[a-zA-Z]{3,}', text):
            keywords.add(kw.lower())
        # 过滤常见停用词
        stop_words = {'the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'has', 'can', 'will'}
        keywords -= stop_words
        return keywords
