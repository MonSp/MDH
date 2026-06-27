# Agent-Team Migration: MDH Meeting System → AgentScope SubAgentTemplate

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MDH's custom MeetingCoordinator discussion engine with AgentScope v2.0.2's native agent-team system (TeamCreate + AgentCreate + TeamSay), while preserving the existing roles_config.yaml role definitions and frontend WebSocket protocol.

**Architecture:** A new `template_bridge.py` converts `roles_config.yaml` into AgentScope `SubAgentTemplate` objects. The `CeoAgent` is refactored to use AgentScope's `TeamCreate`/`AgentCreate`/`TeamSay` tools instead of the custom `DiscussionManager`/`NegotiationEngine`. The existing `MeetingCoordinator` is kept as a fallback for workflow mode. The frontend WebSocket protocol is unchanged.

**Tech Stack:** Python 3.11, AgentScope v2.0.2, FastAPI, asyncio, WebSocket

## Global Constraints

- All existing `roles_config.yaml` roles (25+ base, 20+ custom) must be available as SubAgentTemplates
- Frontend WebSocket message format (`agent_message` with `type` field) must not change
- The `ComplexityClassifier` simple/complex path selection must continue to work
- Workspace management (standalone/git_worktree) must continue to work
- The `AGENT_ROLE_PROMPTS` and `AGENT_ROLE_TOOLS` dicts in `meeting_coordinator.py` remain as reference but are no longer the primary agent creation path

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/template_bridge.py` | **Create** | Converts roles_config.yaml → SubAgentTemplate list |
| `backend/team_adapter.py` | **Create** | Bridges AgentScope team tools to MDH's WebSocket protocol |
| `backend/ceo_agent.py` | **Modify** | Use team_adapter for complex path instead of MeetingCoordinator |
| `backend/server.py` | **Modify** | Register templates at startup, wire team_adapter |
| `backend/meeting_coordinator.py` | **Modify** | Keep workflow mode, deprecate serial discussion path |
| `backend/tests/test_template_bridge.py` | **Create** | Unit tests for template conversion |
| `backend/tests/test_team_adapter.py` | **Create** | Unit tests for team adapter |

---

### Task 1: Template Bridge — Convert roles_config.yaml to SubAgentTemplate

**Covers:** Role template mapping, permission conversion, prompt formatting

**Files:**
- Create: `backend/template_bridge.py`
- Create: `backend/tests/test_template_bridge.py`

**Interfaces:**
- Consumes: `roles_config.yaml` (loaded via `load_roles_config()`)
- Produces: `list[SubAgentTemplate]` for registration with AgentScope

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_template_bridge.py
import pytest
from template_bridge import build_templates_from_config

SAMPLE_CONFIG = {
    "base_roles": {
        "executor": {
            "name": "全栈开发工程师",
            "description": "负责代码实现和功能开发",
            "prompt_template": "executor",
            "permissions": {
                "tools": ["read_file", "write_file", "bash"],
                "dangerous_tools": ["bash"],
            },
            "skills": ["frontend_dev", "backend_dev"],
            "team_role": "Executor",
        },
        "planner": {
            "name": "系统架构师",
            "description": "负责系统设计和技术选型",
            "prompt_template": "planner",
            "permissions": {
                "tools": ["read_file", "list_directory", "search_files"],
                "dangerous_tools": [],
            },
            "skills": ["architecture", "task_decomposition"],
            "team_role": "Planner",
        },
    },
    "custom_roles": {
        "frontend_specialist": {
            "base_role": "executor",
            "name": "前端开发专家",
            "description": "现代Web技术专家",
            "custom_prompt": "你是{name}，一位前端开发专家。",
            "extra_skills": ["frontend_dev"],
            "extra_tools": ["run_tests"],
        },
    },
    "prompt_templates": {
        "executor": "你是{name}，一位经验丰富的全栈开发工程师。\n\n## 职责\n- 编写高质量代码",
        "planner": "你是{name}，一位资深系统架构师。\n\n## 职责\n- 设计系统架构",
    },
}

def test_build_templates_returns_list():
    templates = build_templates_from_config(SAMPLE_CONFIG)
    assert isinstance(templates, list)
    assert len(templates) > 0

def test_base_role_becomes_template():
    templates = build_templates_from_config(SAMPLE_CONFIG)
    executor = next(t for t in templates if t.type == "executor")
    assert executor.description == "负责代码实现和功能开发"
    assert "全栈开发工程师" in executor.system_prompt_template
    assert "编写高质量代码" in executor.system_prompt_template

def test_custom_role_becomes_template():
    templates = build_templates_from_config(SAMPLE_CONFIG)
    frontend = next(t for t in templates if t.type == "frontend_specialist")
    assert frontend.description == "现代Web技术专家"
    assert "前端开发专家" in frontend.system_prompt_template

def test_permission_mapping():
    templates = build_templates_from_config(SAMPLE_CONFIG)
    executor = next(t for t in templates if t.type == "executor")
    # bash is in dangerous_tools -> should be ASK
    ctx = executor.permission_context
    assert any(r.behavior == "ask" and "bash" in r.tool_name for r in ctx.rules)

def test_leader_role_gets_team_tools():
    """Roles with team_role=Coordinator should have leader-like permissions."""
    templates = build_templates_from_config(SAMPLE_CONFIG)
    # This will be validated by the template_bridge logic
    # Coordinator/Planner roles should have extend_leader_permission_rules=True
    planner = next(t for t in templates if t.type == "planner")
    assert planner.extend_leader_permission_rules is True

def test_prompt_template_format_variables():
    """System prompt must contain {member_name} and {member_description}."""
    templates = build_templates_from_config(SAMPLE_CONFIG)
    for t in templates:
        assert "{member_name}" in t.system_prompt_template
        assert "{member_description}" in t.system_prompt_template
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/test/MDH/backend && python3 -m pytest tests/test_template_bridge.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'template_bridge'"

- [ ] **Step 3: Write implementation**

```python
# backend/template_bridge.py
"""
Converts roles_config.yaml role definitions into AgentScope SubAgentTemplate objects.

Each base_role and custom_role becomes a SubAgentTemplate that can be used
with AgentScope's TeamCreate + AgentCreate system.
"""
from typing import Any
from agentscope.app._types import SubAgentTemplate
from agentscope.permission._context import PermissionContext
from agentscope.permission._rule import PermissionRule


