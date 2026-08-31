"""
Side effects for MeetingCoordinator — XP grants, notifications.

Extracted from meeting_coordinator.py to isolate effect logic.
"""

import logging
import os
from typing import Any, Dict

logger = logging.getLogger("coordinator_effects")


async def notify_agent_status(coordinator, agent_id: str, status: str, current_tool: str = "", artifact_count: int = 0) -> None:
    """发送 agent 状态变化通知到前端（用于 3D 场景可视化）"""
    if not coordinator._current_on_message:
        return
    try:
        await coordinator._current_on_message(
            agent_id, "", "",
            msg_type="agent_status_update",
            agent_id=agent_id,
            status=status,
            current_tool=current_tool,
            artifact_count=artifact_count,
        )
    except Exception as e:
        logger.debug("agent 状态通知发送失败: %s", e)


async def notify_artifact_created(coordinator, agent_id: str, files_count: int, file_types: list, summary: str = "") -> None:
    """发送 artifact 创建通知到前端（用于 3D 场景可视化）"""
    if not coordinator._current_on_message:
        return
    try:
        await coordinator._current_on_message(
            agent_id, "", "",
            msg_type="artifact_created",
            agent_id=agent_id,
            files_count=files_count,
            file_types=file_types,
            summary=summary[:200],
        )
    except Exception as e:
        logger.debug("artifact 创建通知发送失败: %s", e)


def grant_task_xp(coordinator, agent_id, skill_id, task_success, review_score, task_complexity, department: str = "") -> Dict[str, Any]:
    """任务完成后授予 XP，含 mentor 奖励"""
    try:
        from agent_profile_manager import AgentProfileManager
        mgr = getattr(coordinator, '_agent_profile_manager', None)
        if mgr is None:
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        profile = mgr.get_or_create(agent_id, agent_id, department=department)
        from agent_toolset import load_roles_config
        roles_config = load_roles_config()
        skill_config = roles_config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
        result = mgr.grant_xp(agent_id, skill_id, task_success, review_score, task_complexity, skill_config)
        if result.get("leveled_up"):
            logger.info("Agent %s 技能 %s 升级到 Lv.%d", agent_id, skill_id, result["new_level"])
            dept = department or (profile.department if profile else "")
            if dept:
                coordinator.router.update_skill_boost(dept)
        from promotion_engine import PromotionEngine
        engine = PromotionEngine()
        profile = mgr.get_profile(agent_id)
        promotion = engine.check_promotion(profile, roles_config)
        if promotion:
            engine.apply_promotion(profile, promotion)
            mgr.save_profile(profile)
            result["promoted_to"] = promotion
            logger.info("Agent %s 晋升为 %s (%s)", agent_id, promotion["title"], promotion["stage"])
        if task_success and result.get("xp_gained", 0) > 0:
            mentor = mgr.find_mentor(agent_id)
            if mentor:
                bonus_xp = max(1, int(result["xp_gained"] * 0.2))
                mentor_skill_config = roles_config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
                mgr.grant_xp(mentor.agent_id, skill_id, True, review_score, max(1, task_complexity - 1), mentor_skill_config)
                logger.info("Mentor %s 获得 %d XP 奖励（mentee %s 完成任务）", mentor.agent_id, bonus_xp, agent_id)
        return result
    except Exception as e:
        logger.debug("grant-xp 跳过: %s", e)
        return {"xp_gained": 0}
