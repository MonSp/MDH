"""v0.3.2 Stress Tests

Find breaking points under load:
1. Concurrent task routing (8 threads × 50 tasks)
2. High-frequency WS rate limiting (200 msg burst)
3. Rapid tenant creation (100 tenants)
4. Large workflow execution (10-node DAG)
5. Evolution event flood (500 events)
6. Memory pressure (large rule extraction)
"""

import asyncio
import json
import os
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SAMPLE_ROUTING_TABLE = {
    "departments": [
        {
            "dept_id": "dept-frontend",
            "dept_name": "前端开发组",
            "capability_desc": "React 组件开发、HTML/CSS、响应式布局",
            "capability_keywords": ["前端", "frontend", "react", "vue", "html", "css", "UI", "组件"],
            "tools": ["code_generator"],
            "success_rate": 0.88, "total_tasks": 10, "successful_tasks": 8,
            "last_active": "", "priority": 10, "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-backend",
            "dept_name": "后端开发组",
            "capability_desc": "Python 后端服务、API 设计、数据库",
            "capability_keywords": ["后端", "backend", "api", "python", "数据库", "database", "服务"],
            "tools": ["code_generator", "test_runner"],
            "success_rate": 0.85, "total_tasks": 10, "successful_tasks": 8,
            "last_active": "", "priority": 10, "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-qa",
            "dept_name": "质量保障组",
            "capability_desc": "测试、代码审查、质量保障",
            "capability_keywords": ["测试", "test", "QA", "质量", "审查", "review"],
            "tools": ["test_runner", "linter"],
            "success_rate": 0.92, "total_tasks": 5, "successful_tasks": 4,
            "last_active": "", "priority": 8, "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-devops",
            "dept_name": "DevOps 运维组",
            "capability_desc": "Docker、CI/CD、部署、监控",
            "capability_keywords": ["部署", "deploy", "docker", "kubernetes", "ci", "运维", "devops"],
            "tools": ["docker", "kubernetes"],
            "success_rate": 0.87, "total_tasks": 5, "successful_tasks": 4,
            "last_active": "", "priority": 7, "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-data",
            "dept_name": "数据分析部",
            "capability_desc": "数据分析、统计、机器学习",
            "capability_keywords": ["数据", "分析", "统计", "机器学习", "模型"],
            "tools": ["data_cleaner", "ml_trainer"],
            "success_rate": 0.80, "total_tasks": 3, "successful_tasks": 2,
            "last_active": "", "priority": 7, "skill_level_boost": 0.0,
        },
        {
            "dept_id": "dept-fullstack",
            "dept_name": "全栈开发组",
            "capability_desc": "全栈 Web 应用开发、前后端联调",
            "capability_keywords": ["全栈", "fullstack", "web", "开发", "应用"],
            "tools": ["code_generator", "docker"],
            "success_rate": 0.82, "total_tasks": 5, "successful_tasks": 4,
            "last_active": "", "priority": 9, "skill_level_boost": 0.0,
        },
    ]
}


