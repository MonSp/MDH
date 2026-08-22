"""经验提炼器 - 从执行日志中提炼可复用的经验规则

负责分析员工智能体的执行日志（成功/失败），提炼经验规则并写入技能增量区。
支持规则审核流程和基于关键词的检索。
"""

import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

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
    keywords: List[str]  # 关键词标签
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


def _extract_keywords_from_steps(steps: List[dict], task_type: str) -> List[str]:
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


def _extract_keywords_from_errors(errors: List[dict]) -> List[str]:
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


def _identify_decision_points(steps: List[dict]) -> List[dict]:
    """识别关键决策点"""
    decision_points = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        if step.get("is_decision") or step.get("decision"):
            decision_points.append(step)
        elif step.get("selected_option") or step.get("chosen_approach"):
            decision_points.append(step)
    return decision_points


class ExperienceExtractor:
    """经验提炼器

    从执行日志中提炼可复用的经验规则，支持审核流程，
    将通过审核的规则写入技能增量区。
    """

    def __init__(self, incremental_dir: str):
        """初始化经验提炼器

        Args:
            incremental_dir: 技能增量区根目录
        """
        self._incremental_dir = incremental_dir
        self._rules_dir = os.path.join(incremental_dir, "rules")
        self._demotion_log_path = os.path.join(incremental_dir, "demotion_log.json")
        os.makedirs(self._rules_dir, exist_ok=True)

    # ──────────────────── 规则存储 ────────────────────

    def _rule_file_path(self, rule_id: str) -> str:
        """获取规则文件路径"""
        return os.path.join(self._rules_dir, f"{rule_id}.yaml")

    def _save_rule(self, rule: ExperienceRule) -> None:
        """将规则保存为 YAML 文件"""
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
                    "team_id": rule.team_id,
                    "source_agent_id": rule.source_agent_id,
                    "effectiveness_score": rule.effectiveness_score,
                    "usage_count": rule.usage_count,
                    "success_count": rule.success_count,
                    "parent_rule_id": rule.parent_rule_id,
                    "evolution_count": rule.evolution_count,
                    "last_used_at": rule.last_used_at,
                }
            ]
        }
        path = self._rule_file_path(rule.rule_id)
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    def _load_rule(self, rule_id: str) -> Optional[ExperienceRule]:
        """从 YAML 文件加载规则"""
        path = self._rule_file_path(rule_id)
        if not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            rules_list = data.get("rules", [])
            if not rules_list:
                return None
            r = rules_list[0]
            return ExperienceRule(
                rule_id=r["rule_id"],
                trigger_condition=r["trigger_condition"],
                action=r["action"],
                note=r.get("note", ""),
                source_task_id=r["source_task_id"],
                source_task_type=r["source_task_type"],
                rule_type=r["rule_type"],
                status=r["status"],
                keywords=r.get("keywords", []),
                created_at=r["created_at"],
                team_id=r.get("team_id", ""),  # 旧规则文件缺键容错
                source_agent_id=r.get("source_agent_id", ""),
                effectiveness_score=float(r.get("effectiveness_score", 0.0)),
                usage_count=int(r.get("usage_count", 0)),
                success_count=int(r.get("success_count", 0)),
                parent_rule_id=r.get("parent_rule_id", ""),
                evolution_count=int(r.get("evolution_count", 0)),
                last_used_at=r.get("last_used_at", ""),
            )
        except Exception:
            logger.exception("Failed to load rule %s", rule_id)
            return None

    def _list_rule_ids(self) -> List[str]:
        """列出所有规则文件对应的 rule_id"""
        if not os.path.isdir(self._rules_dir):
            return []
        result = []
        for fname in os.listdir(self._rules_dir):
            if fname.endswith(".yaml"):
                result.append(fname[: -len(".yaml")])
        return result

    # ──────────────────── 经验提炼 ────────────────────

    def extract_from_success(self, log: ExecutionLog) -> List[ExperienceRule]:
        """从成功执行日志中提炼经验

        提炼逻辑：
        1. 提取任务类型和关键步骤
        2. 识别"关键决策点"（如选择特定方案）
        3. 生成"当遇到 [条件] 时，执行 [动作]"的规则
        4. 提取关键词标签

        Args:
            log: 执行日志
        Returns:
            提炼出的经验规则列表
        """
        if log.status not in ("success", "revision_success"):
            return []

        rules: List[ExperienceRule] = []
        keywords = _extract_keywords_from_steps(log.steps, log.task_type)

        # 规则 1：基于关键决策点
        decision_points = _identify_decision_points(log.steps)
        for dp in decision_points:
            selected = dp.get("selected_option") or dp.get("chosen_approach") or dp.get("decision", "")
            reason = dp.get("reason", "")
            condition = f"task_type is {log.task_type} and encounter decision: {dp.get('action', dp.get('command', ''))}"
            action = f"choose approach: {selected}"
            note = reason if reason else f"此决策在任务 {log.task_id} 中被成功验证"
            dp_keywords = list(keywords)
            desc_words = dp.get("action", "").split()
            for w in desc_words:
                if len(w) > 2 and w.lower() not in dp_keywords:
                    dp_keywords.append(w.lower())

            rules.append(
                ExperienceRule(
                    rule_id=_new_rule_id(),
                    trigger_condition=condition,
                    action=action,
                    note=note,
                    source_task_id=log.task_id,
                    source_task_type=log.task_type,
                    rule_type="success_pattern",
                    status="pending_review",
                    keywords=sorted(set(dp_keywords)),
                    created_at=_now_iso(),
                )
            )

        # 规则 2：基于任务整体成功模式
        if log.steps:
            step_summary_parts = []
            for s in log.steps:
                if isinstance(s, dict):
                    cmd = s.get("command") or s.get("action", "")
                    if cmd:
                        step_summary_parts.append(cmd)

            if step_summary_parts:
                step_summary = " -> ".join(step_summary_parts[:5])
                condition = f"task_type is {log.task_type} and task_description similar to '{log.task_description[:80]}'"
                action = f"follow steps pattern: {step_summary}"
                note = f"任务 {log.task_id} 成功完成，以上步骤模式可复用"

                rules.append(
                    ExperienceRule(
                        rule_id=_new_rule_id(),
                        trigger_condition=condition,
                        action=action,
                        note=note,
                        source_task_id=log.task_id,
                        source_task_type=log.task_type,
                        rule_type="success_pattern",
                        status="pending_review",
                        keywords=keywords,
                        created_at=_now_iso(),
                    )
                )

        return rules

    def extract_from_failure_recovery(self, log: ExecutionLog) -> List[ExperienceRule]:
        """从失败-修正交互对中提炼经验

        提炼逻辑：
        1. 匹配错误和对应的修正步骤
        2. 生成"当出现 [错误类型] 时，执行 [修正动作]"的规则
        3. 记录失败原因和避免方法

        Args:
            log: 包含错误和修正记录的执行日志
        Returns:
            提炼出的经验规则列表
        """
        if not log.errors or not log.corrections:
            return []

        rules: List[ExperienceRule] = []
        error_keywords = _extract_keywords_from_errors(log.errors)
        step_keywords = _extract_keywords_from_steps(log.steps, log.task_type)
        all_keywords = sorted(set(error_keywords + step_keywords))

        # 尝试匹配错误与修正
        matched_correction_indices: set = set()
        for i, error in enumerate(log.errors):
            if not isinstance(error, dict):
                continue

            error_type = error.get("type", "unknown_error")
            error_msg = error.get("message", "")
            error_step = error.get("step_index", i)

            # 查找对应的修正（仅通过显式关联字段匹配）
            matching_correction = None
            matching_idx = -1
            for ci, correction in enumerate(log.corrections):
                if not isinstance(correction, dict):
                    continue
                corr_for_error = correction.get("error_index", correction.get("for_step", None))
                if corr_for_error is not None and (corr_for_error == error_step or corr_for_error == i):
                    matching_correction = correction
                    matching_idx = ci
                    break

            if matching_correction is None:
                continue

            matched_correction_indices.add(matching_idx)
            correction_action = matching_correction.get("action", matching_correction.get("description", ""))
            correction_command = matching_correction.get("command", "")
            correction_detail = correction_action or correction_command

            condition = f"task_type is {log.task_type} and error occurs: {error_type}"
            if error_msg:
                condition += f" with message containing '{error_msg[:60]}'"

            action = f"apply correction: {correction_detail}"
            note = f"在任务 {log.task_id} 中，错误 '{error_type}' 通过 '{correction_detail}' 修正成功"

            err_kw = list(all_keywords)
            if error_type and error_type not in err_kw:
                err_kw.append(error_type)

            rules.append(
                ExperienceRule(
                    rule_id=_new_rule_id(),
                    trigger_condition=condition,
                    action=action,
                    note=note,
                    source_task_id=log.task_id,
                    source_task_type=log.task_type,
                    rule_type="failure_avoidance",
                    status="pending_review",
                    keywords=sorted(set(err_kw)),
                    created_at=_now_iso(),
                )
            )

        # 未匹配到错误的修正记录，生成通用修正提示
        unmatched_corrections = [
            c for ci, c in enumerate(log.corrections)
            if isinstance(c, dict) and ci not in matched_correction_indices
        ]
        if unmatched_corrections:
            for correction in unmatched_corrections:
                if not isinstance(correction, dict):
                    continue
                correction_action = correction.get("action", correction.get("description", correction.get("command", "")))
                if not correction_action:
                    continue

                condition = f"task_type is {log.task_type} and task encounters failure"
                action = f"try correction: {correction_action}"
                note = f"在任务 {log.task_id} 中，此修正方法有效"

                rules.append(
                    ExperienceRule(
                        rule_id=_new_rule_id(),
                        trigger_condition=condition,
                        action=action,
                        note=note,
                        source_task_id=log.task_id,
                        source_task_type=log.task_type,
                        rule_type="correction_tip",
                        status="pending_review",
                        keywords=all_keywords,
                        created_at=_now_iso(),
                    )
                )

        return rules

    # ──────────────────── 审核流程 ────────────────────

    def submit_for_review(self, rule: ExperienceRule) -> str:
        """提交规则审核

        Args:
            rule: 待审核的经验规则
        Returns:
            规则 ID
        """
        rule.status = "pending_review"
        self._save_rule(rule)
        logger.info("Rule %s submitted for review", rule.rule_id)
        return rule.rule_id

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
            "source_task_type",  # 规则类型（extract_from_meeting 生成）；skill_evolution 元数据回填用
            "team_id",  # 归属团队；skill_evolution 团队回填用（规则级团队隔离）
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
        """追加一条降级记录到持久化日志"""
        import json
        entry = {
            "rule_id": rule.rule_id,
            "trigger_condition": rule.trigger_condition,
            "action": rule.action,
            "rule_type": rule.rule_type,
            "effectiveness_score": round(rule.effectiveness_score, 4),
            "usage_count": rule.usage_count,
            "success_count": rule.success_count,
            "reason": reason,
            "team_id": rule.team_id,
            "demoted_at": _now_iso(),
        }
        try:
            log = []
            if os.path.isfile(self._demotion_log_path):
                with open(self._demotion_log_path, encoding="utf-8") as f:
                    log = json.load(f)
            log.append(entry)
            tmp = self._demotion_log_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._demotion_log_path)
        except Exception:
            logger.exception("Failed to append demotion log")

    def get_demotion_log(self) -> List[Dict]:
        """获取降级日志（最近的在前）"""
        import json
        try:
            if os.path.isfile(self._demotion_log_path):
                with open(self._demotion_log_path, encoding="utf-8") as f:
                    log = json.load(f)
                return list(reversed(log))
        except Exception:
            logger.exception("Failed to read demotion log")
        return []

    # ──────────────────── 抗过拟合机制 ────────────────────

    MAX_SAME_DOMAIN_EVOLUTIONS = 3  # 同一领域短期内最多进化次数
    EXPLORE_RATIO = 0.2  # 探索比例：20% 的注入使用随机规则
    AGING_DAYS = 30  # 规则老化天数

    def _check_evolution_diversity(self, rule: ExperienceRule) -> bool:
        """多样性检查：防止同一领域进化过多

        如果近期进化次数中，该规则的 rule_type 占比超过 50%，则拒绝进化。
        """
        evolution_log = self.get_evolution_log()
        if not evolution_log:
            return True

        # 统计近期进化（最近 10 次）的 rule_type 分布
        recent = evolution_log[:10]
        type_counts: Dict[str, int] = {}
        for entry in recent:
            # 从进化日志中推断 rule_type
            orig_id = entry.get("original_rule_id", "")
            orig_rule = self._load_rule(orig_id)
            if orig_rule:
                rt = orig_rule.rule_type
                type_counts[rt] = type_counts.get(rt, 0) + 1

        rule_type = rule.rule_type
        same_type = type_counts.get(rule_type, 0)
        total = sum(type_counts.values()) or 1

        if same_type / total > 0.5 and same_type >= self.MAX_SAME_DOMAIN_EVOLUTIONS:
            return False  # 该领域进化过多，拒绝
        return True

    def retrieve_with_aging(self, task_type: str, keywords: List[str], team_id: str = "") -> List[ExperienceRule]:
        """带老化机制的规则检索

        - 老规则（超过 AGING_DAYS 未使用）降权
        - 高分规则优先
        - 20% 概率注入随机规则（探索）
        """
        import random as _random
        from datetime import datetime, timezone, timedelta

        rules = self.retrieve_relevant_rules(task_type, keywords, team_id)
        if not rules:
            return []

        now = datetime.now(timezone.utc)
        aging_threshold = now - timedelta(days=self.AGING_DAYS)

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
        if len(scored) >= 3 and _random.random() < self.EXPLORE_RATIO:
            # 探索：随机选一条规则替换末位
            random_rule = _random.choice(scored)[1]
            scored.sort(key=lambda x: x[0], reverse=True)
            scored[-1] = (scored[-1][0], random_rule)

        scored.sort(key=lambda x: x[0], reverse=True)
        return [rule for _, rule in scored]

    SHARE_MIN_SCORE = 0.7
    SHARE_MIN_USAGE = 5

    def get_share_recommendations(self) -> List[Dict]:
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
    EVOLUTION_MAX_COUNT = 3  # 单条规则最多进化 3 次

    def evolve_rule(self, rule_id: str, failure_reason: str = "") -> Optional[ExperienceRule]:
        """规则自进化：分析失败原因，生成改进版规则

        Args:
            rule_id: 原规则 ID
            failure_reason: 最近一次失败的审查反馈（可选）
        Returns:
            进化后的新规则，或 None（不满足进化条件）
        """
        rule = self._load_rule(rule_id)
        if not rule:
            return None
        return self._evolve_rule_impl(rule, failure_reason)

    def _evolve_rule_impl(self, rule: ExperienceRule, failure_reason: str = "") -> Optional[ExperienceRule]:
        """规则自进化实现（接受内存中的规则对象，含抗过拟合检查）"""
        # 检查进化条件
        if rule.status not in ("approved", "pending_review"):
            return None
        if rule.usage_count < self.EVOLUTION_MIN_USAGE:
            return None
        if rule.effectiveness_score >= self.EVOLUTION_MIN_SCORE:
            return None
        if rule.evolution_count >= self.EVOLUTION_MAX_COUNT:
            logger.info("Rule %s 已达最大进化次数 (%d)，跳过", rule.rule_id, self.EVOLUTION_MAX_COUNT)
            return None

        # 抗过拟合：多样性检查
        if not self._check_evolution_diversity(rule):
            logger.info("Rule %s 多样性检查未通过，跳过进化（该领域近期进化过多）", rule.rule_id)
            return None

        # 生成改进版规则
        evolved = self._generate_evolved_rule(rule, failure_reason)
        if not evolved:
            return None

        # 保存进化后的规则
        self._save_rule(evolved)
        logger.info("Rule %s 进化为 %s (evolution_count=%d)",
                     rule.rule_id, evolved.rule_id, evolved.evolution_count)

        # 记录进化日志
        self._append_evolution_log(rule, evolved, failure_reason)

        # 联动进化：更新关联技能包和资产
        try:
            from knowledge_network import KnowledgeNetwork
            network = KnowledgeNetwork(
                data_dir=os.path.dirname(self._incremental_dir),
                skill_packs_dir=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skill_packs"),
            )
            network.propagate_rule_evolution(rule.rule_id, evolved.rule_id, rule.keywords)
        except Exception as e:
            logger.debug("联动进化跳过: %s", e)

        # 多团队联邦：高分进化规则自动发布到共享池
        try:
            from team_federation import TeamFederation
            federation = TeamFederation(os.path.dirname(self._incremental_dir))
            federation.publish_evolution(
                team_id=rule.team_id or "global",
                rule_data={
                    "rule_id": evolved.rule_id,
                    "trigger_condition": evolved.trigger_condition,
                    "action": evolved.action,
                    "keywords": evolved.keywords,
                    "rule_type": evolved.rule_type,
                    "effectiveness_score": evolved.effectiveness_score,
                    "usage_count": evolved.usage_count,
                },
            )
        except Exception as e:
            logger.debug("联邦发布跳过: %s", e)

        return evolved

    def _generate_evolved_rule(self, original: ExperienceRule, failure_reason: str) -> Optional[ExperienceRule]:
        """生成改进版规则（基于原规则 + 失败原因）

        策略：
        1. 保留原规则的核心意图
        2. 根据失败原因调整 trigger_condition 或 action
        3. 重置统计计数，保留 parent_rule_id 链
        """
        # 简单进化策略：调整 action，添加更具体的约束
        evolved_action = original.action
        if failure_reason:
            # 从失败原因中提取关键约束
            constraints = self._extract_constraints_from_failure(failure_reason)
            if constraints:
                evolved_action = f"{original.action}（注意：{constraints}）"

        evolved = ExperienceRule(
            rule_id=_new_rule_id(),
            trigger_condition=original.trigger_condition,
            action=evolved_action,
            note=f"从 {original.rule_id[:8]} 进化而来。原规则有效性: {original.effectiveness_score:.0%}",
            source_task_id=original.source_task_id,
            source_task_type=original.source_task_type,
            rule_type=original.rule_type,
            status="approved",  # 进化版自动批准
            keywords=original.keywords,
            created_at=_now_iso(),
            team_id=original.team_id,
            source_agent_id=original.source_agent_id,
            parent_rule_id=original.rule_id,
            evolution_count=original.evolution_count + 1,
        )

        # 退役原规则
        original.status = "evolved"
        self._save_rule(original)

        return evolved

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

    def get_evolution_chain(self, rule_id: str) -> List[Dict]:
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
        for rid in self._list_rule_ids():
            rule = self._load_rule(rid)
            if rule and rule.parent_rule_id == rule_id and rid not in visited:
                chain.extend(self.get_evolution_chain(rid))

        return chain

    def get_evolution_log(self) -> List[Dict]:
        """获取进化日志"""
        import json
        log_path = os.path.join(self._incremental_dir, "evolution_log.json")
        try:
            if os.path.isfile(log_path):
                with open(log_path, encoding="utf-8") as f:
                    return list(reversed(json.load(f)))
        except Exception:
            pass
        return []

    def _append_evolution_log(self, original: ExperienceRule, evolved: ExperienceRule, failure_reason: str) -> None:
        """记录进化事件"""
        import json
        log_path = os.path.join(self._incremental_dir, "evolution_log.json")
        entry = {
            "original_rule_id": original.rule_id,
            "evolved_rule_id": evolved.rule_id,
            "trigger_condition": original.trigger_condition,
            "original_action": original.action,
            "evolved_action": evolved.action,
            "original_score": original.effectiveness_score,
            "usage_count": original.usage_count,
            "failure_reason": failure_reason[:200],
            "evolved_at": _now_iso(),
        }
        try:
            log = []
            if os.path.isfile(log_path):
                with open(log_path, encoding="utf-8") as f:
                    log = json.load(f)
            log.append(entry)
            tmp = log_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
            os.replace(tmp, log_path)
        except Exception:
            logger.exception("Failed to append evolution log")

    def get_demotion_stats(self) -> Dict:
        """降级统计报表：按类型/团队/时间聚合，含复审率"""
        import json
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
        day_counts: Dict[str, int] = {}
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
        # 自动降级：使用次数足够但有效性过低
        if (rule.status == "approved"
                and rule.usage_count >= self.DEMOTION_MIN_USAGE
                and rule.effectiveness_score < self.DEMOTION_THRESHOLD):
            rule.status = "pending_review"
            reason = f"score={rule.effectiveness_score:.2f} ({rule.success_count}/{rule.usage_count}) < {self.DEMOTION_THRESHOLD:.0%} threshold"
            logger.warning("Rule %s auto-demoted: %s", rule_id, reason)
            self._append_demotion_log(rule, reason)
        # 规则自进化：低分规则自动生成改进版（独立于降级检查）
        if rule.effectiveness_score < self.EVOLUTION_MIN_SCORE and rule.usage_count >= self.EVOLUTION_MIN_USAGE:
            self._evolve_rule_impl(rule)
        self._save_rule(rule)
        logger.info("Rule %s effectiveness updated: score=%.2f (%d/%d)",
                     rule_id, rule.effectiveness_score, rule.success_count, rule.usage_count)
        return True

    def scan_and_demote_ineffective_rules(self) -> List[str]:
        """扫描所有已批准规则，降级有效性过低的规则

        Returns:
            被降级的规则 ID 列表
        """
        demoted = []
        for rule_id in self._list_rule_ids():
            rule = self._load_rule(rule_id)
            if (rule is not None
                    and rule.status == "approved"
                    and rule.usage_count >= self.DEMOTION_MIN_USAGE
                    and rule.effectiveness_score < self.DEMOTION_THRESHOLD):
                rule.status = "pending_review"
                self._save_rule(rule)
                demoted.append(rule_id)
                reason = f"batch scan: score={rule.effectiveness_score:.2f} ({rule.success_count}/{rule.usage_count})"
                logger.warning("Rule %s batch-demoted: %s", rule_id, reason)
                self._append_demotion_log(rule, reason)
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

    def retrieve_relevant_rules(self, task_type: str, keywords: List[str], team_id: str = "") -> List[ExperienceRule]:
        """根据任务特征检索相关经验规则

        基于关键词匹配实现：计算规则关键词与查询关键词的交集大小作为相关度。

        Args:
            task_type: 任务类型
            keywords: 关键词列表
            team_id: 团队 ID（非空时仅返回同团队规则；空 = 全局，向后兼容）
        Returns:
            按相关度排序的规则列表
        """
        all_rule_ids = self._list_rule_ids()
        query_keywords = set(k.lower() for k in keywords)
        query_keywords.add(task_type.lower())

        scored: List[tuple] = []
        for rule_id in all_rule_ids:
            rule = self._load_rule(rule_id)
            if rule is None or rule.status != "approved":
                continue
            if team_id and rule.team_id != team_id:
                continue  # 团队隔离：非空 team_id 时仅返回同团队规则（空=全局，向后兼容）
            rule_keywords = set(k.lower() for k in rule.keywords)
            overlap = len(rule_keywords & query_keywords)
            # 类型匹配加分
            if rule.source_task_type.lower() == task_type.lower():
                overlap += 2
            if overlap > 0:
                scored.append((overlap, rule))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [rule for _, rule in scored]

    def retrieve_with_shared(
        self,
        task_type: str,
        keywords: List[str],
        team_id: str = "",
        shared_pool_dir: str = "",
        limit: int = 10,
    ) -> List[Dict]:
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

    def migrate_rules_team_id(self, team_id: str, rule_ids: Optional[List[str]] = None) -> int:
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

    def build_experience_context(self, rules: List[ExperienceRule]) -> str:
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

    def build_experience_summary(self, rules: List[ExperienceRule], max_rules: int = 5) -> str:
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

    def get_pending_rules(self) -> List[ExperienceRule]:
        """获取待审核的规则列表

        Returns:
            待审核规则列表
        """
        return self.get_all_rules(status="pending_review")

    def get_all_rules(self, status: Optional[str] = None) -> List[ExperienceRule]:
        """获取所有规则

        Args:
            status: 按状态过滤（可选）
        Returns:
            规则列表
        """
        all_rule_ids = self._list_rule_ids()
        rules = []
        for rule_id in all_rule_ids:
            rule = self._load_rule(rule_id)
            if rule is None:
                continue
            if status is None or rule.status == status:
                rules.append(rule)
        return rules

    def extract_from_meeting(
        self,
        project_id: str,
        task_description: str,
        discussion_results: list,
        review_result: dict,
        execution_results: list,
    ) -> List[ExperienceRule]:
        """从会议结果中提炼经验规则

        分析讨论决策、审查反馈、执行结果，生成可复用的经验规则。

        Args:
            project_id: 项目ID
            task_description: 任务描述
            discussion_results: 讨论结果列表
            review_result: 审查结果
            execution_results: 执行结果列表

        Returns:
            提炼出的经验规则列表
        """
        rules: List[ExperienceRule] = []
        task_type = self._infer_task_type(task_description)

        # 从任务描述中提取内容关键词
        content_keywords = self._extract_content_keywords(task_description)

        # 1. 从讨论决策中提取成功模式
        for result in discussion_results:
            stance = result.get("parsed_stance", "neutral")
            role = result.get("role", "")
            content = result.get("content", "")
            if stance in ("support", "modify") and content:
                core = re.sub(r'\[STANCE:.*?\]', '', content)
                core = re.sub(r'\[CONFIDENCE:.*?\]', '', core).strip()
                if len(core) > 20:
                    rule_keywords = sorted(set(content_keywords | {task_type, role, stance}))
                    rule = ExperienceRule(
                        rule_id=_new_rule_id(),
                        trigger_condition=f"task_type is {task_type} and role is {role}",
                        action=core[:200],
                        note=f"来自{role}的讨论建议，立场: {stance}",
                        source_task_id=project_id,
                        source_task_type=task_type,
                        rule_type="success_pattern",
                        status="pending_review",
                        keywords=rule_keywords,
                        created_at=_now_iso(),
                    )
                    rules.append(rule)

        # 2. 从审查反馈中提取改进点
        reviewer_feedback = review_result.get("reviewer_feedback", "")
        monitor_feedback = review_result.get("monitor_feedback", "")
        if reviewer_feedback:
            rule = ExperienceRule(
                rule_id=_new_rule_id(),
                trigger_condition=f"task_type is {task_type} and review stage",
                action=reviewer_feedback[:200],
                note="审查者反馈",
                source_task_id=project_id,
                source_task_type=task_type,
                rule_type="correction_tip",
                status="pending_review",
                keywords=sorted(content_keywords | {task_type, "review", "quality"}),
                created_at=_now_iso(),
            )
            rules.append(rule)
        if monitor_feedback:
            rule = ExperienceRule(
                rule_id=_new_rule_id(),
                trigger_condition=f"task_type is {task_type} and monitoring stage",
                action=monitor_feedback[:200],
                note="监控者评估",
                source_task_id=project_id,
                source_task_type=task_type,
                rule_type="failure_avoidance",
                status="pending_review",
                keywords=sorted(content_keywords | {task_type, "monitor", "risk"}),
                created_at=_now_iso(),
            )
            rules.append(rule)

        # 3. 从执行结果中提取文件模式
        for exec_result in execution_results:
            written_files = exec_result.get("written_files", [])
            if written_files:
                file_types = set()
                for f in written_files:
                    if '.' in f:
                        ext = f.rsplit('.', 1)[-1]
                        file_types.add(ext)
                if file_types:
                    rule = ExperienceRule(
                        rule_id=_new_rule_id(),
                        trigger_condition=f"task_type is {task_type}",
                        action=f"创建文件类型: {', '.join(sorted(file_types))}",
                        note=f"本次项目创建了 {len(written_files)} 个文件",
                        source_task_id=project_id,
                        source_task_type=task_type,
                        rule_type="success_pattern",
                        status="pending_review",
                        keywords=sorted(file_types | {task_type}),
                        created_at=_now_iso(),
                    )
                    rules.append(rule)

        # 保存规则
        for rule in rules:
            self._save_rule(rule)

        logger.info("从项目 %s 提取了 %d 条经验规则", project_id, len(rules))
        return rules

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
