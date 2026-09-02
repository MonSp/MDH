"""v0.3.2 Extended Benchmarks

Additional benchmarks for subsystems not covered by v0.3.1 baseline:
- Evolution pipeline end-to-end
- LLM distillation overhead
- Multi-tenant query isolation
- Prometheus metrics under load
- WebSocket message validation
- Concurrent evolution events
"""

import json
import os
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RESULTS_PATH = os.path.join(DATA_DIR, "benchmark_baseline_v0.3.2_extended.json")

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
    ]
}

# Collect all benchmark results
_benchmark_results = {}


def _percentile(sorted_data, p):
    idx = int(len(sorted_data) * p)
    return sorted_data[min(idx, len(sorted_data) - 1)]


def _record(name, times_ms, threshold_avg, threshold_p95):
    avg = sum(times_ms) / len(times_ms)
    p95 = _percentile(sorted(times_ms), 0.95)
    result = {
        "name": name,
        "iterations": len(times_ms),
        "avg_ms": round(avg, 3),
        "p95_ms": round(p95, 3),
        "min_ms": round(min(times_ms), 3),
        "max_ms": round(max(times_ms), 3),
        "threshold_avg_ms": threshold_avg,
        "threshold_p95_ms": threshold_p95,
    }
    _benchmark_results[name] = result
    assert avg < threshold_avg, f"{name} avg {avg:.3f}ms exceeds {threshold_avg}ms threshold"
    assert p95 < threshold_p95, f"{name} p95 {p95:.3f}ms exceeds {threshold_p95}ms threshold"
    return result