def build_templates_from_config(config: dict[str, Any]) -> list[SubAgentTemplate]:
    """Build SubAgentTemplate list from roles_config.yaml content."""
    templates = []

    base_roles = config.get("base_roles", {})
    custom_roles = config.get("custom_roles", {})
    prompt_templates = config.get("prompt_templates", {})

    # Build base role templates
    for role_id, role_def in base_roles.items():
        tmpl = _build_template(role_id, role_def, prompt_templates)
        templates.append(tmpl)

    # Build custom role templates (extend base roles)
    for role_id, role_def in custom_roles.items():
        tmpl = _build_custom_template(role_id, role_def, base_roles, prompt_templates)
        templates.append(tmpl)

    return templates


def _build_template(
    role_id: str,
    role_def: dict[str, Any],
    prompt_templates: dict[str, str],
) -> SubAgentTemplate:
    """Convert a single base_role to SubAgentTemplate."""
    prompt_key = role_def.get("prompt_template", "")
    prompt_body = prompt_templates.get(prompt_key, "")

    # Format the prompt with AgentScope's template variables
    # {member_name} and {member_description} will be filled by AgentCreate
    system_prompt = _format_prompt(
        role_def.get("name", role_id),
        prompt_body,
        role_def.get("skills", []),
    )

    # Build permission context from tools
    permission_ctx = _build_permission_context(
        role_def.get("permissions", {}),
    )

    # Determine if this role should get leader-style permissions
    team_role = role_def.get("team_role", "Executor")
    is_leader_like = team_role in ("Coordinator",)

    return SubAgentTemplate(
        type=role_id,
        description=role_def.get("description", ""),
        system_prompt_template=system_prompt,
        permission_context=permission_ctx,
        override_leader_mode=False,
        extend_leader_permission_rules=True,
        extend_leader_working_directories=True,
    )


