# 数字员工职业发展体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现数字员工职业发展体系的核心数据层——技能定义扩展、AgentProfile 持久化、XP 系统、自动升级、角色晋升。

**Architecture:** 三个新模块（agent_profile_manager.py, promotion_engine.py, skill_tree.py）+ roles_config.yaml 扩展 + API 端点 + 任务完成后自动 grant-xp 集成。数据存 JSON 文件（data/agent_profiles/），与现有 ExperienceRule 系统并行。

**Tech Stack:** Python, PyYAML, pytest, FastAPI

## Global Constraints

- 所有数据持久化到 JSON 文件（data/agent_profiles/），不引入新数据库
- XP 只增不减（降级保护）
- XP 衰减：agent 等级 > 任务难度时收益递减
- 角色晋升是单向的，不自动降级
- 与现有 roles_config.yaml 和 ExperienceRule 系统兼容

---

### Task 1: 扩展 roles_config.yaml 的技能定义

**Covers:** S1, S4

**Files:**
- Modify: `backend/roles_config.yaml` — skills 部分 (lines 1751-1835)
- Test: `backend/tests/test_skill_tree.py`

**Interfaces:**
- Produces: `roles_config.yaml` 中每个 skill 新增 `category`, `prerequisites`, `xp_thresholds` 字段

- [ ] **Step 1: Write tests for skill tree parsing**

```python
# backend/tests/test_skill_tree.py
import pytest
import yaml
import os

@pytest.fixture
def roles_config():
    path = os.path.join(os.path.dirname(__file__), "..", "roles_config.yaml")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)

class TestSkillTreeParsing:
    def test_all_skills_have_category(self, roles_config):
        """每个技能都有 category 字段"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            assert "category" in skill_def, f"{skill_id} missing category"
            assert skill_def["category"] in ("engineering", "design", "content", "data", "management")

    def test_all_skills_have_xp_thresholds(self, roles_config):
        """每个技能都有 xp_thresholds，3 个递增的整数"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            assert "xp_thresholds" in skill_def, f"{skill_id} missing xp_thresholds"
            thresholds = skill_def["xp_thresholds"]
            assert len(thresholds) == 3
            assert thresholds[0] < thresholds[1] < thresholds[2]

    def test_all_skills_have_prerequisites(self, roles_config):
        """每个技能都有 prerequisites 列表"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            assert "prerequisites" in skill_def, f"{skill_id} missing prerequisites"
            assert isinstance(skill_def["prerequisites"], list)

    def test_prerequisites_reference_valid_skills(self, roles_config):
        """前置技能引用的 skill_id 必须存在"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            for prereq in skill_def.get("prerequisites", []):
                assert prereq["skill"] in skills, f"{skill_id} references unknown skill {prereq['skill']}"
                assert prereq["min_level"] in (1, 2, 3)

    def test_no_circular_prerequisites(self, roles_config):
        """前置技能不能形成环"""
        skills = roles_config.get("skills", {})
        visited = set()
        path = set()

        def dfs(skill_id):
            if skill_id in path:
                return False  # cycle
            if skill_id in visited:
                return True
            path.add(skill_id)
            visited.add(skill_id)
            for prereq in skills.get(skill_id, {}).get("prerequisites", []):
                if not dfs(prereq["skill"]):
                    return False
            path.remove(skill_id)
            return True

        for skill_id in skills:
            assert dfs(skill_id), f"Circular prerequisite detected involving {skill_id}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_skill_tree.py -xvs --timeout=30`
Expected: FAIL — skills don't have category/prerequisites/xp_thresholds

- [ ] **Step 3: Extend roles_config.yaml skills section**

For each of the 36 skills in `roles_config.yaml` (lines 1751-1835), add `category`, `prerequisites`, and `xp_thresholds`. Example for first few:

