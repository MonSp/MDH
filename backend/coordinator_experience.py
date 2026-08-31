"""
Experience injection, memory, and skill evolution for MeetingCoordinator.

Extracted from meeting_coordinator.py to isolate experience/memory logic.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List

from meeting import SessionEventType

logger = logging.getLogger("coordinator_experience")


async def update_injected_rule_effectiveness(coordinator, coordinator_id: str, injected_rule_ids: List[str], review_result: Dict[str, Any]) -> None:
    """根据审查结果更新已注入规则的有效性评分，降级时发出告警"""
    try:
        extractor = coordinator._get_experience_extractor()
        structured = review_result.get("structured_feedback", {})
        task_success = structured.get("status", "approved") == "approved"
        demoted_rules = []
        for rule_id in injected_rule_ids:
            before = extractor._load_rule(rule_id)
            before_status = before.status if before else None
            extractor.update_rule_effectiveness(rule_id, task_success)
            after = extractor._load_rule(rule_id)
            if before_status == "approved" and after and after.status == "pending_review":
                demoted_rules.append(after)
        logger.info("已更新 %d 条注入规则有效性 (success=%s, demoted=%d)",
                     len(injected_rule_ids), task_success, len(demoted_rules))
        if demoted_rules:
            alert_lines = [f"⚠️ 规则自动降级告警（{len(demoted_rules)} 条）："]
            for r in demoted_rules:
                alert_lines.append(
                    f"  - [{r.rule_id[:8]}] {r.trigger_condition} → {r.action}"
                    f"  (score={r.effectiveness_score:.0%}, {r.success_count}/{r.usage_count})"
                )
            alert_lines.append("已退回待审核队列，请检查并决定是否重新批准。")
            alert_text = "\n".join(alert_lines)
            await coordinator._msg(coordinator_id, alert_text)
            coordinator.meeting.add_message("agent", alert_text, coordinator_id)
            coordinator.meeting.append_event(
                SessionEventType.RULE_DEMOTION,
                content=alert_text,
                agent_id=coordinator_id, phase="post_execution",
            )
    except Exception as e:
        logger.debug("规则有效性更新跳过: %s", e)


def recall_agent_memory(coordinator, agent_id: str, task_description: str) -> str:
    """检索 agent 记忆中与任务相关的经验，返回格式化上下文"""
    try:
        from agent_memory import AgentMemory
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        memory = AgentMemory(data_dir)
        return memory.recall_for_task(agent_id, task_description)
    except Exception as e:
        logger.debug("记忆检索跳过: %s", e)
        return ""


def write_task_memory(coordinator, agent_id: str, task_description: str, task_success: bool, review_score: float, execution_summary: str = ""):
    """任务完成后自动写入 agent 记忆"""
    try:
        from agent_memory import AgentMemory
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        memory = AgentMemory(data_dir)

        words = re.findall(r'[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}', task_description)
        keywords = list(set(w.lower() for w in words if len(w) > 2))[:5]

        if task_success:
            content = f"完成任务：{task_description[:100]}"
            importance = min(1.0, 0.3 + review_score * 0.07)
        else:
            content = f"任务未通过审查：{task_description[:100]}"
            importance = 0.6

        memory.add_memory(agent_id, {
            "type": "task_summary",
            "content": content,
            "keywords": keywords,
            "importance": importance,
        })
        logger.info("Agent %s 记忆已写入: %s", agent_id, content[:50])
    except Exception as e:
        logger.debug("记忆写入跳过: %s", e)


def finalize_skill_evolution(coordinator, extractor, packager, project_id: str) -> Dict[str, Any]:
    """技能闭环自动触发：审核 pending 规则 → 写增量区 → 打包升级版技能包

    Returns:
        {"approved": int, "written": int, "packaged": List[str]}
    """
    result: Dict[str, Any] = {"approved": 0, "written": 0, "packaged": []}
    skill_packs_root = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skill_packs"
    )

    pending = extractor.get_pending_rules()
    for rule in pending:
        source = getattr(rule, "source_task_id", None)
        if source and source != project_id:
            continue
        if not extractor.approve_rule(rule.rule_id):
            continue
        result["approved"] += 1
        approved_rule = extractor._load_rule(rule.rule_id)
        if approved_rule and extractor.write_to_incremental_area(approved_rule):
            result["written"] += 1
            log_skill_evolution(project_id, approved_rule)
            for kw in approved_rule.keywords or []:
                base_skill = os.path.join(skill_packs_root, kw)
                if os.path.isdir(base_skill) and kw not in result["packaged"]:
                    packager.full_package(
                        base_skill_path=base_skill,
                        incremental_path=extractor._incremental_dir,
                        project_id=project_id,
                        skill_name=kw,
                    )
                    result["packaged"].append(kw)
    return result


def log_skill_evolution(project_id: str, rule) -> None:
    """将技能进化事件记录到 SQLite evolution_log 表"""
    try:
        from db import get_db
        db_path = os.path.join(os.path.dirname(__file__), "data", "mdh.db")
        conn = get_db(db_path)
        conn.execute(
            """INSERT INTO evolution_log
               (original_rule_id, evolved_rule_id, trigger_condition, original_action,
                evolved_action, original_score, usage_count, failure_reason, evolved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (rule.rule_id, rule.rule_id, rule.trigger_condition,
             rule.action, rule.action, rule.effectiveness_score,
             rule.usage_count, f"meeting_finalize:{project_id}",
             datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    except Exception as e:
        logger.warning("记录技能进化事件失败: %s", e)


async def inject_experience(coordinator, coordinator_id, original_description, enhanced_description, discussion_results, target_agent_id: str = ""):
    """注入历史经验到任务描述，优先注入 mentor 规则

    Returns:
        (增强描述, 注入的规则 ID 列表)
    """
    injected_rule_ids = []
    mentor_rule_ids = []
    try:
        from agent_profile_manager import AgentProfileManager
        extractor = coordinator._get_experience_extractor()
        profile_mgr = AgentProfileManager(os.path.join(coordinator._data_dir, "agent_profiles"))

        task_type = extractor._infer_task_type(original_description)
        content_kw = extractor._extract_content_keywords(original_description)
        for dr in discussion_results:
            content_kw |= extractor._extract_content_keywords(dr.get("content", ""))
        past_rules = extractor.retrieve_relevant_rules(task_type, sorted(content_kw))

        if past_rules:
            mentor = profile_mgr.find_mentor(target_agent_id) if target_agent_id else None
            mentor_rules = [r for r in past_rules if r.source_agent_id == mentor.agent_id] if mentor else []
            other_rules = [r for r in past_rules if r.rule_id not in {mr.rule_id for mr in mentor_rules}]

            prioritized = mentor_rules + other_rules
            injected = prioritized[:5]
            injected_rule_ids = [r.rule_id for r in injected]
            mentor_rule_ids = [r.rule_id for r in mentor_rules if r in injected]

            exp_context = extractor.build_experience_summary(injected)
            enhanced_description = f"{enhanced_description}\n\n{exp_context}"

            mentor_info = f"（含 {len(mentor_rule_ids)} 条来自 mentor {mentor.agent_id} 的经验）" if mentor_rule_ids else ""
            await coordinator._msg(coordinator_id, f"项目经理：已注入 {len(injected)} 条历史经验到任务描述{mentor_info}。")
            coordinator.meeting.add_message("agent", f"项目经理：已注入 {len(injected)} 条历史经验到任务描述{mentor_info}。", coordinator_id)
            coordinator.meeting.append_event(
                SessionEventType.EXPERIENCE_INJECTION,
                content=f"注入 {len(injected)} 条经验规则 (task_type={task_type}, mentor_rules={len(mentor_rule_ids)}, rule_ids={injected_rule_ids})",
                agent_id=coordinator_id, phase="pre_execution",
            )

            if mentor_rule_ids:
                log_knowledge_flow(mentor.agent_id if mentor else "", target_agent_id, mentor_rule_ids)
    except Exception as e:
        logger.debug("历史经验注入跳过: %s", e)
    return enhanced_description, injected_rule_ids


def log_knowledge_flow(from_agent: str, to_agent: str, rule_ids: List[str]) -> None:
    """记录知识流动（mentor → mentee）"""
    try:
        log_path = os.path.join(os.path.dirname(__file__), "data", "knowledge_flow.json")
        entry = {
            "from_agent": from_agent,
            "to_agent": to_agent,
            "rule_ids": rule_ids,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
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
        logger.debug("知识流动日志写入失败")
