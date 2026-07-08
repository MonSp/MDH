# Hierarchy Chain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the 6-layer hierarchy (CEO → Project → Team → RoleAgent → SkillPack → Toolkit) with clear interfaces, ownership, and invocation chains, supporting decentralized agent scheduling.

**Architecture:** Interface-first incremental refactoring. New `Team` abstraction wraps `MeetingCoordinator` as internal component. Skills decoupled from `roles_config.yaml` into independent `skill_packs/` directory. Single data source via API endpoints.

**Tech Stack:** Python 3.11, FastAPI, pytest, YAML, TypeScript (Orchestrator)

## Global Constraints

- All Python tests must pass: `cd backend && python -m pytest tests/ -v`
- All TypeScript tests must pass: `cd orchestrator && npx vitest run`
- Follow existing code patterns (dataclass-based models, pytest fixtures)
- No breaking changes to WebSocket protocol messages
- `roles_config.yaml` remains the single source of truth for role definitions

---

### Task 1: Team Data Types

**Covers:** S3 (Layer 3 interfaces)

**Files:**
- Create: `backend/team.py`
- Test: `backend/tests/test_team.py`

**Interfaces:**
- Produces: `Team`, `TeamRuntime`, `TeamStatus`, `RuntimeType`, `AgentLocation` dataclasses

- [ ] **Step 1: Write failing tests for Team data types**

```python
# backend/tests/test_team.py
import pytest
from team import (
    Team, TeamRuntime, TeamStatus, RuntimeType, AgentLocation,
    TeamMember,
)


def test_team_runtime_create_local(tmp_path):
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path=str(tmp_path / "workspace"),
    )
    assert runtime.runtime_id == "rt-1"
    assert runtime.runtime_type == RuntimeType.LOCAL_DOCKER


def test_team_create():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(
        team_id="team-1",
        project_id="proj-1",
        runtime=runtime,
    )
    assert team.team_id == "team-1"
    assert team.project_id == "proj-1"
    assert team.runtime == runtime
    assert team.members == []
    assert team.leader is None
    assert team.status == TeamStatus.CREATED


def test_team_add_member():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    member = TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    )
    team.add_member(member)
    assert len(team.members) == 1
    assert team.members[0].agent_id == "agent-executor"


def test_team_set_leader():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    leader = TeamMember(
        agent_id="agent-coordinator",
        role_name="coordinator",
        team_role="Coordinator",
        location=AgentLocation.LOCAL,
    )
    member = TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    )
    team.add_member(leader)
    team.add_member(member)
    team.set_leader("agent-coordinator")
    assert team.leader.agent_id == "agent-coordinator"


def test_team_status_transitions():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    assert team.status == TeamStatus.CREATED

    team.set_status(TeamStatus.RUNNING)
    assert team.status == TeamStatus.RUNNING

    team.set_status(TeamStatus.COMPLETED)
    assert team.status == TeamStatus.COMPLETED


def test_team_get_member_by_role():
    runtime = TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = Team(team_id="team-1", project_id="proj-1", runtime=runtime)
    team.add_member(TeamMember(
        agent_id="agent-coordinator",
        role_name="coordinator",
        team_role="Coordinator",
        location=AgentLocation.LOCAL,
    ))
    team.add_member(TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    ))

    coord = team.get_member_by_team_role("Coordinator")
    assert coord is not None
    assert coord.agent_id == "agent-coordinator"

    executor = team.get_member_by_team_role("Executor")
    assert executor is not None
    assert executor.agent_id == "agent-executor"

    assert team.get_member_by_team_role("Reviewer") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_team.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'team'"

- [ ] **Step 3: Implement Team data types**

```python
# backend/team.py
"""Team — 团队抽象层

管理一组共享运行环境的RoleAgent实例。
Team内部通过Meeting进行讨论和协调。
"""

import enum
from dataclasses import dataclass, field
from typing import Optional


class RuntimeType(enum.Enum):
    LOCAL_DOCKER = "local_docker"
    REMOTE_POD = "remote_pod"


class AgentLocation(enum.Enum):
    LOCAL = "local"
    REMOTE = "remote"


class TeamStatus(enum.Enum):
    CREATED = "created"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    DISSOLVED = "dissolved"


@dataclass
class TeamRuntime:
    """Team共享的运行环境"""
    runtime_id: str
    runtime_type: RuntimeType
    root_path: str
    network_config: dict = field(default_factory=dict)


@dataclass
class TeamMember:
    """Team成员（RoleAgent在Team中的表示）"""
    agent_id: str
    role_name: str
    team_role: str  # Coordinator | Planner | Executor | Reviewer | Monitor
    location: AgentLocation
    skill_pack_id: str = ""
    status: str = "idle"


