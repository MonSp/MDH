"""Agent 持久档案管理 — SQLite 存储后端"""

import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from db import get_db, get_write_lock
from cache import get_cache

logger = logging.getLogger("agent_profile")


@dataclass
class SkillProgress:
    skill_id: str
    xp: int = 0
    level: int = 0
    task_count: int = 0
    success_count: int = 0
    avg_review_score: float = 0.0
    last_used_at: str = ""


@dataclass
class AgentProfile:
    agent_id: str
    name: str
    created_at: float = 0.0
    career_stage: str = "junior"
    department: str = ""
    total_xp: int = 0
    skill_progress: Dict[str, dict] = field(default_factory=dict)


class AgentProfileManager:
    def __init__(self, profiles_dir: str, event_store=None):
        self._dir = profiles_dir
        self._db_path = os.path.join(profiles_dir, "profiles.db")
        os.makedirs(self._dir, exist_ok=True)
        self._locks: Dict[str, threading.Lock] = {}
        self._locks_lock = threading.Lock()
        self._db = get_db(self._db_path)
        self._event_store = event_store

    def _get_lock(self, agent_id: str) -> threading.Lock:
        with self._locks_lock:
            if agent_id not in self._locks:
                self._locks[agent_id] = threading.Lock()
            return self._locks[agent_id]

    def get_or_create(self, agent_id: str, name: str, department: str = "") -> AgentProfile:
        with get_write_lock(self._db_path):
            existing = self._get_profile_db(agent_id)
            if existing:
                if department and not existing.department:
                    existing.department = department
                    self._save_profile_db(existing)
                return existing
            profile = AgentProfile(
                agent_id=agent_id,
                name=name,
                created_at=time.time(),
                department=department,
            )
            self._save_profile_db(profile)
            return profile

    def get_profile(self, agent_id: str) -> Optional[AgentProfile]:
        return self._get_profile_db(agent_id)

    def _get_profile_db(self, agent_id: str) -> Optional[AgentProfile]:
        cache = get_cache()
        cached = cache.get(f"profile:{agent_id}")
        if cached is not None:
            return cached
        row = self._db.execute(
            "SELECT * FROM agent_profiles WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        if not row:
            return None
        profile = AgentProfile(
            agent_id=row["agent_id"],
            name=row["name"],
            created_at=row["created_at"],
            career_stage=row["career_stage"],
            department=row["department"],
            total_xp=row["total_xp"],
            skill_progress=json.loads(row["skill_progress"]) if isinstance(row["skill_progress"], str) else row["skill_progress"],
        )
        cache.set(f"profile:{agent_id}", profile, ttl=120)
        return profile

    def save_profile(self, profile: AgentProfile) -> None:
        with self._get_lock(profile.agent_id):
            # 检测 career_stage 变化 → 记录 career_promotion 事件
            if self._event_store:
                try:
                    old_profile = self._get_profile_db(profile.agent_id)
                    if old_profile and old_profile.career_stage != profile.career_stage:
                        from evolution_events import EvolutionEvent, new_event_id, _now_iso
                        self._event_store.record_event(EvolutionEvent(
                            event_id=new_event_id(),
                            event_type="career_promotion",
                            agent_id=profile.agent_id,
                            timestamp=_now_iso(),
                            details={
                                "old_stage": old_profile.career_stage,
                                "new_stage": profile.career_stage,
                            },
                            before_state={"career_stage": old_profile.career_stage},
                            after_state={"career_stage": profile.career_stage},
                        ))
                except Exception:
                    pass
            self._save_profile_db(profile)

    def _save_profile_db(self, profile: AgentProfile) -> None:
        with get_write_lock(self._db_path):
            self._db.execute(
                """INSERT OR REPLACE INTO agent_profiles
                   (agent_id, name, created_at, career_stage, department, total_xp, skill_progress)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (profile.agent_id, profile.name, profile.created_at,
                 profile.career_stage, profile.department, profile.total_xp,
                 json.dumps(profile.skill_progress, ensure_ascii=False)),
            )
            self._db.commit()
            get_cache().invalidate(f"profile:{profile.agent_id}")

    def list_profiles(self) -> List[AgentProfile]:
        rows = self._db.execute("SELECT * FROM agent_profiles").fetchall()
        return [
            AgentProfile(
                agent_id=r["agent_id"], name=r["name"], created_at=r["created_at"],
                career_stage=r["career_stage"], department=r["department"],
                total_xp=r["total_xp"],
                skill_progress=json.loads(r["skill_progress"]) if isinstance(r["skill_progress"], str) else r["skill_progress"],
            )
            for r in rows
        ]

    def find_mentor(self, agent_id: str) -> Optional[AgentProfile]:
        STAGE_ORDER = {"junior": 0, "mid": 1, "senior": 2, "lead": 3}
        profile = self.get_profile(agent_id)
        if not profile or not profile.department:
            return None
        current_stage = STAGE_ORDER.get(profile.career_stage, 0)

        rows = self._db.execute(
            "SELECT * FROM agent_profiles WHERE department = ? AND agent_id != ?",
            (profile.department, agent_id),
        ).fetchall()

        best = None
        best_stage = -1
        best_xp = -1
        for r in rows:
            stage = STAGE_ORDER.get(r["career_stage"], 0)
            xp = r["total_xp"]
            if stage > best_stage or (stage == best_stage and xp > best_xp):
                best = r
                best_stage = stage
                best_xp = xp

        if best and best_stage > current_stage:
            return AgentProfile(
                agent_id=best["agent_id"], name=best["name"], created_at=best["created_at"],
                career_stage=best["career_stage"], department=best["department"],
                total_xp=best["total_xp"],
                skill_progress=json.loads(best["skill_progress"]) if isinstance(best["skill_progress"], str) else best["skill_progress"],
            )
        return None

    def get_department_peers(self, agent_id: str) -> List[AgentProfile]:
        profile = self.get_profile(agent_id)
        if not profile or not profile.department:
            return []
        rows = self._db.execute(
            "SELECT * FROM agent_profiles WHERE department = ?",
            (profile.department,),
        ).fetchall()
        return [
            AgentProfile(
                agent_id=r["agent_id"], name=r["name"], created_at=r["created_at"],
                career_stage=r["career_stage"], department=r["department"],
                total_xp=r["total_xp"],
                skill_progress=json.loads(r["skill_progress"]) if isinstance(r["skill_progress"], str) else r["skill_progress"],
            )
            for r in rows
        ]

    # ── XP 系统 ──

    def grant_xp(self, agent_id, skill_id, task_success, review_score, task_complexity, skill_config):
        with get_write_lock(self._db_path):
            return self._grant_xp_unsafe(agent_id, skill_id, task_success, review_score, task_complexity, skill_config)

    def _grant_xp_unsafe(self, agent_id, skill_id, task_success, review_score, task_complexity, skill_config) -> Dict:
        profile = self._get_profile_db(agent_id)
        if not profile:
            return {"xp_gained": 0, "new_level": 0, "leveled_up": False, "skill_id": skill_id}

        sp = profile.skill_progress.get(skill_id, {
            "skill_id": skill_id, "xp": 0, "level": 0, "task_count": 0,
            "success_count": 0, "avg_review_score": 0.0, "last_used_at": "",
        })
        old_level = sp["level"]
        sp["task_count"] += 1
        base_xp = 10 + task_complexity * 5

        if not task_success:
            xp_gained = 0
            sp["avg_review_score"] = (sp["avg_review_score"] * (sp["task_count"] - 1) + review_score) / sp["task_count"]
        else:
            sp["success_count"] += 1
            xp = base_xp + base_xp  # 基础 + 成功奖励
            if review_score >= 8:
                xp = int(xp * 1.5)
            if sp["task_count"] == 1:
                xp += 20
            task_level = max(1, min(3, task_complexity // 2 + 1))
            level_diff = sp["level"] - task_level
            if level_diff >= 2:
                xp = max(1, int(xp * 0.1))
            elif level_diff >= 1:
                xp = max(1, int(xp * 0.5))
            xp_gained = xp
            sp["xp"] += xp
            sp["avg_review_score"] = (sp["avg_review_score"] * (sp["task_count"] - 1) + review_score) / sp["task_count"]
            thresholds = skill_config.get("xp_thresholds", [100, 300, 600])
            while sp["level"] < 3 and sp["xp"] >= thresholds[sp["level"]]:
                sp["level"] += 1

        sp["last_used_at"] = datetime.now(timezone.utc).isoformat()
        profile.skill_progress[skill_id] = sp
        profile.total_xp = sum(s.get("xp", 0) for s in profile.skill_progress.values())
        self._save_profile_db(profile)

        leveled_up = sp["level"] > old_level

        # ── Prometheus 计数器 ──
        if xp_gained > 0:
            try:
                from prometheus_metrics import XP_GRANTED
                XP_GRANTED.inc(xp_gained)
            except ImportError:
                pass
        if leveled_up:
            try:
                from prometheus_metrics import SKILL_LEVEL_UPS
                SKILL_LEVEL_UPS.inc()
            except ImportError:
                pass

        # ── 记录进化事件 ──
        if self._event_store and xp_gained > 0:
            try:
                from evolution_events import EvolutionEvent, new_event_id, _now_iso
                self._event_store.record_event(EvolutionEvent(
                    event_id=new_event_id(),
                    event_type="xp_granted",
                    agent_id=agent_id,
                    timestamp=_now_iso(),
                    details={"xp_gained": xp_gained, "skill_id": skill_id, "new_total_xp": profile.total_xp},
                    before_state={"total_xp": profile.total_xp - xp_gained},
                    after_state={"total_xp": profile.total_xp},
                ))
            except Exception:
                pass

        if self._event_store and leveled_up:
            try:
                from evolution_events import EvolutionEvent, new_event_id, _now_iso
                self._event_store.record_event(EvolutionEvent(
                    event_id=new_event_id(),
                    event_type="skill_level_up",
                    agent_id=agent_id,
                    timestamp=_now_iso(),
                    details={"skill_id": skill_id, "old_level": old_level, "new_level": sp["level"]},
                    before_state={"level": old_level},
                    after_state={"level": sp["level"]},
                ))
            except Exception:
                pass

        return {
            "xp_gained": xp_gained,
            "new_level": sp["level"],
            "leveled_up": leveled_up,
            "skill_id": skill_id,
        }


def migrate_json_to_sqlite(profiles_dir: str) -> int:
    """从 JSON 文件迁移到 SQLite"""
    import json as _json
    db_path = os.path.join(profiles_dir, "profiles.db")
    if not os.path.isfile(db_path):
        return 0

    conn = get_db(db_path)
    migrated = 0
    for fname in os.listdir(profiles_dir):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(profiles_dir, fname)
        try:
            with open(fpath, encoding="utf-8") as f:
                data = _json.load(f)
            agent_id = data.get("agent_id", fname[:-5])
            conn.execute(
                "INSERT OR IGNORE INTO agent_profiles (agent_id, name, created_at, career_stage, department, total_xp, skill_progress) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (agent_id, data.get("name", agent_id), data.get("created_at", 0),
                 data.get("career_stage", "junior"), data.get("department", ""),
                 data.get("total_xp", 0), _json.dumps(data.get("skill_progress", {}), ensure_ascii=False)),
            )
            conn.commit()
            migrated += 1
        except Exception:
            logger.warning("Migration skip: %s", fname)
    return migrated
