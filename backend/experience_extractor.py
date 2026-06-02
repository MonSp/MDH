"""经验提炼器 - 从执行日志中提炼可复用的经验规则

负责分析员工智能体的执行日志（成功/失败），提炼经验规则并写入技能增量区。
支持规则审核流程和基于关键词的检索。
"""

import logging
import os
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
        }
        for key, value in updates.items():
            if key in allowed_fields:
                setattr(rule, key, value)
            else:
                logger.warning("Field '%s' is not modifiable, skipped", key)

        self._save_rule(rule)
        logger.info("Rule %s modified", rule_id)
        return True

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

        approved_dir = os.path.join(self._incremental_dir, "approved")
        os.makedirs(approved_dir, exist_ok=True)

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
                    "keywords": rule.keywords,
                    "created_at": rule.created_at,
                }
            ]
        }

        path = os.path.join(approved_dir, f"{rule.rule_id}.yaml")
        try:
            with open(path, "w", encoding="utf-8") as f:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            logger.info("Rule %s written to incremental area", rule.rule_id)
            return True
        except Exception:
            logger.exception("Failed to write rule %s to incremental area", rule.rule_id)
            return False

    # ──────────────────── 检索与上下文 ────────────────────

    def retrieve_relevant_rules(self, task_type: str, keywords: List[str]) -> List[ExperienceRule]:
        """根据任务特征检索相关经验规则

        基于关键词匹配实现：计算规则关键词与查询关键词的交集大小作为相关度。

        Args:
            task_type: 任务类型
            keywords: 关键词列表
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
            rule_keywords = set(k.lower() for k in rule.keywords)
            overlap = len(rule_keywords & query_keywords)
            # 类型匹配加分
            if rule.source_task_type.lower() == task_type.lower():
                overlap += 2
            if overlap > 0:
                scored.append((overlap, rule))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [rule for _, rule in scored]

    def build_experience_context(self, rules: List[ExperienceRule]) -> str:
        """将规则格式化为可注入的提示上下文

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
