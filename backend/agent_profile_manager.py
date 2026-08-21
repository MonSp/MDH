"""Agent 持久档案管理 — 跨项目追踪 agent 技能成长"""

import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict
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