@dataclass
class Team:
    """团队实例，管理一组共享Runtime的RoleAgent"""
    team_id: str
    project_id: str
    runtime: TeamRuntime
    members: list = field(default_factory=list)  # list[TeamMember]
    leader: Optional[object] = field(default=None, repr=False)
    status: TeamStatus = TeamStatus.CREATED

    def add_member(self, member: TeamMember) -> None:
        self.members.append(member)

    def set_leader(self, agent_id: str) -> None:
        for m in self.members:
            if m.agent_id == agent_id:
                self.leader = m
                return
        raise ValueError(f"成员不存在: {agent_id}")

    def set_status(self, status: TeamStatus) -> None:
        self.status = status

    def get_member_by_team_role(self, team_role: str) -> Optional[TeamMember]:
        for m in self.members:
            if m.team_role == team_role:
                return m
        return None

    def get_member_by_id(self, agent_id: str) -> Optional[TeamMember]:
        for m in self.members:
            if m.agent_id == agent_id:
                return m
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_team.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add team.py tests/test_team.py
git commit -m "feat: add Team data types (Team, TeamRuntime, TeamMember)"
```

---

### Task 2: TeamAssembler

**Covers:** S3 (ITeamAssembler), S4 (ownership chain)

**Files:**
- Create: `backend/team_assembler.py`
- Test: `backend/tests/test_team_assembler.py`

**Interfaces:**
- Consumes: `Team`, `TeamRuntime`, `TeamMember`, `AgentLocation` from Task 1
- Consumes: `RoleConfig` from `roles_config.yaml` (via `agent_toolset.load_roles_config`)
- Produces: `TeamAssembler.assemble_from_dag(dag, project_id, runtime) -> Team`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_team_assembler.py
import pytest
import yaml
from team import TeamRuntime, RuntimeType, TeamStatus
from team_assembler import TeamAssembler


@pytest.fixture
def runtime():
    return TeamRuntime(
        runtime_id="rt-1",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )


@pytest.fixture
def roles_config(tmp_path):
    config = {
        "base_roles": {
            "coordinator": {
                "name": "产品经理",
                "team_role": "Coordinator",
                "tools": ["read_file", "list_directory", "git_status"],
                "dangerous_tools": [],
                "skills": ["task_decomposition"],
                "prompt_template": "coordinator",
            },
            "executor": {
                "name": "全栈开发工程师",
                "team_role": "Executor",
                "tools": ["read_file", "write_file", "edit_file", "bash"],
                "dangerous_tools": ["bash"],
                "skills": ["frontend_dev", "backend_dev"],
                "prompt_template": "executor",
            },
            "reviewer": {
                "name": "QA工程师",
                "team_role": "Reviewer",
                "tools": ["read_file", "bash", "run_tests"],
                "dangerous_tools": ["bash"],
                "skills": ["testing", "code_review"],
                "prompt_template": "reviewer",
            },
        }
    }
    config_path = tmp_path / "roles_config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(config, f)
    return str(config_path)


def test_assemble_creates_team(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            }
        ]
    }
    team = assembler.assemble_from_dag(dag, "proj-1", runtime)

    assert team.team_id.startswith("team-")
    assert team.project_id == "proj-1"
    assert team.runtime == runtime
    assert team.status == TeamStatus.CREATED
    assert len(team.members) >= 1  # At least executor


def test_assemble_assigns_leader(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            }
        ]
    }
    team = assembler.assemble_from_dag(dag, "proj-1", runtime)

    assert team.leader is not None
    assert team.leader.team_role == "Coordinator"


def test_assemble_multiple_tasks(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            },
            {
                "task_id": "task-2",
                "name": "后端开发",
                "required_skills": ["backend_dev"],
                "description": "开发API",
            },
        ]
    }
    team = assembler.assemble_from_dag(dag, "proj-1", runtime)

    # Should have coordinator + executor(s) + reviewer
    team_roles = {m.team_role for m in team.members}
    assert "Coordinator" in team_roles
    assert "Executor" in team_roles
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_team_assembler.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'team_assembler'"

- [ ] **Step 3: Implement TeamAssembler**

```python
# backend/team_assembler.py
"""TeamAssembler — 从DAG组装Team实例

根据任务依赖图，选择合适的角色，组装Team。
"""

import logging
import uuid
from typing import Optional

from team import Team, TeamMember, TeamRuntime, AgentLocation, TeamStatus

logger = logging.getLogger(__name__)

# team_role → 用于匹配DAG任务的角色类型
SKILL_TO_TEAM_ROLE = {
    # 开发类技能 → Executor
    "frontend_dev": "Executor",
    "backend_dev": "Executor",
    "fullstack_dev": "Executor",
    "database": "Executor",
    "api_design": "Executor",
    # 审查类技能 → Reviewer
    "testing": "Reviewer",
    "code_review": "Reviewer",
    "security_audit": "Reviewer",
    # 规划类技能 → Planner
    "architecture": "Planner",
    "task_decomposition": "Planner",
    # 协调类技能 → Coordinator
    "progress_tracking": "Coordinator",
    "risk_management": "Coordinator",
}