def _build_custom_template(
    role_id: str,
    role_def: dict[str, Any],
    base_roles: dict[str, Any],
    prompt_templates: dict[str, str],
) -> SubAgentTemplate:
    """Convert a custom_role to SubAgentTemplate, inheriting from base_role."""
    base_role_id = role_def.get("base_role", "")
    base_role = base_roles.get(base_role_id, {})

    # Merge tools: base + extra
    base_tools = set(base_role.get("permissions", {}).get("tools", []))
    extra_tools = set(role_def.get("extra_tools", []))
    merged_tools = list(base_tools | extra_tools)

    base_dangerous = set(base_role.get("permissions", {}).get("dangerous_tools", []))
    merged_dangerous = list(base_dangerous)

    # Use custom_prompt if available, otherwise fall back to base template
    custom_prompt = role_def.get("custom_prompt", "")
    if custom_prompt:
        system_prompt = custom_prompt
    else:
        prompt_key = base_role.get("prompt_template", "")
        prompt_body = prompt_templates.get(prompt_key, "")
        system_prompt = _format_prompt(
            role_def.get("name", role_id),
            prompt_body,
            role_def.get("extra_skills", []),
        )

    # Ensure template variables are present
    if "{member_name}" not in system_prompt:
        system_prompt = "你是{member_name}，{member_description}\n\n" + system_prompt
    if "{member_description}" not in system_prompt:
        system_prompt = system_prompt.replace(
            "{member_name}",
            "{member_name}，一位{member_description}",
            1,
        )

    permission_ctx = _build_permission_context({
        "tools": merged_tools,
        "dangerous_tools": merged_dangerous,
    })

    return SubAgentTemplate(
        type=role_id,
        description=role_def.get("description", ""),
        system_prompt_template=system_prompt,
        permission_context=permission_ctx,
        override_leader_mode=False,
        extend_leader_permission_rules=True,
        extend_leader_working_directories=True,
    )


def _format_prompt(
    name: str,
    prompt_body: str,
    skills: list[str],
) -> str:
    """Build system prompt with template variables."""
    # Ensure {member_name} is used for the agent's name
    prompt = prompt_body.replace("{name}", "{member_name}") if prompt_body else ""

    if not prompt:
        prompt = "你是{member_name}，{member_description}"

    # Append skills context if available
    if skills:
        skills_text = "、".join(skills)
        prompt += f"\n\n## 专业技能\n{skills_text}"

    return prompt


def _build_permission_context(
    permissions: dict[str, Any],
) -> PermissionContext:
    """Convert MDH tool permissions to AgentScope PermissionContext."""
    tools = permissions.get("tools", [])
    dangerous_tools = set(permissions.get("dangerous_tools", []))

    rules = []
    for tool in tools:
        if tool in dangerous_tools:
            rules.append(PermissionRule(
                tool_name=tool,
                behavior="ask",
                rule_content="",
                source="template",
            ))
        else:
            rules.append(PermissionRule(
                tool_name=tool,
                behavior="allow",
                rule_content="",
                source="template",
            ))

    return PermissionContext(rules=rules)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/test/MDH/backend && python3 -m pytest tests/test_template_bridge.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/template_bridge.py backend/tests/test_template_bridge.py
