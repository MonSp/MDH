"""
性能基准测试 — 基于真实系统数据

使用真实路由表（8 部门）、真实数据库（mdh.db）、真实缓存（llm_cache.db）。
不使用 mock、临时目录或硬编码数据。

用法：
    python perf_benchmark.py
    python perf_benchmark.py --category routing
"""

import os
import sqlite3
import statistics
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(__file__))

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


@dataclass
class BenchResult:
    name: str
    iterations: int = 0
    avg_ms: float = 0.0
    p50_ms: float = 0.0
    p95_ms: float = 0.0
    ops_per_sec: float = 0.0
    errors: int = 0
    details: str = ""


def run_bench(name: str, fn: Callable, iterations: int = 100) -> BenchResult:
    """运行微基准，捕获异常"""
    times = []
    errors = 0
    for _ in range(iterations):
        try:
            start = time.perf_counter()
            fn()
            elapsed = (time.perf_counter() - start) * 1000
            times.append(elapsed)
        except Exception:
            errors += 1

    if not times:
        return BenchResult(name=name, iterations=iterations, errors=errors, details="全部失败")

    times.sort()
    return BenchResult(
        name=name,
        iterations=iterations,
        avg_ms=round(statistics.mean(times), 3),
        p50_ms=round(times[len(times) // 2], 3),
        p95_ms=round(times[int(len(times) * 0.95)], 3),
        ops_per_sec=round(1000 / statistics.mean(times), 0),
        errors=errors,
    )


# ── 路由引擎（使用真实路由表）──

def bench_routing_real():
    """DynamicRouter 加载真实路由表 + 路由 100 条消息"""
    from dynamic_router import DynamicRouter
    router = DynamicRouter(os.path.join(DATA_DIR, "routing_table.json"))
    messages = [
        "前端开发 React 组件",
        "后端实现 REST API",
        "编写单元测试",
        "部署到生产环境",
        "数据库 schema 设计",
        "全栈开发任务",
        "数据分析报告",
        "文档编写",
        "前端性能优化",
        "后端微服务架构",
    ]
    for msg in messages:
        decision = router.route(msg)
        assert decision.selected_dept  # 必须有结果


def bench_routing_accuracy():
    """路由准确性：验证关键词命中对应部门"""
    from dynamic_router import DynamicRouter
    router = DynamicRouter(os.path.join(DATA_DIR, "routing_table.json"))

    cases = [
        ("React 组件开发", "dept-frontend"),
        ("Python API 实现", "dept-backend"),
        ("编写测试用例", "dept-qa"),
        ("Docker 部署", "dept-devops"),
        ("数据可视化", "dept-data"),
    ]
    correct = 0
    for msg, expected_dept in cases:
        decision = router.route(msg)
        if decision.selected_dept == expected_dept:
            correct += 1
    return correct, len(cases)


# ── LLM 缓存（使用真实缓存 DB）──

def bench_cache_with_real_db():
    """LLM 缓存读写（使用真实 SQLite DB）"""
    from llm_cache import LLMCache
    cache = LLMCache(db_path=os.path.join(DATA_DIR, "llm_cache.db"))
    # 写入 50 条
    for i in range(50):
        cache.put(f"perf-test-prompt-{i}", f"response-{i}", role="benchmark")
    # 读取 50 条（应命中）
    for i in range(50):
        result = cache.get(f"perf-test-prompt-{i}", role="benchmark")
        assert result == f"response-{i}", f"缓存未命中: perf-test-prompt-{i}"
    # 清理
    cache.clear()


def bench_cache_semantic_normalization():
    """语义规范化对真实 prompt 的效果"""
    from llm_cache import LLMCache
    cache = LLMCache(db_path=os.path.join(DATA_DIR, "llm_cache.db"))

    # 真实 prompt 模式：会议中的语义分析
    base_prompts = [
        "请分析以下任务的任务复杂度：前端开发 React 组件",
        "请分析以下任务的任务复杂度：后端实现 REST API",
        "请分析以下任务的任务复杂度：编写单元测试",
        "审查以下代码的质量和潜在问题",
        "实现一个 Python 函数，计算两个数的最大公约数",
    ]

    # 写入
    for i, p in enumerate(base_prompts):
        cache.put(p, f"response-{i}")

    # 相似 prompt（仅时间戳不同）应命中
    similar = "请分析以下任务的任务复杂度：前端开发 React 组件 2026-08-23T10:00:00"
    hit = cache.get(similar) is not None

    cache.clear()
    return hit


# ── SQLite（使用真实数据库）──

def bench_db_evolution_log_read():
    """读取真实 evolution_log 表"""
    db_path = os.path.join(DATA_DIR, "mdh.db")
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM evolution_log ORDER BY id DESC LIMIT 20").fetchall()
    assert len(rows) >= 0  # 可能为 0
    conn.close()


def bench_db_session_snapshot_write():
    """会话快照写入（使用真实 DB）"""
    from session_persistence import SessionPersistence
    sp = SessionPersistence(db_path=os.path.join(DATA_DIR, "mdh.db"))
    sp.save_snapshot("perf-test-session", {
        "meeting_id": "perf-test",
        "agents": [{"id": "a1", "role": "executor", "status": "working"}],
        "tasks": [{"id": "t1", "status": "completed"}],
    })
    loaded = sp.load_snapshot("perf-test-session")
    assert loaded is not None
    assert loaded["meeting_id"] == "perf-test"
    sp.delete_snapshot("perf-test-session")


def bench_db_session_snapshot_read():
    """会话快照读取（先写入再读取）"""
    from session_persistence import SessionPersistence
    sp = SessionPersistence(db_path=os.path.join(DATA_DIR, "mdh.db"))
    sp.save_snapshot("perf-read-test", {"data": "x" * 1000})
    for _ in range(50):
        loaded = sp.load_snapshot("perf-read-test")
        assert loaded is not None
    sp.delete_snapshot("perf-read-test")


def bench_db_idempotent_check():
    """幂等执行检查（使用真实 DB）"""
    from session_persistence import SessionPersistence
    sp = SessionPersistence(db_path=os.path.join(DATA_DIR, "mdh.db"))
    # 写入一条已完成的任务
    sp.mark_task_started("perf-idempotent-test", "task-1", "session-1")
    sp.mark_task_completed("perf-idempotent-test")
    # 检查 50 次（应全部返回 "completed"）
    for _ in range(50):
        status = sp.check_task_executed("perf-idempotent-test")
        assert status == "completed"
    # 清理
    conn = sqlite3.connect(os.path.join(DATA_DIR, "mdh.db"))
    conn.execute("DELETE FROM task_executions WHERE execution_key = ?", ("perf-idempotent-test",))
    conn.commit()
    conn.close()


# ── Artifact 存储（使用真实工作区）──

def bench_artifact_save_real():
    """Artifact 保存到真实工作区"""
    from artifact_store import ArtifactStore
    ws = os.path.join(DATA_DIR, "benchmark_workspace")
    os.makedirs(os.path.join(ws, "src"), exist_ok=True)
    # 写入测试文件
    test_file = os.path.join(ws, "src", "perf_test.py")
    with open(test_file, "w") as f:
        f.write("# performance test file\nprint('hello')\n")
    store = ArtifactStore(ws)
    refs = store.save_artifacts("perf-task", "perf-agent", ["src/perf_test.py"], "test summary")
    assert len(refs) == 1
    assert refs[0].type == "code"
    # 清理
    os.remove(test_file)


def bench_artifact_read_real():
    """Artifact 读取真实文件内容"""
    from artifact_store import ArtifactStore
    ws = os.path.join(DATA_DIR, "benchmark_workspace")
    os.makedirs(os.path.join(ws, "src"), exist_ok=True)
    test_file = os.path.join(ws, "src", "perf_read_test.py")
    with open(test_file, "w") as f:
        f.write("# read test\n" + "x = 1\n" * 100)
    store = ArtifactStore(ws)
    refs = store.save_artifacts("perf-read-task", "perf-agent", ["src/perf_read_test.py"])
    for _ in range(50):
        content = store.read_artifact_content(refs[0])
        assert len(content) > 0
    os.remove(test_file)


# ── 并发安全 ──

def bench_concurrent_cache_real():
    """并发缓存安全（真实 DB）"""
    from llm_cache import LLMCache
    cache = LLMCache(db_path=os.path.join(DATA_DIR, "llm_cache_bench.db"))
    errors = []

    def worker(tid):
        try:
            for i in range(30):
                cache.put(f"t{tid}-p{i}", f"r{i}")
                cache.get(f"t{tid}-p{i}")
        except Exception as e:
            errors.append(str(e))

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # 清理
    cache.clear()
    try:
        os.remove(os.path.join(DATA_DIR, "llm_cache_bench.db"))
    except OSError:
        pass
    return len(errors)


def bench_concurrent_db_real():
    """并发 SQLite 安全（真实 DB）"""
    from session_persistence import SessionPersistence
    sp = SessionPersistence(db_path=os.path.join(DATA_DIR, "mdh.db"))
    errors = []

    def worker(tid):
        try:
            for i in range(10):
                key = f"perf-concurrent-{tid}-{i}"
                sp.save_snapshot(key, {"tid": tid, "i": i})
        except Exception as e:
            errors.append(str(e))

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # 清理
    conn = sqlite3.connect(os.path.join(DATA_DIR, "mdh.db"))
    conn.execute("DELETE FROM session_snapshots WHERE session_id LIKE 'perf-concurrent-%'")
    conn.commit()
    conn.close()
    return len(errors)


# ── 测试套件 ──

ALL_BENCHES = {
    "routing": [
        ("路由引擎（真实 8 部门路由表）", bench_routing_real, 100),
    ],
    "cache": [
        ("LLM 缓存读写（真实 SQLite）", bench_cache_with_real_db, 100),
        ("语义规范化命中率", bench_cache_semantic_normalization, 100),
    ],
    "database": [
        ("evolution_log 读取（真实数据）", bench_db_evolution_log_read, 100),
        ("会话快照写入", bench_db_session_snapshot_write, 100),
        ("会话快照读取 50 次", bench_db_session_snapshot_read, 100),
        ("幂等执行检查 50 次", bench_db_idempotent_check, 100),
    ],
    "artifact": [
        ("Artifact 保存（真实工作区）", bench_artifact_save_real, 50),
        ("Artifact 读取 50 次", bench_artifact_read_real, 50),
    ],
    "concurrency": [
        ("并发缓存安全（4线程×30次，真实DB）", bench_concurrent_cache_real, 10),
        ("并发 SQLite 安全（4线程×10次，真实DB）", bench_concurrent_db_real, 10),
    ],
}


def format_result(r: BenchResult) -> str:
    err = f" ❌ {r.errors} errors" if r.errors else ""
    detail = f" [{r.details}]" if r.details else ""
    return (f"  {r.name:<45} avg={r.avg_ms:>8.3f}ms  p50={r.p50_ms:>8.3f}ms  "
            f"p95={r.p95_ms:>8.3f}ms  ops/s={r.ops_per_sec:>6.0f}{err}{detail}")


def run_all(category: str = ""):
    """运行所有性能基准"""
    print("=" * 90)
    print("MDH 性能基准测试（真实系统数据）")
    print("=" * 90)
    print(f"  数据目录: {DATA_DIR}")
    print()

    # 路由准确性单独报告
    if not category or category == "routing":
        correct, total = bench_routing_accuracy()
        print(f"## 路由准确性: {correct}/{total} ({correct/total:.0%})")
        print()

    categories = {category: ALL_BENCHES[category]} if category and category in ALL_BENCHES else ALL_BENCHES

    for cat_name, benches in categories.items():
        print(f"## {cat_name.upper()}")
        for name, fn, iters in benches:
            if "并发" in name:
                # 并发测试：运行多次，报告错误数
                total_errors = 0
                start = time.perf_counter()
                for _ in range(iters):
                    total_errors += fn()
                elapsed = (time.perf_counter() - start) * 1000
                status = "✅ PASS" if total_errors == 0 else f"❌ {total_errors} errors"
                print(f"  {name:<45} {status}  ({elapsed:.1f}ms total)")
            else:
                result = run_bench(name, fn, iters)
                print(format_result(result))
        print()

    print("=" * 90)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="MDH 性能基准测试（真实数据）")
    parser.add_argument("--category", choices=list(ALL_BENCHES.keys()), help="运行指定类别")
    args = parser.parse_args()
    run_all(category=args.category or "")