class TeamAssembler:
    """从DAG和角色配置组装Team实例"""

    def __init__(self, roles_config_path: Optional[str] = None):
        from agent_toolset import load_roles_config
        self._config = load_roles_config(roles_config_path)
        self._base_roles = self._config.get("base_roles", {})
        self._custom_roles = self._config.get("custom_roles", {})

    def _resolve_role(self, role_name: str) -> dict:
        """解析角色配置，支持自定义角色继承"""
        if role_name in self._custom_roles:
            custom = self._custom_roles[role_name]
            base_name = custom.get("base_role", "")
            base = self._base_roles.get(base_name, {})
            merged = {**base, **custom}
            return merged
        return self._base_roles.get(role_name, {})

    def _select_roles_for_dag(self, dag: dict) -> list[tuple[str, str]]:
        """根据DAG选择需要的角色，返回 (role_name, team_role) 列表"""
        tasks = dag.get("tasks", [])
        needed_team_roles = set()
        selected_roles = []

        # 始终需要Coordinator
        needed_team_roles.add("Coordinator")

        # 根据任务技能确定需要的team_role
        for task in tasks:
            for skill in task.get("required_skills", []):
                team_role = SKILL_TO_TEAM_ROLE.get(skill, "Executor")
                needed_team_roles.add(team_role)

        # 始终需要Reviewer（如果任务涉及代码）
        if any("dev" in s for t in tasks for s in t.get("required_skills", [])):
            needed_team_roles.add("Reviewer")

        # 匹配具体角色
        for role_name, role_config in self._base_roles.items():
            team_role = role_config.get("team_role", "")
            if team_role in needed_team_roles:
                selected_roles.append((role_name, team_role))
                needed_team_roles.discard(team_role)

        return selected_roles

    def assemble_from_dag(self, dag: dict, project_id: str, runtime: TeamRuntime) -> Team:
        """从DAG组装Team实例"""
        team_id = f"team-{uuid.uuid4().hex[:8]}"
        team = Team(
            team_id=team_id,
            project_id=project_id,
            runtime=runtime,
        )

        selected_roles = self._select_roles_for_dag(dag)

        for role_name, team_role in selected_roles:
            agent_id = f"agent-{role_name}-{uuid.uuid4().hex[:6]}"
            role_config = self._resolve_role(role_name)

            member = TeamMember(
                agent_id=agent_id,
                role_name=role_name,
                team_role=team_role,
                location=AgentLocation.LOCAL,
                skill_pack_id=role_config.get("skills", [""])[0] if role_config.get("skills") else "",
            )
            team.add_member(member)

            if team_role == "Coordinator" and team.leader is None:
                team.set_leader(agent_id)

        logger.info("Team %s 组装完成，共 %d 个成员", team_id, len(team.members))
        return team
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_team_assembler.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add team_assembler.py tests/test_team_assembler.py
git commit -m "feat: add TeamAssembler for DAG-based team assembly"
```

---

### Task 3: Skill Pack Directory Structure

**Covers:** S5 (Skill Pack independence)

**Files:**
- Create: `skill_packs/` directory with 5 initial skill packs
- Test: `backend/tests/test_skill_packs_structure.py`

**Interfaces:**
- Produces: `skill_packs/{name}/manifest.yaml` structure for each skill

- [ ] **Step 1: Write failing tests for skill pack structure**

```python
# backend/tests/test_skill_packs_structure.py
import os
import pytest
import yaml

SKILL_PACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "skill_packs")

REQUIRED_MANIFEST_FIELDS = {"name", "version", "description", "category"}


def _get_skill_dirs():
    """获取所有技能包目录"""
    if not os.path.isdir(SKILL_PACKS_DIR):
        return []
    return [
        d for d in os.listdir(SKILL_PACKS_DIR)
        if os.path.isdir(os.path.join(SKILL_PACKS_DIR, d))
    ]


def test_skill_packs_dir_exists():
    assert os.path.isdir(SKILL_PACKS_DIR), f"skill_packs/ 目录不存在: {SKILL_PACKS_DIR}"


def test_each_skill_has_manifest():
    for skill_dir in _get_skill_dirs():
        manifest_path = os.path.join(SKILL_PACKS_DIR, skill_dir, "manifest.yaml")
        assert os.path.isfile(manifest_path), f"{skill_dir} 缺少 manifest.yaml"