```yaml
skills:
  api_design:
    description: "API 设计"
    category: engineering
    prerequisites:
      - skill: backend_dev
        min_level: 1
    xp_thresholds: [100, 300, 600]
  architecture:
    description: "系统架构设计"
    category: engineering
    prerequisites:
      - skill: api_design
        min_level: 2
      - skill: backend_dev
        min_level: 2
    xp_thresholds: [100, 300, 600]
  backend_dev:
    description: "后端开发"
    category: engineering
    prerequisites: []
    xp_thresholds: [100, 300, 600]
  frontend_dev:
    description: "前端开发"
    category: engineering
    prerequisites: []
    xp_thresholds: [100, 300, 600]
  fullstack_dev:
    description: "全栈开发"
    category: engineering
    prerequisites:
      - skill: backend_dev
        min_level: 1
      - skill: frontend_dev
        min_level: 1
    xp_thresholds: [100, 300, 600]
```

Continue for all 36 skills following the dependency graph in S4 of the spec.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_skill_tree.py -xvs --timeout=30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/roles_config.yaml backend/tests/test_skill_tree.py
git commit -m "feat(v1.4.0): 扩展技能定义 — category/prerequisites/xp_thresholds"
```

---

### Task 2: AgentProfile 数据模型与持久化

**Covers:** S1

**Files:**
- Create: `backend/agent_profile_manager.py`
- Test: `backend/tests/test_agent_profile_manager.py`

**Interfaces:**
- Produces: `AgentProfileManager` class with methods:
  - `get_or_create(agent_id, name) -> AgentProfile`
  - `get_profile(agent_id) -> Optional[AgentProfile]`
  - `save_profile(profile) -> None`
  - `list_profiles() -> List[AgentProfile]`

- [ ] **Step 1: Write tests for AgentProfile CRUD**

```python
# backend/tests/test_agent_profile_manager.py
import pytest
from agent_profile_manager import AgentProfileManager, AgentProfile, SkillProgress

@pytest.fixture
def manager(tmp_path):
    return AgentProfileManager(str(tmp_path / "profiles"))

class TestAgentProfileCRUD:
    def test_get_or_create_new(self, manager):
        """创建新 agent 档案"""
        profile = manager.get_or_create("agent-001", "Executor Alpha")
        assert profile.agent_id == "agent-001"
        assert profile.name == "Executor Alpha"
        assert profile.career_stage == "junior"
        assert profile.total_xp == 0
        assert profile.skill_progress == {}

    def test_get_or_create_existing(self, manager):
        """获取已有档案不覆盖"""
        manager.get_or_create("agent-001", "Alpha")
        profile = manager.get_or_create("agent-001", "Beta")
        assert profile.name == "Alpha"  # 不覆盖

    def test_get_profile(self, manager):
        """获取已有档案"""
        manager.get_or_create("agent-001", "Alpha")
        profile = manager.get_profile("agent-001")
        assert profile is not None
        assert profile.agent_id == "agent-001"

    def test_get_profile_nonexistent(self, manager):
        """获取不存在的档案返回 None"""
        assert manager.get_profile("nonexistent") is None

    def test_save_and_reload(self, manager, tmp_path):
        """持久化后重新加载"""
        profile = manager.get_or_create("agent-001", "Alpha")
        profile.total_xp = 500
        manager.save_profile(profile)

        # 新实例重新加载
        manager2 = AgentProfileManager(str(tmp_path / "profiles"))
        loaded = manager2.get_profile("agent-001")
        assert loaded.total_xp == 500

    def test_list_profiles(self, manager):
        """列出所有档案"""
        manager.get_or_create("agent-001", "Alpha")
        manager.get_or_create("agent-002", "Beta")
        profiles = manager.list_profiles()
        assert len(profiles) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_agent_profile_manager.py -xvs --timeout=30`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AgentProfileManager**

```python
# backend/agent_profile_manager.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_agent_profile_manager.py -xvs --timeout=30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/agent_profile_manager.py backend/tests/test_agent_profile_manager.py
git commit -m "feat(v1.4.0): AgentProfile 数据模型与持久化 — CRUD + JSON 存储"
```

---

### Task 3: XP 计算与升级系统

**Covers:** S2

**Files:**
- Modify: `backend/agent_profile_manager.py` — add `grant_xp` method
- Test: `backend/tests/test_agent_profile_manager.py`

**Interfaces:**
- Consumes: `AgentProfileManager.get_or_create()`, `AgentProfile`, `SkillProgress`
- Produces: `AgentProfileManager.grant_xp(agent_id, skill_id, task_success, review_score, task_complexity, skill_levels_config) -> Dict` — returns `{xp_gained, new_level, leveled_up, skill_id}`

- [ ] **Step 1: Write tests for XP system**

```python
# Add to backend/tests/test_agent_profile_manager.py