git commit -m "feat: add template_bridge to convert roles_config.yaml to SubAgentTemplate"
```

---

### Task 2: Team Adapter — Bridge AgentScope Team Events to MDH WebSocket Protocol

**Covers:** Frontend protocol compatibility, event translation

**Files:**
- Create: `backend/team_adapter.py`
- Create: `backend/tests/test_team_adapter.py`

**Interfaces:**
- Consumes: AgentScope `AgentEvent` stream (from ChatService SSE)
- Produces: MDH WebSocket messages (`ws.send_json` with `type` field)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_team_adapter.py
import pytest
from team_adapter import TeamAdapter

class FakeWebSocket:
    def __init__(self):
        self.messages = []
    async def send_json(self, msg):
        self.messages.append(msg)

@pytest.mark.asyncio
async def test_adapter_translates_team_create():
    ws = FakeWebSocket()
    adapter = TeamAdapter(ws, session_id="test-session")

    # Simulate a TeamCreate tool result event
    event = {
        "type": "tool_result",
        "tool_name": "TeamCreate",
        "result": {"team_id": "team-123", "name": "dev-team"},
    }
    await adapter.handle_event(event)

    assert len(ws.messages) == 1
    msg = ws.messages[0]
    assert msg["type"] == "agent_message"
    assert "team" in msg.get("subtype", "").lower() or "team" in msg.get("content", "").lower()

@pytest.mark.asyncio
async def test_adapter_translates_team_say():
    ws = FakeWebSocket()
    adapter = TeamAdapter(ws, session_id="test-session")

    event = {
        "type": "tool_result",
        "tool_name": "TeamSay",
        "result": {"delivered_to": ["worker-1"]},
    }
    await adapter.handle_event(event)
    # Should not crash, may or may not produce a message

@pytest.mark.asyncio
async def test_adapter_translates_agent_create():
    ws = FakeWebSocket()
    adapter = TeamAdapter(ws, session_id="test-session")

    event = {
        "type": "tool_result",
        "tool_name": "AgentCreate",
        "result": {"agent_id": "agent-456", "name": "executor-1"},
    }
    await adapter.handle_event(event)

    assert len(ws.messages) >= 1
    msg = ws.messages[0]
    assert msg["type"] == "agent_message"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/test/MDH/backend && python3 -m pytest tests/test_team_adapter.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'team_adapter'"

- [ ] **Step 3: Write implementation**

```python
# backend/team_adapter.py
"""
Bridges AgentScope agent-team events to MDH's frontend WebSocket protocol.

Translates TeamCreate/AgentCreate/TeamSay/TeamDelete tool results
into the `agent_message` format that the MDH frontend expects.
"""
import asyncio
from typing import Any, Callable, Optional


class TeamAdapter:
    """Translates AgentScope team events to MDH WebSocket messages."""

    def __init__(
        self,
        ws: Any,
        session_id: str,
        send_fn: Optional[Callable] = None,
    ):
        self._ws = ws
        self._session_id = session_id
        self._send_fn = send_fn or self._default_send
        self._sequence_no = 0

    async def _default_send(self, msg: dict[str, Any]) -> None:
        await self._ws.send_json(msg)

    async def handle_event(self, event: dict[str, Any]) -> None:
        """Route an AgentScope event to the appropriate handler."""
        event_type = event.get("type", "")

        if event_type == "tool_result":
            await self._handle_tool_result(event)
        elif event_type == "text":
            await self._handle_text(event)
        elif event_type == "thinking":
            await self._handle_thinking(event)

    async def _handle_tool_result(self, event: dict[str, Any]) -> None:
        tool_name = event.get("tool_name", "")
        result = event.get("result", {})

        handlers = {
            "TeamCreate": self._on_team_create,
            "AgentCreate": self._on_agent_create,
            "TeamSay": self._on_team_say,
            "TeamDelete": self._on_team_delete,
        }

        handler = handlers.get(tool_name)
        if handler:
            await handler(result)

    async def _on_team_create(self, result: dict[str, Any]) -> None:
        team_id = result.get("team_id", "")
        name = result.get("name", "")
        await self._send({
            "type": "meeting_started",
            "meeting_id": team_id,
            "agents": [],  # Will be populated as AgentCreate calls happen
        })

    async def _on_agent_create(self, result: dict[str, Any]) -> None:
        agent_id = result.get("agent_id", "")
        name = result.get("name", "")
        await self._send({
            "type": "agent_joined",
            "agent_id": agent_id,
            "agent_name": name,
        })

    async def _on_team_say(self, result: dict[str, Any]) -> None:
        delivered_to = result.get("delivered_to", [])
        if delivered_to:
            await self._send({
                "type": "message_delivered",
                "recipients": delivered_to,
            })

    async def _on_team_delete(self, result: dict[str, Any]) -> None:
        await self._send({
            "type": "meeting_ended",
        })

    async def _handle_text(self, event: dict[str, Any]) -> None:
        delta = event.get("delta", "")
        await self._send({
            "type": "agent_message",
            "subtype": "reply_text",
            "content": delta,
        })

    async def _handle_thinking(self, event: dict[str, Any]) -> None:
        delta = event.get("delta", "")
        await self._send({
            "type": "agent_message",
            "subtype": "thinking",
            "content": delta,
        })

    async def _send(self, msg: dict[str, Any]) -> None:
        """Send with sequence number."""
        self._sequence_no += 1
        msg["seq"] = self._sequence_no
        await self._send_fn(msg)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/test/MDH/backend && python3 -m pytest tests/test_team_adapter.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/team_adapter.py backend/tests/test_team_adapter.py