def test_manifest_has_required_fields():
    for skill_dir in _get_skill_dirs():
        manifest_path = os.path.join(SKILL_PACKS_DIR, skill_dir, "manifest.yaml")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = yaml.safe_load(f)
        missing = REQUIRED_MANIFEST_FIELDS - set(manifest.keys())
        assert not missing, f"{skill_dir} manifest 缺少字段: {missing}"


def test_each_skill_has_system_prompt():
    for skill_dir in _get_skill_dirs():
        prompt_path = os.path.join(SKILL_PACKS_DIR, skill_dir, "system_prompt.md")
        assert os.path.isfile(prompt_path), f"{skill_dir} 缺少 system_prompt.md"


def test_at_least_5_skills():
    skills = _get_skill_dirs()
    assert len(skills) >= 5, f"技能包数量不足: {len(skills)} (需要至少5个)"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_skill_packs_structure.py -v`
Expected: FAIL with "skill_packs/ 目录不存在"

- [ ] **Step 3: Create skill pack directories**

Create `skill_packs/` at project root with these 5 initial packs:

```
skill_packs/
├── frontend_dev/
│   ├── manifest.yaml
│   ├── system_prompt.md
│   ├── knowledge/
│   ├── rules/
│   └── examples/
├── backend_dev/
│   ├── manifest.yaml
│   ├── system_prompt.md
│   ├── knowledge/
│   ├── rules/
│   └── examples/
├── code_review/
│   ├── manifest.yaml
│   ├── system_prompt.md
│   ├── knowledge/
│   ├── rules/
│   └── examples/
├── task_decomposition/
│   ├── manifest.yaml
│   ├── system_prompt.md
│   ├── knowledge/
│   ├── rules/
│   └── examples/
└── testing/
    ├── manifest.yaml
    ├── system_prompt.md
    ├── knowledge/
    ├── rules/
    └── examples/
```

For each skill pack, `manifest.yaml` must contain:
```yaml
name: <skill_name>
version: "1.0.0"
description: <从roles_config.yaml skills部分迁移>
category: <从roles_config.yaml skills部分迁移>
required_tools: <从roles_config.yaml skills部分迁移>
methodology: <从roles_config.yaml skills部分迁移>
```

`system_prompt.md` must contain the skill-specific system prompt content.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_skill_packs_structure.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add skill_packs/
git commit -m "feat: create skill_packs directory with 5 initial skill packages"
```

---

### Task 4: Decouple Skills from roles_config.yaml

**Covers:** S5 (Skill Pack independence)

**Files:**
- Modify: `backend/roles_config.yaml` (remove inline skill definitions)
- Modify: `mock-sso/roles_config.yaml` (keep in sync)

**Interfaces:**
- Changes: `roles_config.yaml` `skills:` section becomes name-only references

- [ ] **Step 1: Extract current skill definitions**

Read `backend/roles_config.yaml` `skills:` section. Each skill has: category, description, methodology, practices, required_tools, workflow. These move to `skill_packs/{name}/manifest.yaml`.

- [ ] **Step 2: Update roles_config.yaml**

Replace the inline `skills:` dictionary with a minimal reference list:

```yaml
skills:
  # Skills are now defined in skill_packs/ directory.
  # This section only lists available skill names for validation.
  frontend_dev:
    description: "前端开发技能包"
  backend_dev:
    description: "后端开发技能包"
  code_review:
    description: "代码审查技能包"
  # ... (name + one-line description only)
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd backend && python -m pytest tests/test_agent_toolset.py tests/test_skill_registry.py -v`
Expected: PASS (tests should not depend on inline skill details)

- [ ] **Step 4: Commit**

```bash
git add backend/roles_config.yaml mock-sso/roles_config.yaml
git commit -m "refactor: decouple skill definitions from roles_config.yaml"
```

---

### Task 5: Update SkillRegistry to Scan skill_packs/

**Covers:** S5 (ISkillRegistry)

**Files:**
- Modify: `backend/skill_registry.py`
- Test: `backend/tests/test_skill_registry.py`

**Interfaces:**
- Changes: `SkillRegistry.__init__` scans `skill_packs/` in addition to `base_dir`
- Produces: `SkillRegistry.load_from_skill_packs(skill_packs_dir)`

- [ ] **Step 1: Write failing test**

```python
# Add to backend/tests/test_skill_registry.py

def test_load_from_skill_packs(tmp_path):
    """Test loading skills from skill_packs/ directory"""
    # Create a skill_packs structure
    skill_dir = tmp_path / "skill_packs" / "test_skill"
    skill_dir.mkdir(parents=True)
    manifest = {
        "name": "test_skill",
        "version": "1.0.0",
        "description": "测试技能",
        "category": "testing",
        "required_tools": ["read_file"],
    }
    (skill_dir / "manifest.yaml").write_text(
        yaml.dump(manifest, allow_unicode=True), encoding="utf-8"
    )
    (skill_dir / "system_prompt.md").write_text("# Test prompt", encoding="utf-8")

    registry = SkillRegistry(str(tmp_path / "base"))
    registry.load_from_skill_packs(str(tmp_path / "skill_packs"))

    skills = registry.list_skills()
    assert any(s["name"] == "test_skill" for s in skills)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_skill_registry.py::test_load_from_skill_packs -v`
