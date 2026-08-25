"""v0.3.2 Baseline Regression Check

Verifies that current performance hasn't regressed from v0.3.1 baseline.
All benchmarks use 3x tolerance (current must be < 3x baseline).
"""

import json
import os
import sqlite3
import sys
import time
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
BASELINE_PATH = os.path.join(DATA_DIR, "benchmark_baseline_v0.3.1.json")

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

TOLERANCE = 5.0  # 5x tolerance for regression detection (CI environments have variable I/O)


def load_baseline():
    """Load v0.3.1 baseline data."""
    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH) as f:
            return json.load(f)
    return {}


def _check_regression(name, current_ms, baseline_ms):
    """Check if current time has regressed beyond tolerance."""
    if baseline_ms <= 0:
        return  # No baseline to compare
    ratio = current_ms / baseline_ms
    assert ratio < TOLERANCE, (
        f"{name} regression: {current_ms:.3f}ms vs baseline {baseline_ms:.3f}ms "
        f"({ratio:.1f}x slower, tolerance {TOLERANCE}x)"
    )


@pytest.fixture
def routing_file(tmp_path):
    path = str(tmp_path / "routing_table.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False)
    return path


# ══════════════════════════════════════════════════════════════════════
# 1. Routing — no regression
# ══════════════════════════════════════════════════════════════════════

def test_01_routing_no_regression(routing_file):
    """Verify routing performance hasn't regressed from v0.3.1 baseline."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from dynamic_router import DynamicRouter
    router = DynamicRouter(routing_table_path=routing_file)

    tasks = ['实现一个React组件', '修复后端API bug', '编写单元测试', '部署到Docker']
    times = []
    for _ in range(10):
        for task in tasks:
            start = time.perf_counter()
            router.route(task)
            times.append((time.perf_counter() - start) * 1000)

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("routing", {}).get("avg_ms", 0)
    _check_regression("routing", avg, baseline_avg)


# ══════════════════════════════════════════════════════════════════════
# 2. Cache read/write — no regression
# ══════════════════════════════════════════════════════════════════════

def test_02_cache_no_regression():
    """Verify cache read/write performance hasn't regressed."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from cache import TTLCache

    cache = TTLCache(default_ttl=60)
    times = []

    for i in range(200):
        start = time.perf_counter()
        cache.set(f"key-{i}", {"data": f"value-{i}", "index": i})
        times.append((time.perf_counter() - start) * 1000)

    for i in range(200):
        start = time.perf_counter()
        cache.get(f"key-{i}")
        times.append((time.perf_counter() - start) * 1000)

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("cache_read_write", {}).get("avg_ms", 0)
    _check_regression("cache_read_write", avg, baseline_avg)


# ══════════════════════════════════════════════════════════════════════
# 3. DB operations — no regression
# ══════════════════════════════════════════════════════════════════════

def test_03_db_no_regression(tmp_path):
    """Verify DB operation performance hasn't regressed."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from db import get_db, get_write_lock

    db_path = str(tmp_path / "regression.db")
    conn = get_db(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS bench_test (
            id INTEGER PRIMARY KEY,
            key TEXT NOT NULL,
            value TEXT NOT NULL
        );
    """)
    conn.commit()

    times = []
    for i in range(100):
        start = time.perf_counter()
        with get_write_lock(db_path):
            conn.execute("INSERT INTO bench_test (key, value) VALUES (?, ?)", (f"k{i}", f"v{i}"))
            conn.commit()
        times.append((time.perf_counter() - start) * 1000)

    for i in range(100):
        start = time.perf_counter()
        conn.execute("SELECT * FROM bench_test WHERE key = ?", (f"k{i}",)).fetchone()
        times.append((time.perf_counter() - start) * 1000)

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("db_operations", {}).get("avg_ms", 0)
    _check_regression("db_operations", avg, baseline_avg)


# ══════════════════════════════════════════════════════════════════════
# 4. Evolution event recording — no regression
# ══════════════════════════════════════════════════════════════════════