class TestXPSystem:
    @pytest.fixture
    def skill_config(self):
        return {"xp_thresholds": [100, 300, 600]}

    def test_grant_xp_success(self, manager, skill_config):
        """任务成功获得基础 XP + 成功奖励"""
        manager.get_or_create("a1", "Alpha")
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=7.0, task_complexity=3, skill_config=skill_config)
        assert result["xp_gained"] > 0
        assert result["skill_id"] == "backend_dev"

    def test_grant_xp_failure_gives_zero(self, manager, skill_config):
        """任务失败获得 0 XP"""
        manager.get_or_create("a1", "Alpha")
        result = manager.grant_xp("a1", "backend_dev", task_success=False,
                                   review_score=3.0, task_complexity=3, skill_config=skill_config)
        assert result["xp_gained"] == 0

    def test_level_up(self, manager, skill_config):
        """XP 超过阈值自动升级"""
        manager.get_or_create("a1", "Alpha")
        # 直接给足够 XP 升级
        profile = manager.get_profile("a1")
        profile.skill_progress["backend_dev"] = {"xp": 90, "level": 0, "task_count": 5,
                                                   "success_count": 4, "avg_review_score": 7.0, "last_used_at": ""}
        manager.save_profile(profile)
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=8.0, task_complexity=3, skill_config=skill_config)
        assert result["leveled_up"] is True
        assert result["new_level"] == 1

    def test_xp_decay_high_level_low_task(self, manager, skill_config):
        """高级 agent 做低级任务 XP 衰减"""
        manager.get_or_create("a1", "Alpha")
        profile = manager.get_profile("a1")
        # agent 已是中级 (level=2)
        profile.skill_progress["backend_dev"] = {"xp": 400, "level": 2, "task_count": 20,
                                                   "success_count": 18, "avg_review_score": 8.0, "last_used_at": ""}
        manager.save_profile(profile)
        # 做简单任务 (complexity=1 → 难度约 1)
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=8.0, task_complexity=1, skill_config=skill_config)
        # 应该有 XP 但被衰减
        assert 0 < result["xp_gained"] < 30  # 正常应该是 ~25，衰减后更少

    def test_review_bonus(self, manager, skill_config):
        """高审查评分获得额外 XP"""
        manager.get_or_create("a1", "Alpha")
        result_low = manager.grant_xp("a1", "backend_dev", task_success=True,
                                       review_score=5.0, task_complexity=3, skill_config=skill_config)
        # 新 agent 做同样任务
        manager.get_or_create("a2", "Beta")
        result_high = manager.grant_xp("a2", "backend_dev", task_success=True,
                                        review_score=9.0, task_complexity=3, skill_config=skill_config)
        assert result_high["xp_gained"] > result_low["xp_gained"]

    def test_first_use_bonus(self, manager, skill_config):
        """首次使用技能获得额外 XP"""
        manager.get_or_create("a1", "Alpha")
        result = manager.grant_xp("a1", "backend_dev", task_success=True,
                                   review_score=7.0, task_complexity=3, skill_config=skill_config)
        assert result["xp_gained"] >= 20  # 首次使用 +20

    def test_total_xp_accumulated(self, manager, skill_config):
        """total_xp 累加"""
        manager.get_or_create("a1", "Alpha")
        manager.grant_xp("a1", "backend_dev", task_success=True,
                          review_score=7.0, task_complexity=3, skill_config=skill_config)
        manager.grant_xp("a1", "frontend_dev", task_success=True,
                          review_score=7.0, task_complexity=2, skill_config=skill_config)
        profile = manager.get_profile("a1")
        assert profile.total_xp > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_agent_profile_manager.py::TestXPSystem -xvs --timeout=30`
Expected: FAIL — grant_xp not found

- [ ] **Step 3: Implement grant_xp method**

Add to `AgentProfileManager` class:

```python
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

    from datetime import datetime, timezone
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_agent_profile_manager.py -xvs --timeout=30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/agent_profile_manager.py backend/tests/test_agent_profile_manager.py
git commit -m "feat(v1.4.0): XP 计算与升级系统 — 成功奖励/审查加成/XP 衰减"
```

---

### Task 4: 角色晋升引擎

**Covers:** S3

**Files:**
- Create: `backend/promotion_engine.py`
- Test: `backend/tests/test_promotion_engine.py`

**Interfaces:**
- Consumes: `AgentProfileManager.get_profile()`, roles_config.yaml `promotion_requirements`
- Produces: `PromotionEngine` class with:
  - `check_promotion(profile, roles_config) -> Optional[str]` — returns target role or None
  - `apply_promotion(profile, target_role) -> AgentProfile`

- [ ] **Step 1: Write tests for promotion engine**

```python
# backend/tests/test_promotion_engine.py
import pytest
from promotion_engine import PromotionEngine
from agent_profile_manager import AgentProfile

