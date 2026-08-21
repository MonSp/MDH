"""角色晋升引擎 — 根据技能等级自动晋升 agent 角色"""

import logging
from typing import Dict, Optional
from agent_profile_manager import AgentProfile

logger = logging.getLogger("promotion_engine")

# 晋升顺序
CAREER_ORDER = ["junior", "mid", "senior", "lead"]
ROLE_TO_STAGE = {
    "executor": "junior",
    "reviewer": "mid",
    "coordinator": "senior",
    "planner": "lead",
}
STAGE_TO_ROLE = {v: k for k, v in ROLE_TO_STAGE.items()}


class PromotionEngine:
    def check_promotion(
        self, profile: AgentProfile, roles_config: dict
    ) -> Optional[str]:
        """检查是否满足晋升条件，返回目标角色或 None"""
        reqs = roles_config.get("promotion_requirements", {})
        # Normalize career_stage: may be a role name (e.g. "reviewer") or a stage name (e.g. "mid")
        current_stage = ROLE_TO_STAGE.get(profile.career_stage, profile.career_stage)
        current_stage_idx = CAREER_ORDER.index(current_stage) if current_stage in CAREER_ORDER else 0

        for target_role, req in reqs.items():
            target_stage = ROLE_TO_STAGE.get(target_role, "junior")
            target_stage_idx = CAREER_ORDER.index(target_stage)

            # 只检查下一个阶段的晋升
            if target_stage_idx != current_stage_idx + 1:
                continue

            skills = profile.skill_progress

            # 检查中级技能数量
            min_mid = req.get("min_mid_skills", 0)
            mid_count = sum(1 for s in skills.values() if s.get("level", 0) >= 2)
            if mid_count < min_mid:
                continue

            # 检查高级技能数量
            min_senior = req.get("min_senior_skills", 0)
            senior_count = sum(1 for s in skills.values() if s.get("level", 0) >= 3)
            if senior_count < min_senior:
                continue

            # 检查必要技能
            required = req.get("required_skills", {})
            met = True
            for skill_id, min_level in required.items():
                if skills.get(skill_id, {}).get("level", 0) < min_level:
                    met = False
                    break
            if not met:
                continue

            return target_role

        return None

    def apply_promotion(self, profile: AgentProfile, target_role: str) -> AgentProfile:
        """应用晋升"""
        profile.career_stage = target_role
        logger.info("Agent %s promoted to %s", profile.agent_id, target_role)
        return profile