# ══════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture
def routing_file(tmp_path):
    path = str(tmp_path / "routing_table.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False)
    return path


@pytest.fixture
def evolution_store(tmp_path):
    from evolution_events import EvolutionEventStore
    db_path = str(tmp_path / "evolution_ext.db")
    return EvolutionEventStore(db_path=db_path)


@pytest.fixture
def extractor(tmp_path):
    from experience_extractor import ExperienceExtractor
    inc_dir = str(tmp_path / "incremental")
    return ExperienceExtractor(incremental_dir=inc_dir)


# ══════════════════════════════════════════════════════════════════════
# 1. Evolution pipeline end-to-end
# ══════════════════════════════════════════════════════════════════════

def test_01_evolution_pipeline_e2e(extractor, evolution_store, routing_file):
    """Evolution pipeline: extract_from_meeting → record_event → update_stats

    Target: < 100ms total pipeline latency
    """
    from dynamic_router import DynamicRouter
    from evolution_events import EvolutionEvent, new_event_id

    router = DynamicRouter(routing_table_path=routing_file)

    # Pre-build fixtures for extract_from_meeting
    discussion_results = [
        {
            "parsed_stance": "support",
            "role": "executor",
            "content": "建议采用 React Hooks 模式构建组件，避免 class 组件",
        },
        {
            "parsed_stance": "modify",
            "role": "reviewer",
            "content": "建议增加单元测试覆盖率达到 80%",
        },
    ]
    review_result = {
        "reviewer_feedback": "代码结构清晰，建议优化 re-render 性能",
        "monitor_feedback": "关注首屏加载时间",
    }
    execution_results = [
        {
            "written_files": ["src/App.tsx", "src/App.test.tsx", "src/styles.css"],
            "output": "Successfully created React component with tests",
        }
    ]

    times = []
    for i in range(50):
        start = time.perf_counter()

        # Step 1: Extract rules from meeting
        rules = extractor.extract_from_meeting(
            project_id=f"proj-{i}",
            task_description="实现一个React组件",
            discussion_results=discussion_results,
            review_result=review_result,
            execution_results=execution_results,
        )

        # Step 2: Record evolution event
        event = EvolutionEvent(
            event_id=new_event_id(),
            event_type="rule_created",
            agent_id="agent-executor",
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            details={"count": len(rules)},
            task_id=f"task-{i}",
        )
        evolution_store.record_event(event)

        # Step 3: Update routing stats
        router.update_stats("dept-frontend", success=True)

        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    _record("evolution_pipeline_e2e", times, threshold_avg=100, threshold_p95=200)


# ══════════════════════════════════════════════════════════════════════
# 2. LLM distillation overhead
# ══════════════════════════════════════════════════════════════════════

def test_02_llm_distillation_overhead(extractor):
    """Measure overhead of LLM distillation path.

    Mock LLM call with 500ms simulated latency, compare with template fallback.
    """
    from experience_extractor import ExecutionLog

    log = ExecutionLog(
        task_id="bench-llm",
        agent_id="agent-1",
        task_description="实现一个 React 组件",
        task_type="web-dev",
        status="success",
        steps=[
            {"command": "npm init", "action": "initialize project"},
            {"command": "create component", "action": "write component code"},
            {"command": "npm test", "action": "run tests"},
        ],
        errors=[],
        corrections=[],
        final_output="Successfully created component with hooks",
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    # Template-only path (no LLM)
    template_times = []
    for _ in range(20):
        start = time.perf_counter()
        rules = extractor.extract_from_success(log)
        elapsed = (time.perf_counter() - start) * 1000
        template_times.append(elapsed)

    # LLM path with mocked caller (500ms simulated latency)
    def mock_llm_caller(prompt):
        time.sleep(0.5)  # Simulate 500ms latency
        return json.dumps([
            {
                "trigger_condition": "task_type is web-dev",
                "action": "use React hooks",
                "note": "LLM distilled",
                "rule_type": "success_pattern",
                "keywords": ["react", "hooks"],
            }
        ])

    # Create extractor with LLM caller
    from experience_extractor import ExperienceExtractor
    inc_dir = extractor._incremental_dir
    llm_extractor = ExperienceExtractor(incremental_dir=inc_dir, llm_caller=mock_llm_caller)

    llm_times = []
    for _ in range(5):
        start = time.perf_counter()
        rules = llm_extractor.extract_from_success(log)
        elapsed = (time.perf_counter() - start) * 1000
        llm_times.append(elapsed)

    avg_template = sum(template_times) / len(template_times)
    avg_llm = sum(llm_times) / len(llm_times)
    overhead = avg_llm - avg_template

    _benchmark_results["llm_distillation_overhead"] = {
        "name": "llm_distillation_overhead",
        "template_avg_ms": round(avg_template, 3),
        "llm_avg_ms": round(avg_llm, 3),
        "overhead_ms": round(overhead, 3),
    }

    # The overhead should be roughly 500ms (the simulated latency)
    assert overhead > 400, f"Expected LLM overhead > 400ms, got {overhead:.1f}ms"
    assert avg_template < 10, f"Template path should be < 10ms, got {avg_template:.1f}ms"


# ══════════════════════════════════════════════════════════════════════
# 3. Multi-tenant query isolation
# ══════════════════════════════════════════════════════════════════════

def test_03_multi_tenant_query_isolation(tmp_path):
    """Measure tenant filtering overhead.

    Create 10 tenants with 50 projects each, query for one tenant vs all.
    """
    from tenant_manager import TenantManager

    data_dir = str(tmp_path / "tenant_data")
    os.makedirs(data_dir, exist_ok=True)
    manager = TenantManager(data_dir)

    # Create 10 tenants
    tenants = []
    for i in range(10):
        tenant = manager.create_tenant(name=f"Tenant-{i}", description=f"Test tenant {i}")
        tenants.append(tenant)

    # Measure single-tenant lookup
    single_times = []
    for _ in range(100):
        for t in tenants[:1]:  # First tenant only
            start = time.perf_counter()
            result = manager.get_tenant(t.tenant_id)
            elapsed = (time.perf_counter() - start) * 1000
            single_times.append(elapsed)
            assert result is not None

    # Measure list_all (no tenant filter)
    list_times = []
    for _ in range(100):
        start = time.perf_counter()
        all_tenants = manager.list_tenants()
        elapsed = (time.perf_counter() - start) * 1000
        list_times.append(elapsed)
        assert len(all_tenants) == 10

    # Measure API-key based lookup
    api_times = []
    for _ in range(100):
        for t in tenants:
            start = time.perf_counter()
            result = manager.get_tenant_by_api_key(t.api_key)
            elapsed = (time.perf_counter() - start) * 1000
            api_times.append(elapsed)

    avg_single = sum(single_times) / len(single_times)
    avg_list = sum(list_times) / len(list_times)
    avg_api = sum(api_times) / len(api_times)
    overhead = avg_list - avg_single

    _benchmark_results["tenant_isolation"] = {
        "name": "tenant_isolation",
        "single_lookup_avg_ms": round(avg_single, 3),
        "list_all_avg_ms": round(avg_list, 3),
        "api_key_lookup_avg_ms": round(avg_api, 3),
        "isolation_overhead_ms": round(overhead, 3),
    }

    # All lookups should be fast
    assert avg_single < 5, f"Single tenant lookup avg {avg_single:.3f}ms exceeds 5ms"
    assert avg_list < 10, f"List all avg {avg_list:.3f}ms exceeds 10ms"
    assert avg_api < 5, f"API key lookup avg {avg_api:.3f}ms exceeds 5ms"


# ══════════════════════════════════════════════════════════════════════
# 4. Prometheus metrics generation under load
# ══════════════════════════════════════════════════════════════════════

def test_04_prometheus_metrics_under_load():
    """Measure metrics generation time as metric count grows.

    Generate 1000 LLM calls + 1000 task completions worth of metrics.
    Target: < 5ms for generate_latest().
    """
    from prometheus_client import generate_latest

    from prometheus_metrics import (
        EVOLUTION_EVENTS,
        LLM_CACHE_HITS,
        LLM_CACHE_MISSES,
        LLM_CALLS,
        LLM_TOKENS,
        SKILL_LEVEL_UPS,
        TASK_FAILURE,
        TASK_SUCCESS,
        WS_CONNECTIONS,
        WS_MESSAGES,
        XP_GRANTED,
    )

    # Simulate 1000 LLM calls with various providers/models
    providers = ["deepseek", "openai", "anthropic", "gemini"]
    models = ["chat", "coder", "analyst"]
    statuses = ["success", "error", "timeout"]

    for i in range(1000):
        p = providers[i % len(providers)]
        m = models[i % len(models)]
        s = statuses[i % len(statuses)]
        LLM_CALLS.labels(provider=p, model=m, status=s).inc()
        LLM_TOKENS.labels(provider=p, model=m, direction="input").inc(100)
        LLM_TOKENS.labels(provider=p, model=m, direction="output").inc(50)
        if i % 3 == 0:
            LLM_CACHE_HITS.inc()
        else:
            LLM_CACHE_MISSES.inc()

    # Simulate 1000 task completions
    task_types = ["web-dev", "backend-dev", "data-analysis", "devops", "testing"]
    for i in range(1000):
        tt = task_types[i % len(task_types)]
        if i % 4 == 0:
            TASK_FAILURE.labels(task_type=tt).inc()
        else:
            TASK_SUCCESS.labels(task_type=tt).inc()

    # Evolution events
    event_types = ["xp_granted", "rule_created", "rule_evolved", "rule_approved"]
    for et in event_types:
        for _ in range(100):
            EVOLUTION_EVENTS.labels(event_type=et).inc()

    XP_GRANTED.inc(5000)
    SKILL_LEVEL_UPS.inc(200)
    WS_CONNECTIONS.set(42)
    WS_MESSAGES.labels(direction="inbound").inc(2000)
    WS_MESSAGES.labels(direction="outbound").inc(3000)

    # Benchmark generate_latest
    times = []
    for _ in range(100):
        start = time.perf_counter()
        output = generate_latest()
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        assert len(output) > 0

    _record("prometheus_metrics_under_load", times, threshold_avg=5, threshold_p95=10)


# ══════════════════════════════════════════════════════════════════════
# 5. WebSocket message validation
# ══════════════════════════════════════════════════════════════════════

def test_05_ws_message_validation():
    """Measure Pydantic validation overhead for WS messages.

    Validate user_message (simple) and start_meeting (complex with arrays).
    Target: < 1ms per message.
    """
    from ws_schemas import validate_ws_message

    simple_msg = {
        "type": "user_message",
        "content": "Hello, I need help with a React component",
    }

    complex_msg = {
        "type": "start_meeting",
        "content": "设计并开发一个全栈 Web 应用",
        "selected_roles": ["coordinator", "planner", "executor", "reviewer", "monitor"],
        "role_locations": {
            "coordinator": "local",
            "planner": "remote",
            "executor": "local",
            "reviewer": "remote",
            "monitor": "local",
        },
        "workspace_type": "standalone",
        "provider": "deepseek",
        "max_iterations": 3,
    }

    # Simple message validation
    simple_times = []
    for _ in range(500):
        start = time.perf_counter()
        result = validate_ws_message(simple_msg)
        elapsed = (time.perf_counter() - start) * 1000
        simple_times.append(elapsed)

    # Complex message validation
    complex_times = []
    for _ in range(500):
        start = time.perf_counter()
        result = validate_ws_message(complex_msg)
        elapsed = (time.perf_counter() - start) * 1000
        complex_times.append(elapsed)

    # Mixed batch validation
    mixed_msgs = [simple_msg, complex_msg]
    batch_times = []
    for _ in range(50):
        for msg in mixed_msgs:
            start = time.perf_counter()
            validate_ws_message(msg)
            elapsed = (time.perf_counter() - start) * 1000
            batch_times.append(elapsed)

    avg_simple = sum(simple_times) / len(simple_times)
    avg_complex = sum(complex_times) / len(complex_times)
    avg_batch = sum(batch_times) / len(batch_times)

    _benchmark_results["ws_validation"] = {
        "name": "ws_validation",
        "simple_msg_avg_ms": round(avg_simple, 4),
        "complex_msg_avg_ms": round(avg_complex, 4),
        "batch_avg_ms": round(avg_batch, 4),
    }

    assert avg_simple < 1, f"Simple msg validation avg {avg_simple:.3f}ms exceeds 1ms"
    assert avg_complex < 1, f"Complex msg validation avg {avg_complex:.3f}ms exceeds 1ms"


# ══════════════════════════════════════════════════════════════════════
# 6. Concurrent evolution events
# ══════════════════════════════════════════════════════════════════════

def test_06_concurrent_evolution_events(tmp_path):
    """Measure thread safety: 4 threads × 25 events = 100 total.

    Verify all 100 events recorded. Target: < 500ms total.
    """
    from evolution_events import EvolutionEvent, EvolutionEventStore, new_event_id

    db_path = str(tmp_path / "concurrent_evolution.db")
    store = EvolutionEventStore(db_path=db_path)

    results = {"success": 0, "errors": []}
    lock = threading.Lock()
    barrier = threading.Barrier(4)

    def write_events(thread_id, count):
        try:
            barrier.wait(timeout=5)  # Synchronize start
            for i in range(count):
                store.record_event(EvolutionEvent(
                    event_id=new_event_id(),
                    event_type="xp_granted",
                    agent_id=f"agent-{thread_id}",
                    timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    details={"xp_gained": i, "thread": thread_id},
                    task_id=f"task-{thread_id}-{i}",
                ))
            with lock:
                results["success"] += count
        except Exception as e:
            with lock:
                results["errors"].append(str(e))

    start = time.perf_counter()

    threads = []
    for t in range(4):
        th = threading.Thread(target=write_events, args=(t, 25))
        threads.append(th)
        th.start()

    for th in threads:
        th.join(timeout=30)

    elapsed = (time.perf_counter() - start) * 1000

    # Verify all events recorded
    timeline = store.get_timeline(limit=200)
    actual_count = len(timeline)

    _benchmark_results["concurrent_evolution_events"] = {
        "name": "concurrent_evolution_events",
        "total_elapsed_ms": round(elapsed, 3),
        "events_written": results["success"],
        "events_verified": actual_count,
        "errors": results["errors"],
    }

    assert results["success"] == 100, f"Expected 100 events, wrote {results['success']}"
    assert actual_count >= 100, f"Expected >= 100 events in DB, found {actual_count}"
    assert len(results["errors"]) == 0, f"Errors: {results['errors']}"
    assert elapsed < 500, f"Total time {elapsed:.1f}ms exceeds 500ms"


# ══════════════════════════════════════════════════════════════════════
# Save results (session-scoped fixture)
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True, scope="session")
def _save_benchmark_results(request):
    yield
    os.makedirs(DATA_DIR, exist_ok=True)
    output = {
        "version": "v0.3.2_extended",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "python_version": sys.version,
        "benchmarks": _benchmark_results,
    }
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