Expected: FAIL with "AttributeError: 'SkillRegistry' object has no attribute 'load_from_skill_packs'"

- [ ] **Step 3: Implement load_from_skill_packs**

```python
# Add to backend/skill_registry.py — SkillRegistry class

def load_from_skill_packs(self, skill_packs_dir: str) -> None:
    """从 skill_packs/ 目录加载技能包

    Args:
        skill_packs_dir: skill_packs 目录路径
    """
    packs_path = Path(skill_packs_dir)
    if not packs_path.is_dir():
        logger.warning("skill_packs 目录不存在: %s", skill_packs_dir)
        return

    for entry in packs_path.iterdir():
        if not entry.is_dir():
            continue
        manifest_path = entry / "manifest.yaml"
        if not manifest_path.exists():
            continue

        try:
            manifest = self._read_manifest(manifest_path)
            skill_id = manifest.get("name", entry.name)

            # Skip if already registered
            if skill_id in self._registry:
                logger.debug("技能包已注册，跳过: %s", skill_id)
                continue

            pkg = SkillPackage(
                skill_id=skill_id,
                name=manifest.get("name", entry.name),
                version=manifest.get("version", "1.0.0"),
                description=manifest.get("description", ""),
                base_path=str(entry),
                manifest=manifest,
                created_at="",
                required_env=manifest.get("required_env", []),
                dependencies=manifest.get("dependencies", []),
            )
            self._registry[skill_id] = pkg
            logger.info("从 skill_packs 加载技能包: %s", skill_id)
        except Exception as e:
            logger.warning("跳过无效技能包 %s: %s", entry.name, e)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_skill_registry.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add skill_registry.py tests/test_skill_registry.py
git commit -m "feat: SkillRegistry.load_from_skill_packs() for skill_packs/ directory"
```

---

### Task 6: API Endpoints for Roles/Skills/Tools

**Covers:** S6 (Unified data source)

**Files:**
- Create: `backend/api_config.py`
- Modify: `backend/server.py`
- Test: `backend/tests/test_api_config.py`

**Interfaces:**
- Produces: `GET /api/roles`, `GET /api/skills`, `GET /api/tools`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_api_config.py
import pytest
import yaml
from fastapi.testclient import TestClient


@pytest.fixture
def app_with_config(tmp_path):
    """Create a minimal FastAPI app with config endpoints"""
    config = {
        "base_roles": {
            "executor": {
                "name": "开发工程师",
                "team_role": "Executor",
                "tools": ["read_file", "write_file"],
                "skills": ["frontend_dev"],
            }
        },
        "skills": {
            "frontend_dev": {"description": "前端开发"}
        },
    }
    config_path = tmp_path / "roles_config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(config, f)

    from fastapi import FastAPI
    from api_config import create_config_router
    app = FastAPI()
    app.include_router(create_config_router(str(config_path)))
    return app


def test_get_roles(app_with_config):
    client = TestClient(app_with_config)
    resp = client.get("/api/roles")
    assert resp.status_code == 200
    data = resp.json()
    assert "executor" in data


def test_get_single_role(app_with_config):
    client = TestClient(app_with_config)
    resp = client.get("/api/roles/executor")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "开发工程师"


def test_get_role_not_found(app_with_config):
    client = TestClient(app_with_config)
    resp = client.get("/api/roles/nonexistent")
    assert resp.status_code == 404


def test_get_skills(app_with_config):
    client = TestClient(app_with_config)
    resp = client.get("/api/skills")
    assert resp.status_code == 200
    data = resp.json()
    assert "frontend_dev" in data


def test_get_tools():
    """Tools are static, test the endpoint exists"""
    from api_config import get_builtin_tools
    tools = get_builtin_tools()
    assert len(tools) > 0
    assert any(t["name"] == "read_file" for t in tools)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_api_config.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'api_config'"

- [ ] **Step 3: Implement API config router**

