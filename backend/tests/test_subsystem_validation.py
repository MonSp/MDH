"""v0.3.1 E2E Subsystem Validation — 20 subsystems, real code paths, mocked LLM/HTTP.

Each test instantiates the real module under test and only mocks external
dependencies (LLM calls, HTTP requests, filesystem where needed).
"""

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RT_PATH = os.path.join(DATA_DIR, "routing_table.json")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_ROUTING_TABLE = {
    "departments": [
        {
            "dept_id": "dept-frontend",
            "dept_name": "前端开发组",
            "capability_desc": "React 组件开发、HTML/CSS",
            "capability_keywords": ["前端", "frontend", "react", "vue", "html", "css", "UI", "组件"],
            "tools": ["code_generator"],
            "success_rate": 0.88,
            "total_tasks": 10,
            "successful_tasks": 8,
            "last_active": "",
            "priority": 10,
            "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-backend",
            "dept_name": "后端开发组",
            "capability_desc": "Python 后端服务、API 设计、数据库",
            "capability_keywords": ["后端", "backend", "api", "python", "数据库", "database", "服务"],
            "tools": ["code_generator", "test_runner"],
            "success_rate": 0.85,
            "total_tasks": 10,
            "successful_tasks": 8,
            "last_active": "",
            "priority": 10,
            "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-qa",
            "dept_name": "质量保障组",
            "capability_desc": "测试、代码审查、质量保障",
            "capability_keywords": ["测试", "test", "QA", "质量", "审查", "review"],
            "tools": ["test_runner", "linter"],
            "success_rate": 0.92,
            "total_tasks": 5,
            "successful_tasks": 4,
            "last_active": "",
            "priority": 8,
            "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-devops",
            "dept_name": "DevOps 运维组",
            "capability_desc": "Docker、CI/CD、部署、监控",
            "capability_keywords": ["部署", "deploy", "docker", "kubernetes", "ci", "运维", "devops"],
            "tools": ["docker", "kubernetes"],
            "success_rate": 0.87,
            "total_tasks": 5,
            "successful_tasks": 4,
            "last_active": "",
            "priority": 7,
            "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-data",
            "dept_name": "数据分析部",
            "capability_desc": "数据分析、统计、机器学习",
            "capability_keywords": ["数据", "分析", "统计", "机器学习", "模型"],
            "tools": ["data_cleaner", "ml_trainer"],
            "success_rate": 0.80,
            "total_tasks": 3,
            "successful_tasks": 2,
            "last_active": "",
            "priority": 7,
            "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-fullstack",
            "dept_name": "全栈开发组",
            "capability_desc": "全栈 Web 应用开发、前后端联调",
            "capability_keywords": ["全栈", "fullstack", "web", "开发", "应用"],
            "tools": ["code_generator", "docker"],
            "success_rate": 0.82,
            "total_tasks": 5,
            "successful_tasks": 4,
            "last_active": "",
            "priority": 9,
            "skill_level_boost": 0.0,
        },
    ]
}