git commit -m "feat: add team_adapter to bridge AgentScope events to MDH WebSocket"
```

---

### Task 3: Register Templates at Server Startup

**Covers:** Template registration, app initialization

**Files:**
- Modify: `backend/server.py` (lines ~30-60, startup)
- Modify: `backend/server.py` (lines ~530-540, roles config loading)

**Interfaces:**
- Consumes: `template_bridge.build_templates_from_config()`
- Produces: `app.state.subagent_templates` available for team_adapter

- [ ] **Step 1: Add template registration to server.py**

Add after the existing imports in `server.py`:

```python
from template_bridge import build_templates_from_config
```

Add after the existing `_load_roles_config()` function (around line 540):

```python
# Build SubAgentTemplate list from roles_config.yaml
_roles_config = _load_roles_config()
_subagent_templates = build_templates_from_config(_roles_config) if _roles_config else []
logger.info("已注册 %d 个 SubAgentTemplate", len(_subagent_templates))
```

- [ ] **Step 2: Wire templates into CeoAgent creation**

In the `ws_handler` function where `CeoAgent` is created (around line 1038-1044), pass the templates:

```python
if not hasattr(session, '_ceo_agent') or session._ceo_agent is None:
    session._ceo_agent = CeoAgent(
        session=session,
        project_manager=project_manager,
        complexity_classifier=complexity_classifier,
        simple_executor=simple_executor,
        subagent_templates=_subagent_templates,  # NEW
    )
```

- [ ] **Step 3: Verify server starts without errors**

Run: `docker compose build backend && docker compose up -d backend`
Check: `docker compose logs backend` should show "已注册 N 个 SubAgentTemplate"

- [ ] **Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat: register SubAgentTemplates from roles_config.yaml at startup"
```

---

### Task 4: Refactor CeoAgent Complex Path to Use Team Tools

**Covers:** Core migration — replace MeetingCoordinator discussion with agent-team

**Files:**
- Modify: `backend/ceo_agent.py` (add team-based execution path)

**Interfaces:**
- Consumes: `subagent_templates`, `TeamAdapter`
- Produces: Same frontend message flow as before

- [ ] **Step 1: Add team-based execution method to CeoAgent**

In `ceo_agent.py`, add a new method `_execute_with_team()`:

```python
async def _execute_with_team(
    self,
    content: str,
    send_message: Callable,
    selected_roles: list[str] | None = None,
) -> dict[str, Any]:
    """Execute complex task using AgentScope's agent-team system.

    Instead of MeetingCoordinator's serial discussion, this uses
    TeamCreate + AgentCreate + TeamSay for async collaboration.
    """
    from team_adapter import TeamAdapter

    adapter = TeamAdapter(
        ws=self._session.ws,
        session_id=self._session.session_id,
        send_fn=send_message,
    )

    # Select roles for the team
    roles_config = load_roles_config()
    if not selected_roles:
        selected_roles = ["coordinator", "planner", "executor", "reviewer"]

    # Filter to only roles that have SubAgentTemplates
    available_types = {t.type for t in self._subagent_templates}
    selected_roles = [r for r in selected_roles if r in available_types]

    if not selected_roles:
        return {"error": "没有可用的角色模板"}

    # Build team description from selected roles
    role_names = []
    for role_id in selected_roles:
        role_def = roles_config.get("base_roles", {}).get(role_id) or \
                   roles_config.get("custom_roles", {}).get(role_id, {})
        role_names.append(role_def.get("name", role_id))

    team_desc = f"任务: {content}\n\n团队成员: {', '.join(role_names)}"

    # Send meeting_started to frontend
    await send_message({
        "type": "agent_message",
        "subtype": "meeting_started",
        "meeting_id": f"team-{self._session.session_id[:8]}",
        "agents": [
            {"id": role_id, "name": name, "role": role_id}
            for role_id, name in zip(selected_roles, role_names)
        ],
    })

    # Create the leader prompt that instructs the agent to use team tools
    leader_prompt = self._build_leader_prompt(content, selected_roles, roles_config)

    # Run the leader agent with team tools
    # The leader will call TeamCreate, AgentCreate, TeamSay autonomously
    result = await self._run_leader_agent(
        prompt=leader_prompt,
        adapter=adapter,
        team_name=f"task-{self._session.session_id[:8]}",
        team_description=team_desc,
        selected_roles=selected_roles,
        roles_config=roles_config,
    )

    return result


def _build_leader_prompt(
    self,
    content: str,
    selected_roles: list[str],
    roles_config: dict,
) -> str:
    """Build a prompt for the leader agent that instructs it to use team tools."""
    role_descriptions = []
    for role_id in selected_roles:
        role_def = roles_config.get("base_roles", {}).get(role_id) or \
                   roles_config.get("custom_roles", {}).get(role_id, {})
        name = role_def.get("name", role_id)
        desc = role_def.get("description", "")
        role_descriptions.append(f"- {name} ({role_id}): {desc}")

    roles_text = "\n".join(role_descriptions)

    return f"""你是一个技术团队的领导者。你需要组建一个团队来完成以下任务:

## 任务
{content}

## 可用团队成员
{roles_text}

## 工作流程
1. 使用 TeamCreate 创建团队
2. 使用 AgentCreate 为每个需要的角色创建成员，给每个成员分配明确的任务描述
3. 等待成员通过 TeamSay 汇报结果
4. 如果需要，使用 TeamSay 给成员发送补充指令
5. 任务完成后，使用 TeamDelete 解散团队

请开始组建团队并完成任务。"""
```