```python
# backend/api_config.py
"""API Config Endpoints — 统一数据源

提供 /api/roles, /api/skills, /api/tools 端点，
让 Orchestrator 通过 HTTP 获取配置，消除双重定义。
"""

import os
from fastapi import APIRouter, HTTPException
import yaml


def _load_config(config_path: str) -> dict:
    if not os.path.exists(config_path):
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_builtin_tools() -> list[dict]:
    """返回内置工具定义列表"""
    return [
        {"name": "read_file", "category": "file", "description": "读取文件内容"},
        {"name": "write_file", "category": "file", "description": "写入文件内容"},
        {"name": "edit_file", "category": "file", "description": "编辑文件"},
        {"name": "list_directory", "category": "file", "description": "列出目录内容"},
        {"name": "bash", "category": "shell", "description": "执行shell命令", "dangerous": True},
        {"name": "git_status", "category": "git", "description": "查看git状态"},
        {"name": "git_commit", "category": "git", "description": "提交git变更"},
        {"name": "git_push", "category": "git", "description": "推送到远程仓库", "dangerous": True},
        {"name": "git_branch", "category": "git", "description": "创建/切换分支"},
        {"name": "git_diff", "category": "git", "description": "查看代码差异"},
        {"name": "git_log", "category": "git", "description": "查看提交历史"},
        {"name": "search_files", "category": "search", "description": "按模式搜索文件"},
        {"name": "grep_content", "category": "search", "description": "搜索文件内容"},
        {"name": "run_tests", "category": "test", "description": "运行测试套件", "dangerous": True},
        {"name": "run_linter", "category": "test", "description": "运行代码质量检查"},
        {"name": "create_document", "category": "document", "description": "创建文档"},
        {"name": "edit_document", "category": "document", "description": "编辑文档"},
        {"name": "web_fetch", "category": "web", "description": "获取网页内容"},
    ]


def create_config_router(config_path: str) -> APIRouter:
    router = APIRouter(prefix="/api")
    _config = _load_config(config_path)

    @router.get("/roles")
    def get_roles():
        base_roles = _config.get("base_roles", {})
        custom_roles = _config.get("custom_roles", {})
        return {**base_roles, **custom_roles}

    @router.get("/roles/{role_name}")
    def get_role(role_name: str):
        base_roles = _config.get("base_roles", {})
        custom_roles = _config.get("custom_roles", {})
        all_roles = {**base_roles, **custom_roles}
        if role_name not in all_roles:
            raise HTTPException(status_code=404, detail=f"角色不存在: {role_name}")
        return all_roles[role_name]

    @router.get("/skills")
    def get_skills():
        return _config.get("skills", {})

    @router.get("/tools")
    def get_tools():
        return get_builtin_tools()

    return router
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_config.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add api_config.py tests/test_api_config.py
git commit -m "feat: add /api/roles, /api/skills, /api/tools endpoints"
```

---

### Task 7: Wire Team into ProjectManager

**Covers:** S4 (Ownership chain), S3 (IProjectManager)

**Files:**
- Modify: `backend/project_manager.py`
- Modify: `backend/tests/test_project_manager.py`

**Interfaces:**
- Changes: `ProjectManager.instantiate_project` returns `Team` instead of `list[EmployeeInstance]`
- Consumes: `Team`, `TeamRuntime`, `RuntimeType` from Task 1
- Consumes: `TeamAssembler` from Task 2

- [ ] **Step 1: Write failing test**

```python
# Add to backend/tests/test_project_manager.py

def test_instantiate_project_returns_team(registry, tmp_path):
    """instantiate_project should return a Team instance"""
    from team import Team, TeamStatus

    pm = ProjectManager(
        projects_dir=str(tmp_path / "projects"),
        skill_registry=registry[0],
    )
    project = pm.create_project("test-project", {"source": "test"})

    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": [list(registry[1].values())[0]],
                "description": "开发前端",
            }
        ]
    }

    team = pm.instantiate_project(project.project_id, dag)
    assert isinstance(team, Team)
    assert team.project_id == project.project_id
    assert team.status == TeamStatus.CREATED
    assert len(team.members) >= 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_project_manager.py::test_instantiate_project_returns_team -v`
Expected: FAIL (current implementation returns list, not Team)

- [ ] **Step 3: Update instantiate_project**

Add import and modify `instantiate_project` in `project_manager.py`:

```python
# At top of project_manager.py, add:
from team import Team, TeamRuntime, RuntimeType
from team_assembler import TeamAssembler

# Replace instantiate_project method:
def instantiate_project(self, project_id: str, dag: dict) -> Team:
    """根据 DAG 实例化项目，返回 Team 实例。

    Args:
        project_id: 项目 ID。
        dag: 任务依赖图。

    Returns:
        组装好的 Team 实例。
    """
    project = self._get_or_raise(project_id)

    tasks = dag.get("tasks")
    if not isinstance(tasks, list):
        raise ValueError("DAG 格式不合法: 'tasks' 应为列表")

    project.status = PROJECT_STATUS_INSTANTIATING
    project.dag = dag
    self._save_project(project)

    # Create TeamRuntime
    project_dir = self._get_project_dir(project_id)
    runtime = TeamRuntime(
        runtime_id=f"rt-{project_id[:8]}",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path=str(project_dir),
    )

    # Use TeamAssembler to create Team
    assembler = TeamAssembler()
    team = assembler.assemble_from_dag(dag, project_id, runtime)

    # Clone skill packs for each member
    employees_dir = project_dir / "employees"
    for member in team.members:
        if member.skill_pack_id:
            employee_dir = employees_dir / member.agent_id
            try:
                self._skill_registry.clone(member.skill_pack_id, str(employee_dir / "skill"))
            except KeyError:
                logger.warning("技能包不存在: %s", member.skill_pack_id)

    project.status = PROJECT_STATUS_RUNNING
    self._save_project(project)

    logger.info("项目 %s 实例化完成，Team %s，共 %d 个成员",
                project_id, team.team_id, len(team.members))
    return team
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_project_manager.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add project_manager.py tests/test_project_manager.py
git commit -m "refactor: ProjectManager.instantiate_project returns Team"
```