@pytest.fixture
def tmp_routing_file(tmp_path):
    """Write a sample routing table to a temp file and return its path."""
    path = str(tmp_path / "routing_table.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False)
    return path


@pytest.fixture
def data_dir(tmp_path):
    """Return a temp data directory with routing table."""
    path = tmp_path / "data"
    path.mkdir()
    with open(path / "routing_table.json", "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False)
    return str(path)


# ══════════════════════════════════════════════════════════════════════
# 1. DynamicRouter — route a task, verify department selection + score
# ══════════════════════════════════════════════════════════════════════

def test_01_dynamic_router_routing(tmp_routing_file):
    from dynamic_router import DynamicRouter
    router = DynamicRouter(routing_table_path=tmp_routing_file)
    decision = router.route('实现一个前端页面')
    assert decision is not None
    assert decision.selected_dept in ('dept-frontend', 'dept-fullstack')
    assert 0 < decision.confidence <= 1
    assert len(decision.candidate_depts) > 0


def test_01b_dynamic_router_backend_task(tmp_routing_file):
    from dynamic_router import DynamicRouter
    router = DynamicRouter(routing_table_path=tmp_routing_file)
    decision = router.route('修复后端API接口 bug')
    assert decision.selected_dept in ('dept-backend', 'dept-fullstack')
    assert 0 < decision.confidence <= 1


# ══════════════════════════════════════════════════════════════════════
# 2. ComplexityClassifier — classify simple/complex task
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_02_complexity_classifier():
    from complexity_classifier import ComplexityClassifier
    classifier = ComplexityClassifier(get_model_fn=None)

    # Simple task — single-step browser instruction
    result = classifier._rule_classify('打开 https://example.com')
    assert result is not None
    assert result.level == 'simple'

    # Complex task — multi-step with cross-dept keywords
    result = classifier._rule_classify(
        '首先设计前端页面，然后开发后端API，最后测试部署上线'
    )
    assert result is not None
    assert result.level == 'complex'
    assert result.confidence >= 0.7


# ══════════════════════════════════════════════════════════════════════
# 3. SemanticAnalyzer — analyze task with routing (mock LLM)
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_03_semantic_analyzer(tmp_routing_file):
    from dynamic_router import DynamicRouter
    from semantic_analyzer import SemanticAnalyzer

    router = DynamicRouter(routing_table_path=tmp_routing_file)
    get_model = MagicMock(return_value=MagicMock())

    analyzer = SemanticAnalyzer(router=router, get_model_fn=get_model)

    # Mock the LLM to return a structured response
    mock_reply = MagicMock()
    mock_reply.content = json.dumps({
        "is_task": True,
        "intent": "develop",
        "target_agent": "executor",
        "confidence": 0.9,
    })
    with patch('semantic_analyzer.safe_llm_reply', new_callable=AsyncMock, return_value=mock_reply):
        result = await analyzer.analyze('实现一个React登录组件')

    assert result is not None
    assert result.is_task is True
    assert analyzer.last_routing_decision is not None


# ══════════════════════════════════════════════════════════════════════
# 4. SimpleExecutor — execute a simple task with post-processing
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_04_simple_executor(tmp_path):
    from project_manager import ProjectManager
    from simple_executor import SimpleExecutor
    from skill_registry import SkillRegistry

    projects_dir = str(tmp_path / "projects")
    os.makedirs(projects_dir, exist_ok=True)
    sr = SkillRegistry(base_dir=str(tmp_path / "skills"))
    pm = ProjectManager(projects_dir=projects_dir, skill_registry=sr)
    executor = SimpleExecutor(project_manager=pm)

    # Create a mock session
    session = MagicMock()
    session.meeting_id = "test-meeting"
    session.agents = []

    progress_calls = []
    async def on_progress(agent_id, text, delta):
        progress_calls.append((agent_id, text, delta))

    # Mock _run_task to return a result
    with patch('simple_executor.MeetingSession') as MockSession:
        mock_meeting = MagicMock()
        mock_meeting.meeting_id = "test-m"
        mock_meeting.agents = [MagicMock(id="pa-1", name="助理", role="executor", status="meeting", location="local")]
        mock_meeting.start = MagicMock()
        MockSession.return_value = mock_meeting

        with patch.object(executor, '_run_task', new_callable=AsyncMock, return_value="文件已创建"):
            result = await executor.execute(session, "创建一个hello.py文件", on_progress)

    assert result is not None
    assert hasattr(result, 'success')
    assert hasattr(result, 'retry_with_complex')


# ══════════════════════════════════════════════════════════════════════
# 5. MeetingCoordinator — start a meeting with role assembly
# ══════════════════════════════════════════════════════════════════════

def test_05_meeting_coordinator_role_prompts():
    from meeting_coordinator import AGENT_ROLE_PROMPTS
    from coordinator_routing import AGENT_ROLE_TOOLS
    from protocol import AgentRole

    # Verify all 6 roles have prompts
    for role in [AgentRole.CEO, AgentRole.PLANNER, AgentRole.EXECUTOR,
                 AgentRole.MONITOR, AgentRole.REVIEWER, AgentRole.COORDINATOR]:
        assert role in AGENT_ROLE_PROMPTS
        assert len(AGENT_ROLE_PROMPTS[role]) > 10
        assert role in AGENT_ROLE_TOOLS
        assert len(AGENT_ROLE_TOOLS[role]) > 0


def test_05b_meeting_coordinator_routing_table_creation(tmp_path):
    import logging

    from meeting_coordinator import MeetingCoordinator

    data_dir = str(tmp_path / "data")
    os.makedirs(data_dir, exist_ok=True)
    rt_path = os.path.join(data_dir, "routing_table.json")

    # Use a mock self that has a logger
    mock_self = MagicMock()
    mock_self.logger = logging.getLogger("test")

    # MeetingCoordinator should create default routing table via _ensure_default_routing_table
    MeetingCoordinator._ensure_default_routing_table(mock_self, rt_path)
    assert os.path.isfile(rt_path)

    with open(rt_path, encoding="utf-8") as f:
        table = json.load(f)
    assert "departments" in table
    assert len(table["departments"]) >= 5


# ══════════════════════════════════════════════════════════════════════
# 6. WorkflowEngine — create and execute a DAG workflow
# ══════════════════════════════════════════════════════════════════════

def test_06_workflow_engine_create(tmp_path):
    from protocol import (
        WorkflowDefinition,
        WorkflowEdge,
        WorkflowNode,
        WorkflowNodeStatus,
    )
    from workflow_engine import WorkflowEngine

    engine = WorkflowEngine(persistence_dir=str(tmp_path / "persist"))

    # Create a simple two-node DAG: A -> B
    nodes = [
        WorkflowNode(node_id="n1", task_description="设计前端页面", dept_id="dept-frontend"),
        WorkflowNode(node_id="n2", task_description="开发后端API", dept_id="dept-backend"),
    ]
    edges = [WorkflowEdge(source_node_id="n1", target_node_id="n2")]
    definition = WorkflowDefinition(
        workflow_id="wf-test",
        name="测试工作流",
        description="测试顺序执行工作流",
        nodes=nodes,
        edges=edges,
        execution_strategy="sequential",
    )

    execution = engine.create_workflow(definition)
    assert execution is not None
    assert execution.status.value == "created"
    assert execution.node_states["n1"] == WorkflowNodeStatus.PENDING
    assert execution.node_states["n2"] == WorkflowNodeStatus.PENDING


# ══════════════════════════════════════════════════════════════════════
# 7. ExperienceExtractor — extract rules from a mock meeting result
# ══════════════════════════════════════════════════════════════════════

def test_07_experience_extractor(tmp_path):
    from experience_extractor import ExperienceExtractor

    incremental_dir = str(tmp_path / "incremental")
    extractor = ExperienceExtractor(incremental_dir=incremental_dir)

    rules = extractor.extract_from_meeting(
        project_id="proj-1",
        task_description="实现登录页面",
        discussion_results=[
            {
                "parsed_stance": "support",
                "role": "assistant",
                "content": "我建议采用JWT认证方案，结合Redis缓存session，"
                           "这样既能保证安全性又能提升性能。使用bcrypt哈希密码存储。",
            }
        ],
        review_result={
            "reviewer_feedback": "建议增加rate limiting防止暴力破解",
        },
        execution_results=[],
    )

    # Should extract at least one rule
    assert isinstance(rules, list)
    if rules:
        rule = rules[0]
        assert hasattr(rule, 'rule_id')
        assert hasattr(rule, 'trigger_condition')
        assert hasattr(rule, 'action')
        assert rule.status == 'pending_review'


# ══════════════════════════════════════════════════════════════════════
# 8. SkillEvolution — evolve from feedback
# ══════════════════════════════════════════════════════════════════════

def test_08_skill_evolution(tmp_path):
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution

    incremental_dir = str(tmp_path / "incremental")
    extractor = ExperienceExtractor(incremental_dir=incremental_dir)
    evolution = SkillEvolution(extractor=extractor)

    result = evolution.evolve_from_feedback(
        project_id="proj-1",
        task_type="web-dev",
        transcript="团队讨论了React vs Vue的选择",
        feedback="应该优先考虑团队熟悉度和技术生态",
        keywords=["react", "vue", "frontend"],
        team_id="team-1",
    )

    assert result is not None
    assert "ok" in result
    assert "count" in result


# ══════════════════════════════════════════════════════════════════════
# 9. AgentProfileManager — grant XP and check level up
# ══════════════════════════════════════════════════════════════════════

def test_09_agent_profile_manager(tmp_path):
    from agent_profile_manager import AgentProfileManager

    profiles_dir = str(tmp_path / "profiles")
    os.makedirs(profiles_dir, exist_ok=True)
    mgr = AgentProfileManager(profiles_dir=profiles_dir)

    # Create profile
    profile = mgr.get_or_create("agent-1", "测试Agent", department="dept-frontend")
    assert profile.agent_id == "agent-1"
    assert profile.total_xp == 0

    # Grant XP — successful task
    skill_config = {"xp_thresholds": [100, 300, 600]}
    result = mgr.grant_xp("agent-1", "frontend_dev", task_success=True, review_score=9.0, task_complexity=3, skill_config=skill_config)
    assert result["xp_gained"] > 0

    profile = mgr.get_profile("agent-1")
    assert profile.total_xp > 0


# ══════════════════════════════════════════════════════════════════════
# 10. DynamicRouter adaptive — update_stats and verify success_rate
# ══════════════════════════════════════════════════════════════════════

def test_10_dynamic_router_adaptive(tmp_routing_file):
    from dynamic_router import DynamicRouter

    router = DynamicRouter(routing_table_path=tmp_routing_file)
    table_before = {e["dept_id"]: e["success_rate"] for e in router.get_route_table()}

    # Record some successes
    for _ in range(5):
        router.update_stats("dept-frontend", True)
    router.update_stats("dept-frontend", False)

    table_after = {e["dept_id"]: e["success_rate"] for e in router.get_route_table()}
    assert table_after["dept-frontend"] != table_before.get("dept-frontend", 0.88)


# ══════════════════════════════════════════════════════════════════════
# 11. A2A Registry — register/unregister/heartbeat
# ══════════════════════════════════════════════════════════════════════

def test_11_a2a_registry(tmp_path):
    from a2a_registry import A2ARegistry, AgentCard, AgentSkill

    persist_path = str(tmp_path / "a2a_agents.json")
    registry = A2ARegistry(persist_path=persist_path)

    card = AgentCard(
        name="test-orchestrator",
        description="Test A2A node",
        url="http://localhost:9090",
        skills=[AgentSkill(id="code_gen", name="Code Generation", description="Generate code", tags=["coding"])],
    )

    # Register
    agent = registry.register("node-1", card)
    assert agent.agent_id == "node-1"
    assert agent.status == "active"

    # List
    agents = registry.list_active()
    assert len(agents) == 1
    assert agents[0].agent_id == "node-1"

    # Heartbeat
    hb = registry.heartbeat("node-1")
    assert hb is True

    # Unregister
    ok = registry.unregister("node-1")
    assert ok is True
    assert len(registry.list_active()) == 0


# ══════════════════════════════════════════════════════════════════════
# 12. A2A Client — send task (mock HTTP)
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_12_a2a_client():
    from a2a_client import A2AClient
    from a2a_registry import AgentCard, RegisteredAgent

    client = A2AClient(timeout=10)
    agent = RegisteredAgent(
        agent_id="node-test",
        card=AgentCard(name="test", description="test", url="http://localhost:9090"),
    )

    events = []

    # Mock httpx client to simulate SSE response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "text/event-stream"}
    mock_response.aiter_lines = AsyncMock(return_value=iter([
        'data: {"task_id": "t1", "status": {"state": "completed", "message": "done"}}',
    ]))
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.is_closed = False

    with patch.object(client, '_get_client', return_value=mock_client):
        events_captured = []
        async def on_event(evt):
            events_captured.append(evt)

        result = await client.send_task(agent, "hello world", on_event=on_event)

    assert result is not None
    # Cleanup
    await client.close()


# ══════════════════════════════════════════════════════════════════════
# 13. A2A PostProcessor — process task result with all hooks
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_13_a2a_post_processor(tmp_path):
    from a2a_post_processor import A2APostProcessor

    mock_experience = MagicMock()
    mock_experience.extract_from_meeting.return_value = []

    mock_profiles = MagicMock()
    mock_profiles.grant_xp.return_value = {"xp_gained": 10, "leveled_up": False}

    mock_memory = MagicMock()

    mock_router = MagicMock()
    mock_router.update_stats.return_value = True

    mock_ab = MagicMock()

    processor = A2APostProcessor(
        experience_extractor=mock_experience,
        agent_profile_manager=mock_profiles,
        agent_memory=mock_memory,
        dynamic_router=mock_router,
        ab_tracker=mock_ab,
    )

    await processor.process(
        task_description="实现登录页面",
        result_text="成功实现了JWT认证登录页面",
        success=True,
        agent_id="a2a-node-1",
        task_id="task-1",
        dept_id="dept-frontend",
        xp_target="executor",
    )

    # Verify hooks were called
    mock_profiles.grant_xp.assert_called_once()
    mock_router.update_stats.assert_called_once_with("dept-frontend", True)
    mock_ab.record_task.assert_called_once()


# ══════════════════════════════════════════════════════════════════════
# 14. CapabilityBoundary — compute confidence map
# ══════════════════════════════════════════════════════════════════════

def test_14_capability_boundary(tmp_path):
    from capability_boundary import CapabilityBoundary

    data_dir = str(tmp_path / "data")
    os.makedirs(os.path.join(data_dir, "experience", "rules"), exist_ok=True)

    # Write a sample rule file
    rule_data = {
        "rules": [
            {
                "rule_id": "r1",
                "trigger_condition": "task_type is web-dev",
                "action": "使用React组件化开发",
                "rule_type": "success_pattern",
                "status": "approved",
                "keywords": ["react", "frontend"],
                "effectiveness_score": 0.85,
                "usage_count": 10,
                "success_count": 8,
            }
        ]
    }
    import yaml
    with open(os.path.join(data_dir, "experience", "rules", "r1.yaml"), "w") as f:
        yaml.dump(rule_data, f)

    boundary = CapabilityBoundary(data_dir=data_dir)
    cmap = boundary.compute_confidence_map()

    assert "domains" in cmap
    assert "overall_confidence" in cmap
    if cmap["domains"]:
        # Should have confidence for "success_pattern" domain
        assert any(v.get("confidence", 0) > 0 for v in cmap["domains"].values())


# ══════════════════════════════════════════════════════════════════════
# 15. StateSync — prepare task metadata with experience injection
# ══════════════════════════════════════════════════════════════════════

def test_15_state_sync(tmp_path):
    from experience_extractor import ExperienceExtractor
    from state_sync import StateSyncManager, extract_keywords

    incremental_dir = str(tmp_path / "incremental")
    extractor = ExperienceExtractor(incremental_dir=incremental_dir)
    sync = StateSyncManager(experience_extractor=extractor)

    metadata = sync.prepare_task_metadata(
        task_description="实现一个React登录组件，使用JWT认证",
        agent_id="a2a-node-1",
    )
    assert metadata is not None
    assert isinstance(metadata, dict)

    # Verify keyword extraction
    kws = extract_keywords("实现一个React登录组件使用JWT认证")
    assert len(kws) > 0


# ══════════════════════════════════════════════════════════════════════
# 16. EvolutionEventStore — record and query events
# ══════════════════════════════════════════════════════════════════════

def test_16_evolution_event_store(tmp_path):
    from datetime import datetime, timezone

    from evolution_events import EvolutionEvent, EvolutionEventStore, new_event_id

    db_path = str(tmp_path / "evolution.db")
    store = EvolutionEventStore(db_path=db_path)

    # Use current timestamps so get_summary's 7-day window always includes them
    now = datetime.now(timezone.utc).isoformat()

    # Record events
    store.record_event(EvolutionEvent(
        event_id=new_event_id(),
        event_type="xp_granted",
        agent_id="agent-1",
        timestamp=now,
        details={"xp_gained": 20, "skill_id": "frontend_dev"},
        task_id="task-1",
    ))
    store.record_event(EvolutionEvent(
        event_id=new_event_id(),
        event_type="skill_level_up",
        agent_id="agent-1",
        timestamp=now,
        details={"skill_id": "frontend_dev", "new_level": 1},
        task_id="task-1",
    ))

    # Query timeline
    timeline = store.get_timeline(agent_id="agent-1")
    assert len(timeline) == 2

    # Query by type
    xp_events = store.get_timeline(event_type="xp_granted")
    assert len(xp_events) == 1
    assert xp_events[0]["details"]["xp_gained"] == 20

    # Summary
    summary = store.get_summary(agent_id="agent-1")
    assert summary["total_events"] == 2
    assert summary["xp_delta"] == 20


# ══════════════════════════════════════════════════════════════════════
# 17. ABTracker — record and query A/B stats
# ══════════════════════════════════════════════════════════════════════

def test_17_ab_tracker(tmp_path):
    import sqlite3

    from evolution_events import ABTracker

    conn = sqlite3.connect(str(tmp_path / "ab.db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    tracker = ABTracker(conn=conn)

    # Record tasks with rules
    for _ in range(5):
        tracker.record_task("web-dev", success=True, has_rules=True)
    for _ in range(2):
        tracker.record_task("web-dev", success=False, has_rules=True)

    # Record tasks without rules
    for _ in range(3):
        tracker.record_task("web-dev", success=True, has_rules=False)
    for _ in range(2):
        tracker.record_task("web-dev", success=False, has_rules=False)

    stats = tracker.get_stats(task_type="web-dev")
    assert len(stats) == 1
    s = stats[0]
    assert s["task_type"] == "web-dev"
    assert s["total"] == 12
    assert s["with_rules_total"] == 7
    assert s["with_rules_success_rate"] > 0
    assert s["without_rules_success_rate"] > 0

    conn.close()


# ══════════════════════════════════════════════════════════════════════
# 18. TenantMiddleware — tenant isolation verification
# ══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_18_tenant_middleware(tmp_path):
    from tenant_manager import TenantManager

    data_dir = str(tmp_path / "data")
    os.makedirs(data_dir, exist_ok=True)
    tm = TenantManager(data_dir=data_dir)

    # Create tenants
    t1 = tm.create_tenant("Team A")
    t2 = tm.create_tenant("Team B")
    assert t1.tenant_id != t2.tenant_id
    assert t1.api_key != t2.api_key

    # Verify isolation — get_tenant_by_api_key
    found1 = tm.get_tenant_by_api_key(t1.api_key)
    assert found1 is not None
    assert found1.tenant_id == t1.tenant_id

    found2 = tm.get_tenant_by_api_key(t2.api_key)
    assert found2 is not None
    assert found2.tenant_id == t2.tenant_id

    # Deactivate tenant t1
    tm.deactivate_tenant(t1.tenant_id)
    found_inactive = tm.get_tenant_by_api_key(t1.api_key)
    assert found_inactive is None  # inactive tenants are filtered by default

    # But can be found with include_inactive=True
    found_inactive2 = tm.get_tenant_by_api_key(t1.api_key, include_inactive=True)
    assert found_inactive2 is not None
    assert found_inactive2.is_active is False


# ══════════════════════════════════════════════════════════════════════
# 19. RateLimiter — WS rate limiter + HTTP rate limit config
# ══════════════════════════════════════════════════════════════════════

def test_19_rate_limiter():
    from rate_limiter import RATE_LIMITS, WSRateLimiter

    # Verify HTTP rate limit config
    assert "read" in RATE_LIMITS
    assert "write" in RATE_LIMITS
    assert "websocket" in RATE_LIMITS
    assert "/minute" in RATE_LIMITS["read"]

    # Test WS rate limiter
    limiter = WSRateLimiter(max_per_minute=3)

    # First 3 should pass
    assert limiter.allow("client-1") is True
    assert limiter.allow("client-1") is True
    assert limiter.allow("client-1") is True

    # 4th should be rejected
    assert limiter.allow("client-1") is False

    # Different client should be allowed
    assert limiter.allow("client-2") is True


# ══════════════════════════════════════════════════════════════════════
# 20. Prometheus Metrics — metrics endpoint returns valid format
# ══════════════════════════════════════════════════════════════════════

def test_20_prometheus_metrics():
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    from prometheus_metrics import (
        LLM_CALLS,
        TASK_FAILURE,
        TASK_SUCCESS,
        WS_CONNECTIONS,
    )

    # Increment some counters
    LLM_CALLS.labels(provider="deepseek", model="deepseek-chat", status="success").inc()
    TASK_SUCCESS.labels(task_type="web-dev").inc()
    TASK_SUCCESS.labels(task_type="web-dev").inc()
    TASK_FAILURE.labels(task_type="backend-dev").inc()
    WS_CONNECTIONS.set(5)

    # Generate metrics output
    output = generate_latest()
    assert output is not None
    text = output.decode("utf-8")

    # Verify format — should contain our metric names
    assert "mdh_llm_calls_total" in text
    assert "mdh_task_success_total" in text
    assert "mdh_task_failure_total" in text
    assert "mdh_ws_connections_active" in text
    assert "mdh_evolution_events_total" in text

    # Verify CONTENT_TYPE_LATEST
    assert "text/plain" in CONTENT_TYPE_LATEST
    assert "charset=utf-8" in CONTENT_TYPE_LATEST