@pytest.fixture
def engine():
    return PromotionEngine()

@pytest.fixture
def roles_config():
    return {
        "promotion_requirements": {
            "reviewer": {
                "min_mid_skills": 2,
                "required_skills": {"code_review": 1},
            },
            "coordinator": {
                "min_mid_skills": 3,
                "required_skills": {"task_decomposition": 1},
            },
            "planner": {
                "min_senior_skills": 2,
                "required_skills": {"architecture": 2},
            },
        }
    }

class TestPromotionEngine:
    def test_no_promotion_junior(self, engine, roles_config):
        """初级 agent 无晋升"""
        profile = AgentProfile(agent_id="a1", name="Alpha", career_stage="junior")
        assert engine.check_promotion(profile, roles_config) is None

    def test_promote_to_reviewer(self, engine, roles_config):
        """满足 Reviewer 条件"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior",
            skill_progress={
                "backend_dev": {"level": 2, "xp": 300},
                "frontend_dev": {"level": 2, "xp": 300},
                "code_review": {"level": 1, "xp": 100},
            },
        )
        assert engine.check_promotion(profile, roles_config) == "reviewer"

    def test_no_promote_missing_required_skill(self, engine, roles_config):
        """缺少必要技能不晋升"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="junior",
            skill_progress={
                "backend_dev": {"level": 2, "xp": 300},
                "frontend_dev": {"level": 2, "xp": 300},
                # 缺少 code_review
            },
        )
        assert engine.check_promotion(profile, roles_config) is None

    def test_promote_to_coordinator(self, engine, roles_config):
        """满足 Coordinator 条件"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="reviewer",
            skill_progress={
                "backend_dev": {"level": 2},
                "frontend_dev": {"level": 2},
                "testing": {"level": 2},
                "task_decomposition": {"level": 1},
            },
        )
        assert engine.check_promotion(profile, roles_config) == "coordinator"

    def test_apply_promotion(self, engine):
        """晋升更新 career_stage"""
        profile = AgentProfile(agent_id="a1", name="Alpha", career_stage="junior")
        updated = engine.apply_promotion(profile, "reviewer")
        assert updated.career_stage == "reviewer"

    def test_no_demotion(self, engine, roles_config):
        """已晋升的不会再次检查同级"""
        profile = AgentProfile(
            agent_id="a1", name="Alpha", career_stage="reviewer",
            skill_progress={
                "backend_dev": {"level": 2},
                "frontend_dev": {"level": 2},
                "code_review": {"level": 1},
            },
        )
        # 不会再次晋升为 reviewer
        result = engine.check_promotion(profile, roles_config)
        assert result != "reviewer"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_promotion_engine.py -xvs --timeout=30`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PromotionEngine**

```python
# backend/promotion_engine.py
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
        current_stage_idx = CAREER_ORDER.index(profile.career_stage) if profile.career_stage in CAREER_ORDER else 0

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
        target_stage = ROLE_TO_STAGE.get(target_role, "junior")
        profile.career_stage = target_stage
        logger.info("Agent %s promoted to %s (career_stage=%s)",
                     profile.agent_id, target_role, target_stage)
        return profile
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_promotion_engine.py -xvs --timeout=30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/promotion_engine.py backend/tests/test_promotion_engine.py
git commit -m "feat(v1.4.0): 角色晋升引擎 — 技能条件检查 + 自动晋升"
```

---

### Task 5: API 端点

**Covers:** S5

**Files:**
- Modify: `backend/server.py` — add 4 endpoints
- Test: `backend/tests/test_agent_profile_api.py`

**Interfaces:**
- Consumes: `AgentProfileManager`, `PromotionEngine`, roles_config.yaml
- Produces: 4 REST endpoints

- [ ] **Step 1: Write API tests**

```python
# backend/tests/test_agent_profile_api.py
import pytest
from httpx import AsyncClient, ASGITransport
import server

@pytest.fixture
async def client(tmp_path, monkeypatch):
    # 设置临时 profile 目录
    from agent_profile_manager import AgentProfileManager
    server._agent_profile_manager = AgentProfileManager(str(tmp_path / "profiles"))
    server.BACKEND_TOKEN = ""
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.mark.asyncio
class TestAgentProfileAPI:
    async def test_get_or_create_profile(self, client):
        resp = await client.get("/api/agents/agent-001/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["agent_id"] == "agent-001"

    async def test_get_skill_tree(self, client):
        resp = await client.get("/api/skills/tree")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "skills" in data["data"]
        # 至少有一个技能有 prerequisites
        skills = data["data"]["skills"]
        assert len(skills) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_agent_profile_api.py -xvs --timeout=30`
Expected: FAIL — 404

- [ ] **Step 3: Implement API endpoints**

Add to `server.py`:

```python
# ── Agent Profile API ──

_agent_profile_manager = None
_promotion_engine = None

def _get_agent_profile_manager():
    global _agent_profile_manager
    if _agent_profile_manager is None:
        from agent_profile_manager import AgentProfileManager
        _agent_profile_manager = AgentProfileManager(os.path.join(_DATA_DIR, "agent_profiles"))
    return _agent_profile_manager

def _get_promotion_engine():
    global _promotion_engine
    if _promotion_engine is None:
        from promotion_engine import PromotionEngine
        _promotion_engine = PromotionEngine()
    return _promotion_engine

@app.get("/api/agents/{agent_id}/profile")
async def get_agent_profile(agent_id: str):
    try:
        mgr = _get_agent_profile_manager()
        profile = mgr.get_or_create(agent_id, agent_id)
        return _ok(asdict(profile))
    except Exception as e:
        logger.exception("get_agent_profile 失败")
        return _fail(str(e))

@app.get("/api/skills/tree")
async def get_skill_tree():
    try:
        skills = _roles_config.get("skills", {})
        return _ok({"skills": skills})
    except Exception as e:
        logger.exception("get_skill_tree 失败")
        return _fail(str(e))

@app.post("/api/agents/{agent_id}/grant-xp")
async def grant_agent_xp(agent_id: str, request: Request):
    try:
        body = await request.json()
        mgr = _get_agent_profile_manager()
        profile = mgr.get_or_create(agent_id, agent_id)
        skill_id = body["skill_id"]
        skill_config = _roles_config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
        result = mgr.grant_xp(
            agent_id, skill_id,
            task_success=body.get("task_success", True),
            review_score=body.get("review_score", 5.0),
            task_complexity=body.get("task_complexity", 3),
            skill_config=skill_config,
        )
        # 检查晋升
        engine = _get_promotion_engine()
        profile = mgr.get_profile(agent_id)
        promotion = engine.check_promotion(profile, _roles_config)
        if promotion:
            engine.apply_promotion(profile, promotion)
            mgr.save_profile(profile)
            result["promoted_to"] = promotion
        return _ok(result)
    except Exception as e:
        logger.exception("grant_agent_xp 失败")
        return _fail(str(e))

@app.get("/api/agents/{agent_id}/promotion")
async def check_agent_promotion(agent_id: str):
    try:
        mgr = _get_agent_profile_manager()
        profile = mgr.get_profile(agent_id)
        if not profile:
            return _fail("agent 不存在")
        engine = _get_promotion_engine()
        target = engine.check_promotion(profile, _roles_config)
        return _ok({"can_promote_to": target, "current_stage": profile.career_stage})
    except Exception as e:
        logger.exception("check_agent_promotion 失败")
        return _fail(str(e))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_agent_profile_api.py -xvs --timeout=30`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `cd /home/test/MDH/backend && python -m pytest tests/ --timeout=60 --ignore=tests/legacy -x -q`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/tests/test_agent_profile_api.py
git commit -m "feat(v1.4.0): Agent Profile API — profile/skills-tree/grant-xp/promotion"
```

---

### Task 6: 集成到任务流程 — 任务完成后自动 grant-xp

**Covers:** S2, S3

**Files:**
- Modify: `backend/meeting_coordinator.py` — add `_grant_task_xp` call after `_run_dev_loop`
- Test: `backend/tests/test_meeting_coordinator_router.py`

**Interfaces:**
- Consumes: `AgentProfileManager.grant_xp()`, `PromotionEngine.check_promotion()`
- Produces: 晋升通知消息

- [ ] **Step 1: Write integration test**

```python
# Add to backend/tests/test_meeting_coordinator_router.py

class TestGrantTaskXP:
    def test_grant_xp_after_task(self, coordinator, tmp_path, monkeypatch):
        """任务完成后自动授予 XP"""
        from agent_profile_manager import AgentProfileManager
        monkeypatch.setattr(coordinator, "_agent_profile_manager",
                            AgentProfileManager(str(tmp_path / "profiles")))
        # 模拟任务完成
        task = coordinator.meeting.add_task("agent-executor", "测试任务")
        coordinator.meeting.update_task_status(task.id, "completed")
        # grant-xp 应该被调用
        result = coordinator._grant_task_xp("agent-executor", "backend_dev",
                                             task_success=True, review_score=8.0, task_complexity=3)
        assert result["xp_gained"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/test/MDH/backend && python -m pytest tests/test_meeting_coordinator_router.py::TestGrantTaskXP -xvs --timeout=30`
Expected: FAIL — _grant_task_xp not found

- [ ] **Step 3: Implement _grant_task_xp in MeetingCoordinator**

Add to `MeetingCoordinator` class:

```python
def _grant_task_xp(self, agent_id, skill_id, task_success, review_score, task_complexity):
    """任务完成后授予 XP"""
    try:
        from agent_profile_manager import AgentProfileManager
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        profile = mgr.get_or_create(agent_id, agent_id)
        skill_config = self._roles_config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
        result = mgr.grant_xp(agent_id, skill_id, task_success, review_score, task_complexity, skill_config)
        if result["leveled_up"]:
            self.logger.info("Agent %s 技能 %s 升级到 Lv.%d", agent_id, skill_id, result["new_level"])
        return result
    except Exception as e:
        self.logger.debug("grant-xp 跳过: %s", e)
        return {"xp_gained": 0}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/backend && python -m pytest tests/ --timeout=60 --ignore=tests/legacy -x -q`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/meeting_coordinator.py backend/tests/test_meeting_coordinator_router.py
git commit -m "feat(v1.4.0): 集成 grant-xp — 任务完成后自动授予 XP"
```