---

### Task 8: Wire Team into CeoAgent

**Covers:** S4 (Ownership chain), S3 (ICeoAgent)

**Files:**
- Modify: `backend/ceo_agent.py`

**Interfaces:**
- Changes: `_execute_complex` creates Team via ProjectManager
- Consumes: `Team` from Task 1, updated `ProjectManager.instantiate_project` from Task 7

- [ ] **Step 1: Update _execute_complex to use Team**

In `ceo_agent.py`, after the workspace creation section, update the team assembly:

```python
# In _execute_complex, after workspace creation, replace the meeting/team creation section:

# ③ Create Team via ProjectManager
dag = {
    "tasks": [{
        "task_id": task_id,
        "name": content[:50],
        "required_skills": selected_skills if selected_roles else ["fullstack_dev"],
        "description": content[:200],
    }]
}

team = self._project_manager.instantiate_project(project.project_id, dag)
await self._emit(send_message, f"CEO：团队已组建（{team.team_id}），共 {len(team.members)} 名成员。")

# ④ Create meeting within Team context
meeting_id = str(uuid.uuid4())[:8]
meeting = MeetingSession(meeting_id)
meeting.start(team_template=team_to_meeting_template(team))
self._session.meeting_session = meeting
self._session.meeting_mode = True

# ⑤ Start coordinator with Team
coordinator = MeetingCoordinator(
    meeting_session=meeting,
    provider=self._session.provider,
    model_name=self._session.model_name or "",
    api_key=self._session.api_key,
    base_url=self._session.base_url or "",
    workspace=workspace,
)
```

Add helper function:

```python
def team_to_meeting_template(team) -> list:
    """Convert Team members to meeting template format"""
    template = []
    for member in team.members:
        template.append({
            "id": member.agent_id,
            "name": member.role_name,
            "role": member.team_role,
        })
    return template
```

- [ ] **Step 2: Run existing tests**

Run: `cd backend && python -m pytest tests/test_meeting.py tests/test_meeting_coordinator_router.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd backend && git add ceo_agent.py
git commit -m "refactor: CeoAgent uses Team abstraction for team assembly"
```

---

### Task 9: Remove Orchestrator roles.json, Use API

**Covers:** S6 (Unified data source)

**Files:**
- Modify: `orchestrator/src/team/templates.ts`
- Delete: `orchestrator/templates/roles.json`

**Interfaces:**
- Changes: `templates.ts` fetches roles from HTTP API instead of local JSON

- [ ] **Step 1: Update templates.ts to fetch from API**

```typescript
// orchestrator/src/team/templates.ts — replace local JSON loading

let _cachedRoles: Record<string, any> | null = null;

export async function loadRoles(apiBaseUrl: string = 'http://localhost:8000'): Promise<Record<string, any>> {
  if (_cachedRoles) return _cachedRoles;

  try {
    const resp = await fetch(`${apiBaseUrl}/api/roles`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    _cachedRoles = await resp.json();
    return _cachedRoles!;
  } catch (e) {
    console.warn('Failed to fetch roles from API, falling back to local:', e);
    // Fallback to local JSON for development
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const localPath = join(__dirname, '../../templates/roles.json');
    _cachedRoles = JSON.parse(readFileSync(localPath, 'utf-8'));
    return _cachedRoles!;
  }
}

export function getTemplate(roleName: string): any {
  if (!_cachedRoles) throw new Error('Roles not loaded. Call loadRoles() first.');
  return _cachedRoles.base_roles?.[roleName] || _cachedRoles.custom_roles?.[roleName];
}
```

- [ ] **Step 2: Update coordinator.ts to call loadRoles at startup**

```typescript
// In coordinator.ts, add at top of process_user_message or __init__:
import { loadRoles } from './templates.js';

// At start of process_user_message:
await loadRoles();
```

- [ ] **Step 3: Run orchestrator tests**

Run: `cd orchestrator && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add orchestrator/src/team/templates.ts orchestrator/src/team/coordinator.ts
git commit -m "refactor: Orchestrator fetches roles from API instead of local JSON"
```

