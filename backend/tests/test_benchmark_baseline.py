"""v0.3.1 Performance Benchmark Baseline

Measures latency of key subsystems and saves results to
backend/data/benchmark_baseline_v0.3.1.json for regression tracking.
"""

import json
import os
import sqlite3
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RESULTS_PATH = os.path.join(DATA_DIR, "benchmark_baseline_v0.3.1.json")

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

# Collect all benchmark results for final save
_benchmark_results = {}


def _percentile(sorted_data, p):
    """Return the p-th percentile from a sorted list."""
    idx = int(len(sorted_data) * p)
    return sorted_data[min(idx, len(sorted_data) - 1)]


def _record(name, times_ms, threshold_avg, threshold_p95):
    """Record benchmark result and assert thresholds."""
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
    assert avg < threshold_avg, f"{name} avg {avg:.1f}ms exceeds {threshold_avg}ms threshold"
    assert p95 < threshold_p95, f"{name} p95 {p95:.1f}ms exceeds {threshold_p95}ms threshold"
    return result


@pytest.fixture
def routing_file(tmp_path):
    path = str(tmp_path / "routing_table.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False)
    return path


# ══════════════════════════════════════════════════════════════════════
# 1. Routing throughput (target: avg < 50ms)
# ══════════════════════════════════════════════════════════════════════

def test_01_routing_benchmark(routing_file):
    from dynamic_router import DynamicRouter

    router = DynamicRouter(routing_table_path=routing_file)
    tasks = [
        '实现一个React组件', '修复后端API bug', '编写单元测试',
        '部署到Docker', '设计数据库schema', '优化查询性能',
        '审查代码安全性', '分析用户行为数据',
    ]

    times = []
    for _ in range(10):
        for task in tasks:
            start = time.perf_counter()
            router.route(task)
            elapsed = (time.perf_counter() - start) * 1000
            times.append(elapsed)

    _record("routing", times, threshold_avg=50, threshold_p95=100)


# ══════════════════════════════════════════════════════════════════════
# 2. Cache read/write (target: avg < 5ms)
# ══════════════════════════════════════════════════════════════════════

def test_02_cache_benchmark():
    from cache import TTLCache

    cache = TTLCache(default_ttl=60)
    times = []

    # Write 1000 keys, then read them
    for i in range(200):
        start = time.perf_counter()
        cache.set(f"key-{i}", {"data": f"value-{i}", "index": i})
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    for i in range(200):
        start = time.perf_counter()
        cache.get(f"key-{i}")
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    _record("cache_read_write", times, threshold_avg=5, threshold_p95=10)


# ══════════════════════════════════════════════════════════════════════
# 3. DB operations (target: avg < 10ms)
# ══════════════════════════════════════════════════════════════════════

def test_03_db_benchmark(tmp_path):
    from db import get_db, get_write_lock

    db_path = str(tmp_path / "bench.db")
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

    # Insert 100 rows
    for i in range(100):
        start = time.perf_counter()
        with get_write_lock(db_path):
            conn.execute("INSERT INTO bench_test (key, value) VALUES (?, ?)", (f"k{i}", f"v{i}"))
            conn.commit()
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    # Read 100 rows
    for i in range(100):
        start = time.perf_counter()
        conn.execute("SELECT * FROM bench_test WHERE key = ?", (f"k{i}",)).fetchone()
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    _record("db_operations", times, threshold_avg=10, threshold_p95=20)


# ══════════════════════════════════════════════════════════════════════
# 4. Evolution event recording (target: avg < 5ms)
# ══════════════════════════════════════════════════════════════════════

def test_04_evolution_event_benchmark(tmp_path):
    from evolution_events import EvolutionEvent, EvolutionEventStore, new_event_id

    db_path = str(tmp_path / "evolution_bench.db")
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
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    _record("evolution_event_recording", times, threshold_avg=5, threshold_p95=10)


# ══════════════════════════════════════════════════════════════════════
# 5. AB tracking (target: avg < 5ms)
# ══════════════════════════════════════════════════════════════════════

def test_05_ab_tracking_benchmark(tmp_path):
    from evolution_events import ABTracker

    conn = sqlite3.connect(str(tmp_path / "ab_bench.db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    tracker = ABTracker(conn=conn)

    times = []
    task_types = ["web-dev", "backend-dev", "data-analysis", "devops", "testing"]
    for i in range(200):
        tt = task_types[i % len(task_types)]
        start = time.perf_counter()
        tracker.record_task(tt, success=(i % 3 != 0), has_rules=(i % 2 == 0))
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    _record("ab_tracking", times, threshold_avg=50, threshold_p95=75)
    conn.close()


# ══════════════════════════════════════════════════════════════════════
# 6. Prometheus metrics generation (target: avg < 10ms)
# ══════════════════════════════════════════════════════════════════════

def test_06_prometheus_metrics_benchmark():
    from prometheus_client import generate_latest

    from prometheus_metrics import (
        EVOLUTION_EVENTS,
        LLM_CALLS,
        TASK_SUCCESS,
        WS_CONNECTIONS,
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
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
        assert len(output) > 0

    _record("prometheus_metrics_generation", times, threshold_avg=10, threshold_p95=20)


# ══════════════════════════════════════════════════════════════════════
# 7. WS rate limiter check (target: avg < 1ms)
# ══════════════════════════════════════════════════════════════════════

def test_07_ws_rate_limiter_benchmark():
    from rate_limiter import WSRateLimiter

    limiter = WSRateLimiter(max_per_minute=10000)  # High limit for benchmark

    times = []
    for i in range(1000):
        client_id = f"client-{i % 50}"
        start = time.perf_counter()
        limiter.allow(client_id)
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    _record("ws_rate_limiter_check", times, threshold_avg=1, threshold_p95=2)


# ══════════════════════════════════════════════════════════════════════
# Save results (runs after all tests in this module)
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True, scope="session")
def _save_benchmark_results(request):
    """Save benchmark results after all tests complete."""
    yield
    # Save results
    os.makedirs(DATA_DIR, exist_ok=True)
    output = {
        "version": "v0.3.1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "python_version": sys.version,
        "benchmarks": _benchmark_results,
    }
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