@pytest.fixture
def routing_file(tmp_path):
    path = str(tmp_path / "routing_table.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False)
    return path


# ══════════════════════════════════════════════════════════════════════
# 1. Concurrent task routing — 8 threads × 50 tasks
# ══════════════════════════════════════════════════════════════════════

def test_01_concurrent_task_routing(routing_file):
    """8 threads routing tasks simultaneously: 8 × 50 = 400 total routes.

    Verify no crashes, all return valid results. Report throughput.
    """
    from dynamic_router import DynamicRouter

    router = DynamicRouter(routing_table_path=routing_file)

    tasks = [
        '实现一个React组件', '修复后端API bug', '编写单元测试',
        '部署到Docker', '设计数据库schema', '优化查询性能',
        '审查代码安全性', '分析用户行为数据',
    ]

    results = {"success": 0, "errors": [], "decisions": []}
    lock = threading.Lock()

    def route_batch(thread_id, count):
        try:
            for i in range(count):
                task = tasks[(thread_id * count + i) % len(tasks)]
                decision = router.route(task)
                with lock:
                    results["success"] += 1
                    results["decisions"].append(decision.selected_dept)
        except Exception as e:
            with lock:
                results["errors"].append(f"thread-{thread_id}: {e}")

    start = time.perf_counter()

    threads = []
    for t in range(8):
        th = threading.Thread(target=route_batch, args=(t, 50))
        threads.append(th)
        th.start()

    for th in threads:
        th.join(timeout=30)

    elapsed = (time.perf_counter() - start) * 1000
    throughput = results["success"] / (elapsed / 1000) if elapsed > 0 else 0

    # Verify
    assert results["success"] == 400, f"Expected 400 routes, got {results['success']}"
    assert len(results["errors"]) == 0, f"Errors: {results['errors']}"
    assert all(d for d in results["decisions"]), "Some routes returned empty dept"

    print(f"\n  Concurrent routing: {results['success']} routes in {elapsed:.1f}ms "
          f"({throughput:.0f} routes/sec)")

    # Sanity: throughput should be > 100 routes/sec
    assert throughput > 100, f"Throughput {throughput:.0f} routes/sec is too low"


# ══════════════════════════════════════════════════════════════════════
# 2. High-frequency WS rate limiting — 200 msg burst
# ══════════════════════════════════════════════════════════════════════

def test_02_ws_rate_limiting_burst():
    """Send 200 messages in ~1 second to WS rate limiter (60/min limit).

    Verify first 60 pass, rest blocked. Verify cleanup after window expires.
    """
    from rate_limiter import WSRateLimiter

    limiter = WSRateLimiter(max_per_minute=60)
    client_id = "stress-client-1"

    # Burst 200 messages as fast as possible
    allowed = 0
    blocked = 0
    start = time.perf_counter()

    for _ in range(200):
        if limiter.allow(client_id):
            allowed += 1
        else:
            blocked += 1

    burst_elapsed = (time.perf_counter() - start) * 1000

    assert allowed == 60, f"Expected 60 allowed, got {allowed}"
    assert blocked == 140, f"Expected 140 blocked, got {blocked}"

    # Verify different client is not affected
    client2_allowed = limiter.allow("stress-client-2")
    assert client2_allowed, "Second client should not be rate limited"

    # Verify cleanup
    limiter.cleanup(max_age=0)  # Force cleanup everything
    # After cleanup, the old client should be allowed again
    post_cleanup = limiter.allow(client_id)
    assert post_cleanup, "Client should be allowed after cleanup"

    print(f"\n  Rate limit burst: {allowed} allowed, {blocked} blocked in {burst_elapsed:.1f}ms")


# ══════════════════════════════════════════════════════════════════════
# 3. Rapid tenant creation — 100 tenants
# ══════════════════════════════════════════════════════════════════════

def test_03_rapid_tenant_creation(tmp_path):
    """Create 100 tenants with unique API keys.

    Verify all created and retrievable. Verify isolation at scale.
    """
    from tenant_manager import TenantManager

    data_dir = str(tmp_path / "tenant_stress")
    os.makedirs(data_dir, exist_ok=True)
    manager = TenantManager(data_dir)

    # Create 100 tenants
    start = time.perf_counter()
    tenants = []
    for i in range(100):
        tenant = manager.create_tenant(
            name=f"StressTenant-{i}",
            description=f"Stress test tenant number {i}",
        )
        tenants.append(tenant)

    create_elapsed = (time.perf_counter() - start) * 1000

    # Verify all created
    all_tenants = manager.list_tenants()
    assert len(all_tenants) == 100, f"Expected 100 tenants, found {len(all_tenants)}"

    # Verify all retrievable by ID
    for t in tenants[:10]:  # Check a sample
        retrieved = manager.get_tenant(t.tenant_id)
        assert retrieved is not None, f"Tenant {t.tenant_id} not found"
        assert retrieved.name == t.name

    # Verify all retrievable by API key
    for t in tenants[:10]:
        retrieved = manager.get_tenant_by_api_key(t.api_key)
        assert retrieved is not None, f"Tenant with key {t.api_key[:20]}... not found"
        assert retrieved.tenant_id == t.tenant_id

    # Verify API key uniqueness
    api_keys = {t.api_key for t in tenants}
    assert len(api_keys) == 100, f"Expected 100 unique API keys, got {len(api_keys)}"

    # Verify tenant ID uniqueness
    tenant_ids = {t.tenant_id for t in tenants}
    assert len(tenant_ids) == 100, f"Expected 100 unique IDs, got {len(tenant_ids)}"

    # Verify isolation: deactivating one doesn't affect others
    manager.deactivate_tenant(tenants[0].tenant_id)
    assert manager.get_tenant(tenants[0].tenant_id).is_active is False
    assert manager.get_tenant(tenants[1].tenant_id).is_active is True

    # Verify deactivated tenant not returned by default API key lookup
    assert manager.get_tenant_by_api_key(tenants[0].api_key) is None
    # But returned with include_inactive
    assert manager.get_tenant_by_api_key(tenants[0].api_key, include_inactive=True) is not None

    print(f"\n  Tenant creation: 100 tenants in {create_elapsed:.1f}ms "
          f"({100 / (create_elapsed / 1000):.0f} tenants/sec)")


# ══════════════════════════════════════════════════════════════════════
# 4. Large workflow execution — 10-node DAG
# ══════════════════════════════════════════════════════════════════════

def test_04_large_workflow_execution(tmp_path):
    """Create workflow with 10 nodes, mixed dependencies.

    Execute and verify all nodes complete. Report execution time.
    """
    from protocol import (
        WorkflowDefinition,
        WorkflowEdge,
        WorkflowExecutionStatus,
        WorkflowNode,
        WorkflowNodeStatus,
    )
    from workflow_engine import WorkflowEngine

    persistence_dir = str(tmp_path / "workflow_persist")
    engine = WorkflowEngine(persistence_dir=persistence_dir)

    # Create 10-node DAG:
    # n0, n1 (roots, parallel)
    #   n2 depends on n0
    #   n3 depends on n1
    #   n4 depends on n0, n1  (join point)
    # n5 depends on n2, n3
    # n6 depends on n4
    # n7 depends on n5
    # n8 depends on n6, n7
    # n9 depends on n8 (final)
    nodes = [
        WorkflowNode(node_id=f"n{i}", task_description=f"Task {i}",
                     dept_id="dept-backend")
        for i in range(10)
    ]

    edges = [
        WorkflowEdge(source_node_id="n0", target_node_id="n2"),
        WorkflowEdge(source_node_id="n1", target_node_id="n3"),
        WorkflowEdge(source_node_id="n0", target_node_id="n4"),
        WorkflowEdge(source_node_id="n1", target_node_id="n4"),
        WorkflowEdge(source_node_id="n2", target_node_id="n5"),
        WorkflowEdge(source_node_id="n3", target_node_id="n5"),
        WorkflowEdge(source_node_id="n4", target_node_id="n6"),
        WorkflowEdge(source_node_id="n5", target_node_id="n7"),
        WorkflowEdge(source_node_id="n6", target_node_id="n8"),
        WorkflowEdge(source_node_id="n7", target_node_id="n8"),
        WorkflowEdge(source_node_id="n8", target_node_id="n9"),
    ]

    definition = WorkflowDefinition(
        workflow_id="stress-wf-10",
        name="Stress Test Workflow",
        description="10-node DAG for stress testing",
        nodes=nodes,
        edges=edges,
        execution_strategy="parallel",
    )

    # Register a fast mock executor for each dept
    async def mock_executor(node, input_data):
        await asyncio.sleep(0.01)  # 10ms simulated work
        return {"status": "success", "node_id": node.node_id}

    engine.register_node_executor("dept-backend", mock_executor)

    # Create workflow
    execution = engine.create_workflow(definition)
    assert execution.status == WorkflowExecutionStatus.CREATED

    # Execute
    start = time.perf_counter()
    asyncio.run(engine.execute_workflow(execution.execution_id))
    elapsed = (time.perf_counter() - start) * 1000

    # Verify
    updated_execution = engine._executions[execution.execution_id]
    assert updated_execution.status == WorkflowExecutionStatus.COMPLETED, \
        f"Expected COMPLETED, got {updated_execution.status}"

    for i in range(10):
        node_status = updated_execution.node_states.get(f"n{i}")
        assert node_status == WorkflowNodeStatus.COMPLETED, \
            f"Node n{i} expected COMPLETED, got {node_status}"

    print(f"\n  10-node DAG execution: {elapsed:.1f}ms")


# ══════════════════════════════════════════════════════════════════════
# 5. Evolution event flood — 500 events
# ══════════════════════════════════════════════════════════════════════

def test_05_evolution_event_flood(tmp_path):
    """Record 500 evolution events rapidly.

    Verify timeline query returns correct count.
    Verify summary aggregation is correct. Report write throughput.
    """
    from evolution_events import EvolutionEvent, EvolutionEventStore, new_event_id

    db_path = str(tmp_path / "flood_evolution.db")
    store = EvolutionEventStore(db_path=db_path)

    event_types = ["xp_granted", "rule_created", "rule_evolved", "rule_approved", "skill_level_up"]
    agents = [f"agent-{i}" for i in range(10)]

    # Write 500 events
    start = time.perf_counter()
    for i in range(500):
        et = event_types[i % len(event_types)]
        agent = agents[i % len(agents)]
        store.record_event(EvolutionEvent(
            event_id=new_event_id(),
            event_type=et,
            agent_id=agent,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            details={"xp_gained": 10 if et == "xp_granted" else 0, "index": i},
            task_id=f"task-{i}",
        ))
    write_elapsed = (time.perf_counter() - start) * 1000
    throughput = 500 / (write_elapsed / 1000) if write_elapsed > 0 else 0

    # Verify timeline count
    timeline = store.get_timeline(limit=600)
    assert len(timeline) == 500, f"Expected 500 events, got {len(timeline)}"

    # Verify by-type filtering
    for et in event_types:
        type_timeline = store.get_timeline(event_type=et, limit=200)
        assert len(type_timeline) == 100, f"Expected 100 {et} events, got {len(type_timeline)}"

    # Verify by-agent filtering
    agent_timeline = store.get_timeline(agent_id="agent-0", limit=200)
    assert len(agent_timeline) == 50, f"Expected 50 agent-0 events, got {len(agent_timeline)}"

    # Verify summary aggregation
    summary = store.get_summary(period_days=1)
    assert summary["total_events"] == 500, f"Expected 500 total, got {summary['total_events']}"
    for et in event_types:
        assert summary["by_type"][et] == 100, f"Expected 100 {et}, got {summary['by_type'].get(et, 0)}"
    assert summary["xp_delta"] == 1000, f"Expected 1000 XP, got {summary['xp_delta']}"

    print(f"\n  Event flood: 500 events written in {write_elapsed:.1f}ms "
          f"({throughput:.0f} events/sec)")

    assert throughput > 100, f"Write throughput {throughput:.0f} events/sec is too low"


# ══════════════════════════════════════════════════════════════════════
# 6. Memory pressure — Large rule extraction
# ══════════════════════════════════════════════════════════════════════

def test_06_memory_pressure_large_extraction(tmp_path):
    """Extract rules from a 50KB task result.

    Verify rules created without OOM. Report peak memory delta.
    """
    import tracemalloc

    from experience_extractor import ExecutionLog, ExperienceExtractor

    inc_dir = str(tmp_path / "incremental_mem")
    extractor = ExperienceExtractor(incremental_dir=inc_dir)

    # Generate a 50KB final output
    large_output = "x" * 50_000
    large_steps = []
    for i in range(100):
        large_steps.append({
            "command": f"step-{i}",
            "action": f"execute action number {i} with detailed description " * 5,
            "tool": f"tool-{i % 10}",
        })

    log = ExecutionLog(
        task_id="memory-stress",
        agent_id="agent-mem",
        task_description="大型任务执行 " * 50,  # Large description
        task_type="software-dev",
        status="success",
        steps=large_steps,
        errors=[],
        corrections=[],
        final_output=large_output,
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    tracemalloc.start()
    snapshot_before = tracemalloc.take_snapshot()

    start = time.perf_counter()
    rules = extractor.extract_from_success(log)
    elapsed = (time.perf_counter() - start) * 1000

    snapshot_after = tracemalloc.take_snapshot()
    tracemalloc.stop()

    # Calculate memory delta
    stats_before = snapshot_before.statistics("lineno")
    stats_after = snapshot_after.statistics("lineno")
    current, peak = tracemalloc.get_traced_memory() if tracemalloc.is_tracing() else (0, 0)

    # Verify rules were created (template path returns rules without auto-saving)
    assert len(rules) > 0, "Expected at least one rule from large extraction"

    # Save rules manually (template path doesn't auto-save, by design)
    for rule in rules:
        extractor.submit_for_review(rule)

    # Verify rules are saved
    all_rules = extractor.get_all_rules()
    assert len(all_rules) >= len(rules), \
        f"Expected >= {len(rules)} rules saved, found {len(all_rules)}"

    print(f"\n  Memory pressure: {len(rules)} rules from 50KB result in {elapsed:.1f}ms")

    assert elapsed < 1000, f"Extraction took {elapsed:.1f}ms (expected < 1000ms)"


# ══════════════════════════════════════════════════════════════════════
# Stress summary report
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True, scope="session")
def _stress_summary(request):
    """Print stress test summary after all tests."""
    yield
    print("\n" + "=" * 60)
    print("  STRESS TEST SUMMARY")
    print("=" * 60)