---

### Task 10: Integration Test — Full Chain

**Covers:** S1-S7 (end-to-end)

**Files:**
- Create: `backend/tests/test_hierarchy_chain.py`

**Interfaces:**
- Tests: CEO → Project → Team → RoleAgent → SkillPack → Toolkit chain

- [ ] **Step 1: Write integration test**

```python
# backend/tests/test_hierarchy_chain.py
"""Integration test for the full 6-layer hierarchy chain"""
import os
import pytest
import yaml

from team import Team, TeamRuntime, RuntimeType, TeamStatus, TeamMember
from team_assembler import TeamAssembler
from skill_registry import SkillRegistry
from project_manager import ProjectManager


@pytest.fixture
def full_setup(tmp_path):
    """Set up the full hierarchy chain"""
    # Skill packs
    skill_packs_dir = tmp_path / "skill_packs"
    for skill_name in ["frontend_dev", "backend_dev", "task_decomposition", "testing"]:
        skill_dir = skill_packs_dir / skill_name
        skill_dir.mkdir(parents=True)
        (skill_dir / "manifest.yaml").write_text(yaml.dump({
            "name": skill_name,
            "version": "1.0.0",
            "description": f"{skill_name} skill",
            "category": "software_development",
            "required_tools": ["read_file", "write_file"],
        }), encoding="utf-8")
        (skill_dir / "system_prompt.md").write_text(f"# {skill_name}", encoding="utf-8")

    # Roles config
    roles_config = {
        "base_roles": {
            "coordinator": {
                "name": "产品经理",
                "team_role": "Coordinator",
                "tools": ["read_file", "list_directory"],
                "dangerous_tools": [],
                "skills": ["task_decomposition"],
                "prompt_template": "coordinator",
            },
            "executor": {
                "name": "开发工程师",
                "team_role": "Executor",
                "tools": ["read_file", "write_file", "bash"],
                "dangerous_tools": ["bash"],
                "skills": ["frontend_dev", "backend_dev"],
                "prompt_template": "executor",
            },
            "reviewer": {
                "name": "QA工程师",
                "team_role": "Reviewer",
                "tools": ["read_file", "bash", "run_tests"],
                "dangerous_tools": ["bash"],
                "skills": ["testing"],
                "prompt_template": "reviewer",
            },
        }
    }
    config_path = tmp_path / "roles_config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(roles_config, f)

    # Skill registry
    registry = SkillRegistry(str(tmp_path / "skill_base"))
    registry.load_from_skill_packs(str(skill_packs_dir))

    # Project manager
    pm = ProjectManager(
        projects_dir=str(tmp_path / "projects"),
        skill_registry=registry,
    )

    return {
        "pm": pm,
        "registry": registry,
        "config_path": str(config_path),
        "skill_packs_dir": str(skill_packs_dir),
    }


def test_full_chain_ceo_to_toolkit(full_setup):
    """Test the complete hierarchy: CEO creates Project → Team → RoleAgents with SkillPacks and Toolkits"""
    pm = full_setup["pm"]
    registry = full_setup["registry"]

    # Layer 1-2: CEO creates Project
    project = pm.create_project("测试项目", {"source": "test"})

    # Layer 2-3: Project instantiates Team
    dag = {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": ["frontend_dev"],
                "description": "开发React组件",
            },
            {
                "task_id": "task-2",
                "name": "后端开发",
                "required_skills": ["backend_dev"],
                "description": "开发API",
            },
        ]
    }
    team = pm.instantiate_project(project.project_id, dag)

    # Verify Team
    assert isinstance(team, Team)
    assert team.project_id == project.project_id
    assert team.status == TeamStatus.CREATED

    # Layer 3: Team has members
    assert len(team.members) >= 2  # At least coordinator + executor
    team_roles = {m.team_role for m in team.members}
    assert "Coordinator" in team_roles
    assert "Executor" in team_roles

    # Layer 4: Each member has skill_pack_id
    for member in team.members:
        if member.skill_pack_id:
            skill = registry.get_skill(member.skill_pack_id)
            assert skill is not None

    # Layer 5: SkillPacks are accessible
    skills = registry.list_skills()
    assert len(skills) >= 4

    # Layer 6: Toolkit is defined in role config
    from agent_toolset import load_roles_config
    config = load_roles_config(full_setup["config_path"])
    for member in team.members:
        role = config.get("base_roles", {}).get(member.role_name, {})
        assert "tools" in role
```

- [ ] **Step 2: Run integration test**

Run: `cd backend && python -m pytest tests/test_hierarchy_chain.py -v`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd backend && git add tests/test_hierarchy_chain.py
git commit -m "test: add integration test for full 6-layer hierarchy chain"
```
