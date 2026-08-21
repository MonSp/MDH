"""角色晋升引擎 — 根据部门职业路径和技能等级自动晋升 agent 角色"""

import logging
from typing import Dict, List, Optional
from agent_profile_manager import AgentProfile

logger = logging.getLogger("promotion_engine")

CAREER_ORDER = ["junior", "mid", "senior", "lead"]


class PromotionEngine:
    def check_promotion(
        self, profile: AgentProfile, roles_config: dict
    ) -> Optional[dict]:
        """检查是否满足晋升条件，返回目标阶段信息或 None

        Returns:
            {"stage": "mid", "title": "中级工程师", "department": "dept-software"} or None
        """
        career_paths = roles_config.get("career_paths", {})
        department = profile.department

        if not department or department not in career_paths:
            return None

        path = career_paths[department]
        stages = path.get("stages", [])

        # 找到当前阶段
        current_stage = profile.career_stage
        current_idx = None
        for i, s in enumerate(stages):
            if s["stage"] == current_stage:
                current_idx = i
                break

        if current_idx is None:
            # 未知阶段，尝试从 CAREER_ORDER 推断
            if current_stage in CAREER_ORDER:
                current_idx = CAREER_ORDER.index(current_stage)
            else:
                current_idx = 0

        # 检查下一阶段
        next_idx = current_idx + 1
        if next_idx >= len(stages):
            return None

        next_stage = stages[next_idx]
        req = next_stage.get("requirements")
        if not req:
            # 无要求，自动晋升
            return {
                "stage": next_stage["stage"],
                "title": next_stage.get("title", next_stage["stage"]),
                "department": department,
                "dept_name": path.get("name", department),
            }

        skills = profile.skill_progress

        # 检查中级技能数量
        min_mid = req.get("min_mid_skills", 0)
        mid_count = sum(1 for s in skills.values() if s.get("level", 0) >= 2)
        if mid_count < min_mid:
            return None

        # 检查高级技能数量
        min_senior = req.get("min_senior_skills", 0)
        senior_count = sum(1 for s in skills.values() if s.get("level", 0) >= 3)
        if senior_count < min_senior:
            return None

        # 检查必要技能
        required = req.get("required_skills", {})
        for skill_id, min_level in required.items():
            if skills.get(skill_id, {}).get("level", 0) < min_level:
                return None

        return {
            "stage": next_stage["stage"],
            "title": next_stage.get("title", next_stage["stage"]),
            "department": department,
            "dept_name": path.get("name", department),
        }

    def apply_promotion(self, profile: AgentProfile, promotion: dict) -> AgentProfile:
        """应用晋升"""
        profile.career_stage = promotion["stage"]
        logger.info("Agent %s promoted to %s (%s, %s)",
                     profile.agent_id, promotion["stage"],
                     promotion.get("title", ""), promotion.get("department", ""))
        return profile

    def get_career_path(self, profile: AgentProfile, roles_config: dict) -> Optional[dict]:
        """获取 agent 当前部门的完整职业路径"""
        career_paths = roles_config.get("career_paths", {})
        department = profile.department
        if not department or department not in career_paths:
            return None
        return career_paths[department]

    def list_departments(self, roles_config: dict) -> List[dict]:
        """列出所有部门职业路径"""
        career_paths = roles_config.get("career_paths", {})
        return [
            {"department": dept_id, "name": path.get("name", dept_id), "stages": path.get("stages", [])}
            for dept_id, path in career_paths.items()
        ]