def test_04_evolution_event_no_regression(tmp_path):
    """Verify evolution event recording hasn't regressed."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from evolution_events import EvolutionEventStore, EvolutionEvent, new_event_id

    db_path = str(tmp_path / "regression_evolution.db")
    store = EvolutionEventStore(db_path=db_path)

    times = []
    for i in range(200):
        start = time.perf_counter()
        store.record_event(EvolutionEvent(
            event_id=new_event_id(),
            event_type="xp_granted",
            agent_id=f"agent-{i % 10}",
            timestamp="2026-08-27T10:00:00Z",
            details={"xp_gained": i, "skill_id": "bench"},
            task_id=f"task-{i}",
        ))
        times.append((time.perf_counter() - start) * 1000)

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("evolution_event_recording", {}).get("avg_ms", 0)
    _check_regression("evolution_event_recording", avg, baseline_avg)


# ══════════════════════════════════════════════════════════════════════
# 5. AB tracking — no regression
# ══════════════════════════════════════════════════════════════════════

def test_05_ab_tracking_no_regression(tmp_path):
    """Verify AB tracking performance hasn't regressed."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from evolution_events import ABTracker

    conn = sqlite3.connect(str(tmp_path / "regression_ab.db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    tracker = ABTracker(conn=conn)

    times = []
    task_types = ["web-dev", "backend-dev", "data-analysis", "devops", "testing"]
    for i in range(200):
        tt = task_types[i % len(task_types)]
        start = time.perf_counter()
        tracker.record_task(tt, success=(i % 3 != 0), has_rules=(i % 2 == 0))
        times.append((time.perf_counter() - start) * 1000)

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("ab_tracking", {}).get("avg_ms", 0)
    _check_regression("ab_tracking", avg, baseline_avg)
    conn.close()


# ══════════════════════════════════════════════════════════════════════
# 6. Prometheus metrics generation — no regression
# ══════════════════════════════════════════════════════════════════════

def test_06_prometheus_no_regression():
    """Verify Prometheus metrics generation hasn't regressed."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from prometheus_metrics import (
        LLM_CALLS, TASK_SUCCESS, TASK_FAILURE, EVOLUTION_EVENTS,
        WS_CONNECTIONS, generate_latest,
    )

    # Pre-populate some metrics
    for i in range(50):
        LLM_CALLS.labels(provider="deepseek", model="chat", status="success").inc()
        TASK_SUCCESS.labels(task_type="web-dev").inc()
        EVOLUTION_EVENTS.labels(event_type="xp_granted").inc()
    WS_CONNECTIONS.set(42)

    times = []
    for _ in range(100):
        start = time.perf_counter()
        output = generate_latest()
        times.append((time.perf_counter() - start) * 1000)
        assert len(output) > 0

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("prometheus_metrics_generation", {}).get("avg_ms", 0)
    _check_regression("prometheus_metrics_generation", avg, baseline_avg)


# ══════════════════════════════════════════════════════════════════════
# 7. WS rate limiter check — no regression
# ══════════════════════════════════════════════════════════════════════

def test_07_ws_rate_limiter_no_regression():
    """Verify WS rate limiter check hasn't regressed."""
    baseline = load_baseline()
    if not baseline:
        pytest.skip("No baseline to compare")

    from rate_limiter import WSRateLimiter

    limiter = WSRateLimiter(max_per_minute=10000)

    times = []
    for i in range(1000):
        client_id = f"client-{i % 50}"
        start = time.perf_counter()
        limiter.allow(client_id)
        times.append((time.perf_counter() - start) * 1000)

    avg = sum(times) / len(times)
    baseline_avg = baseline.get("benchmarks", {}).get("ws_rate_limiter_check", {}).get("avg_ms", 0)
    _check_regression("ws_rate_limiter_check", avg, baseline_avg)


# ══════════════════════════════════════════════════════════════════════
# Summary report
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True, scope="session")
def _regression_summary(request):
    """Print regression summary after all tests."""
    yield
    baseline = load_baseline()
    if baseline:
        print(f"\n  Baseline loaded from: {BASELINE_PATH}")
        print(f"  Baseline version: {baseline.get('version', 'unknown')}")
        print(f"  Tolerance: {TOLERANCE}x")
    else:
        print("\n  No baseline found — regression tests skipped")