- [ ] **Step 2: Update process_message to route to team-based execution**

In `CeoAgent.process_message()`, modify the complex path to use the new method:

```python
# In _execute_complex(), replace the MeetingCoordinator path with:
if self._subagent_templates:
    result = await self._execute_with_team(content, send_message, selected_roles)
else:
    # Fallback to existing MeetingCoordinator path
    result = await self._execute_with_meeting_coordinator(content, send_message, selected_roles)
```

- [ ] **Step 3: Verify end-to-end flow**

Run: `docker compose build backend && docker compose up -d`
Test: Send a message through the WebSocket and verify team creation events appear in frontend

- [ ] **Step 4: Commit**

```bash
git add backend/ceo_agent.py
git commit -m "feat: add team-based execution path to CeoAgent using AgentScope agent-team"
```

---

### Task 5: Integration Test — Full Team Lifecycle

**Covers:** End-to-end verification of the migration

**Files:**
- Create: `backend/tests/test_team_integration.py`

- [ ] **Step 1: Write integration test**

```python
# backend/tests/test_team_integration.py
"""Integration test: verify the full team lifecycle works."""
import pytest
from template_bridge import build_templates_from_config
from agent_toolset import load_roles_config

def test_all_roles_convert_to_templates():
    """Every role in roles_config.yaml should produce a valid SubAgentTemplate."""
    config = load_roles_config()
    templates = build_templates_from_config(config)

    template_types = {t.type for t in templates}

    # All base_roles should be present
    for role_id in config.get("base_roles", {}):
        assert role_id in template_types, f"Missing template for base_role: {role_id}"

    # All custom_roles should be present
    for role_id in config.get("custom_roles", {}):
        assert role_id in template_types, f"Missing template for custom_role: {role_id}"

def test_templates_have_required_fields():
    """Every template must have type, description, and system_prompt_template."""
    config = load_roles_config()
    templates = build_templates_from_config(config)

    for t in templates:
        assert t.type, f"Template missing type"
        assert t.description, f"Template {t.type} missing description"
        assert t.system_prompt_template, f"Template {t.type} missing system_prompt_template"
        assert "{member_name}" in t.system_prompt_template, \
            f"Template {t.type} missing {{member_name}} in prompt"

def test_no_duplicate_template_types():
    """No two templates should share the same type."""
    config = load_roles_config()
    templates = build_templates_from_config(config)

    types = [t.type for t in templates]
    assert len(types) == len(set(types)), f"Duplicate types: {[t for t in types if types.count(t) > 1]}"
```

- [ ] **Step 2: Run integration test**

Run: `cd /home/test/MDH/backend && python3 -m pytest tests/test_team_integration.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_team_integration.py
git commit -m "test: add integration tests for template bridge"
```
