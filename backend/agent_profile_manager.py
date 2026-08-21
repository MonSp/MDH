"""Agent 持久档案管理 — 跨项目追踪 agent 技能成长"""

import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger("agent_profile")


@dataclass
class SkillProgress:
    skill_id: str
    xp: int = 0
    level: int = 0          # 0=未解锁, 1=初级, 2=中级, 3=高级
    task_count: int = 0
    success_count: int = 0
    avg_review_score: float = 0.0
    last_used_at: str = ""


@dataclass
class AgentProfile:
    agent_id: str
    name: str
    created_at: float = 0.0
    career_stage: str = "junior"   # junior / mid / senior / lead
    total_xp: int = 0
    skill_progress: Dict[str, dict] = field(default_factory=dict)  # skill_id -> SkillProgress dict


class AgentProfileManager:
    def __init__(self, profiles_dir: str):
        self._dir = profiles_dir
        os.makedirs(self._dir, exist_ok=True)

    def _path(self, agent_id: str) -> str:
        return os.path.join(self._dir, f"{agent_id}.json")

    def get_or_create(self, agent_id: str, name: str) -> AgentProfile:
        existing = self.get_profile(agent_id)
        if existing:
            return existing
        profile = AgentProfile(
            agent_id=agent_id,
            name=name,
            created_at=time.time(),
        )
        self.save_profile(profile)
        return profile

    def get_profile(self, agent_id: str) -> Optional[AgentProfile]:
        path = self._path(agent_id)
        if not os.path.isfile(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            return AgentProfile(**data)
        except Exception:
            logger.exception("Failed to load profile %s", agent_id)
            return None

    def save_profile(self, profile: AgentProfile) -> None:
        path = self._path(profile.agent_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(asdict(profile), f, ensure_ascii=False, indent=2)

    def list_profiles(self) -> List[AgentProfile]:
        if not os.path.isdir(self._dir):
            return []
        profiles = []
        for fname in os.listdir(self._dir):
            if fname.endswith(".json"):
                profile = self.get_profile(fname[:-5])
                if profile:
                    profiles.append(profile)
        return profiles

    def grant_xp(
        self,
        agent_id: str,
        skill_id: str,
        task_success: bool,
        review_score: float,
        task_complexity: int,
        skill_config: dict,
    ) -> Dict:
        """授予 XP 并检查升级"""
        profile = self.get_profile(agent_id)
        if not profile:
            return {"xp_gained": 0, "new_level": 0, "leveled_up": False, "skill_id": skill_id}

        sp = profile.skill_progress.get(skill_id, {
            "skill_id": skill_id, "xp": 0, "level": 0, "task_count": 0,
            "success_count": 0, "avg_review_score": 0.0, "last_used_at": "",
        })
        old_level = sp["level"]
        sp["task_count"] += 1

        # 基础 XP
        base_xp = 10 + task_complexity * 5

        if not task_success:
            # 失败不获得 XP，但更新审查评分
            xp_gained = 0
            sp["avg_review_score"] = (
                (sp["avg_review_score"] * (sp["task_count"] - 1) + review_score) / sp["task_count"]
            )
        else:
            sp["success_count"] += 1
            xp = base_xp  # 基础

            # 成功奖励 +100%
            xp += base_xp

            # 审查加成
            if review_score >= 8:
                xp = int(xp * 1.5)

            # 首次使用奖励
            if sp["task_count"] == 1:
                xp += 20

            # XP 衰减：agent 等级 > 任务难度时递减
            task_level = max(1, min(3, task_complexity // 2 + 1))  # complexity 1-5 → level 1-3
            level_diff = sp["level"] - task_level
            if level_diff >= 2:
                xp = max(1, int(xp * 0.1))
            elif level_diff >= 1:
                xp = max(1, int(xp * 0.5))

            xp_gained = xp
            sp["xp"] += xp
            sp["avg_review_score"] = (
                (sp["avg_review_score"] * (sp["task_count"] - 1) + review_score) / sp["task_count"]
            )

            # 检查升级
            thresholds = skill_config.get("xp_thresholds", [100, 300, 600])
            while sp["level"] < 3 and sp["xp"] >= thresholds[sp["level"]]:
                sp["level"] += 1

        sp["last_used_at"] = datetime.now(timezone.utc).isoformat()
        profile.skill_progress[skill_id] = sp
        profile.total_xp = sum(s["xp"] for s in profile.skill_progress.values())
        self.save_profile(profile)

        return {
            "xp_gained": xp_gained,
            "new_level": sp["level"],
            "leveled_up": sp["level"] > old_level,
            "skill_id": skill_id,
        }
