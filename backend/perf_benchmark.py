"""
性能基准测试 — 系统级指标测量

测量：
1. LLM 缓存命中率（重复/相似/唯一 prompt）
2. SQLite 读写延迟
3. DynamicRouter 路由延迟
4. 会话快照读写延迟
5. Artifact 存储读写延迟
6. 并发安全（多线程/多协程）

用法：
    python perf_benchmark.py
    python perf_benchmark.py --category cache
"""

import asyncio
import json
import os
import statistics
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List

sys.path.insert(0, os.path.dirname(__file__))


@dataclass
class BenchResult:
    name: str
    iterations: int = 0
    total_ms: float = 0.0
    avg_ms: float = 0.0
    p50_ms: float = 0.0
    p95_ms: float = 0.0
    p99_ms: float = 0.0
    ops_per_sec: float = 0.0
    details: Dict = field(default_factory=dict)


def run_bench(name: str, fn: Callable, iterations: int = 1000) -> BenchResult:
    """运行微基准测试"""
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        fn()
        elapsed = (time.perf_counter() - start) * 1000  # ms
        times.append(elapsed)

    times.sort()
    total = sum(times)
    return BenchResult(
        name=name,
        iterations=iterations,
        total_ms=round(total, 2),
        avg_ms=round(statistics.mean(times), 3),
        p50_ms=round(times[len(times) // 2], 3),
        p95_ms=round(times[int(len(times) * 0.95)], 3),
        p99_ms=round(times[int(len(times) * 0.99)], 3),
        ops_per_sec=round(1000 / statistics.mean(times), 0) if statistics.mean(times) > 0 else 0,
    )


def run_async_bench(name: str, fn: Callable, iterations: int = 100) -> BenchResult:
    """运行异步微基准测试"""
    async def _run():
        times = []
        for _ in range(iterations):
            start = time.perf_counter()
            await fn()
            elapsed = (time.perf_counter() - start) * 1000
            times.append(elapsed)
        return times

    times = asyncio.get_event_loop().run_until_complete(_run())
    total = sum(times)
    return BenchResult(
        name=name,
        iterations=iterations,
        total_ms=round(total, 2),
        avg_ms=round(statistics.mean(times), 3),
        p50_ms=round(times[len(times) // 2], 3),
        p95_ms=round(times[int(len(times) * 0.95)], 3),
        p99_ms=round(times[int(len(times) * 0.99)], 3),
        ops_per_sec=round(1000 / statistics.mean(times), 0) if statistics.mean(times) > 0 else 0,
    )


# ── 基准测试用例 ──

def bench_cache_put_get():
    """LLM 缓存 put + get"""
    from llm_cache import LLMCache
    cache = LLMCache()
    for i in range(100):
        cache.put(f"prompt-{i}", f"response-{i}")
    for i in range(100):
        cache.get(f"prompt-{i}")


def bench_cache_hit_rate():
    """LLM 缓存命中率（重复 prompt）"""
    from llm_cache import LLMCache
    cache = LLMCache()
    cache.put("common prompt", "response")
    hits = sum(1 for _ in range(100) if cache.get("common prompt") is not None)
    return hits


def bench_cache_normalization():
    """LLM 缓存语义规范化"""
    from llm_cache import normalize_prompt
    for i in range(100):
        normalize_prompt(f"任务在 2026-08-{i+1:02d}T10:00:00 完成，UUID: 550e8400-e29b-41d4-a716-446655440000")


def bench_sqlite_write():
    """SQLite 写入延迟"""
    from session_persistence import SessionPersistence
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        sp = SessionPersistence(db_path=os.path.join(tmp, "bench.db"))
        for i in range(100):
            sp.save_snapshot(f"session-{i}", {"data": f"value-{i}", "timestamp": time.time()})


def bench_sqlite_read():
    """SQLite 读取延迟"""
    from session_persistence import SessionPersistence
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        sp = SessionPersistence(db_path=os.path.join(tmp, "bench.db"))
        for i in range(100):
            sp.save_snapshot(f"session-{i}", {"data": f"value-{i}"})
        for i in range(100):
            sp.load_snapshot(f"session-{i}")


def bench_routing():
    """DynamicRouter 路由延迟"""
    from dynamic_router import DynamicRouter
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "routing.json")
        router = DynamicRouter(path)
        messages = [
            "前端开发任务",
            "后端API实现",
            "测试用例编写",
            "部署到生产环境",
            "数据库设计和优化",
            "用户界面设计",
        ]
        for msg in messages:
            router.route(msg)


def bench_artifact_write():
    """Artifact 存储写入延迟"""
    from artifact_store import ArtifactStore
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "src"), exist_ok=True)
        for i in range(5):
            with open(os.path.join(tmp, "src", f"f{i}.py"), "w") as f:
                f.write(f"# file {i}\nprint('hello')\n")
        store = ArtifactStore(tmp)
        for i in range(50):
            store.save_artifacts(f"task-{i}", f"agent-{i}", [f"src/f{i % 5}.py"])


def bench_artifact_read():
    """Artifact 存储读取延迟"""
    from artifact_store import ArtifactStore
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "src"), exist_ok=True)
        with open(os.path.join(tmp, "src", "main.py"), "w") as f:
            f.write("print('hello')\n" * 100)
        store = ArtifactStore(tmp)
        refs = store.save_artifacts("task-1", "agent-1", ["src/main.py"])
        for _ in range(100):
            store.read_artifact_content(refs[0])


def bench_concurrent_cache():
    """并发缓存安全（多线程）"""
    from llm_cache import LLMCache
    cache = LLMCache()
    errors = []

    def writer(tid):
        try:
            for i in range(50):
                cache.put(f"t{tid}-p{i}", f"r{tid}-{i}")
        except Exception as e:
            errors.append(e)

    def reader(tid):
        try:
            for i in range(50):
                cache.get(f"t{tid}-p{i}")
        except Exception as e:
            errors.append(e)

    threads = []
    for tid in range(4):
        threads.append(threading.Thread(target=writer, args=(tid,)))
        threads.append(threading.Thread(target=reader, args=(tid,)))
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return len(errors)


def bench_concurrent_db():
    """并发 SQLite 安全"""
    from session_persistence import SessionPersistence
    import tempfile
    errors = []
    with tempfile.TemporaryDirectory() as tmp:
        sp = SessionPersistence(db_path=os.path.join(tmp, "bench.db"))

        def writer(tid):
            try:
                for i in range(20):
                    sp.save_snapshot(f"t{tid}-s{i}", {"data": i})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(t,)) for t in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    return len(errors)


# ── 测试套件 ──

ALL_BENCHES = {
    "cache": [
        ("LLM 缓存 put+get (100次)", bench_cache_put_get, 1000),
        ("LLM 缓存语义规范化 (100次)", bench_cache_normalization, 1000),
    ],
    "database": [
        ("SQLite 写入 (100条)", bench_sqlite_write, 100),
        ("SQLite 读取 (100条)", bench_sqlite_read, 100),
    ],
    "routing": [
        ("DynamicRouter 路由 (6条消息)", bench_routing, 1000),
    ],
    "artifact": [
        ("Artifact 写入 (50条)", bench_artifact_write, 100),
        ("Artifact 读取 (100次)", bench_artifact_read, 100),
    ],
    "concurrency": [
        ("并发缓存安全 (8线程×50次)", bench_concurrent_cache, 100),
        ("并发 SQLite 安全 (4线程×20次)", bench_concurrent_db, 100),
    ],
}


def format_result(r: BenchResult) -> str:
    return (f"  {r.name:<40} avg={r.avg_ms:>8.3f}ms  p50={r.p50_ms:>8.3f}ms  "
            f"p95={r.p95_ms:>8.3f}ms  ops/s={r.ops_per_sec:>8.0f}")


def format_concurrent_result(name: str, errors: int, elapsed_ms: float) -> str:
    status = "✅ PASS" if errors == 0 else f"❌ {errors} errors"
    return f"  {name:<40} {status}  ({elapsed_ms:.1f}ms)"


def run_all(category: str = ""):
    """运行所有性能基准"""
    print("=" * 80)
    print("MDH 性能基准测试")
    print("=" * 80)

    categories = {category: ALL_BENCHES[category]} if category and category in ALL_BENCHES else ALL_BENCHES

    for cat_name, benches in categories.items():
        print(f"\n## {cat_name.upper()}")
        for name, fn, iters in benches:
            if "并发" in name:
                start = time.perf_counter()
                errors = fn()
                elapsed = (time.perf_counter() - start) * 1000
                print(format_concurrent_result(name, errors, elapsed))
            else:
                result = run_bench(name, fn, iters)
                print(format_result(result))

    print("\n" + "=" * 80)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="MDH 性能基准测试")
    parser.add_argument("--category", choices=list(ALL_BENCHES.keys()), help="运行指定类别")
    args = parser.parse_args()
    run_all(category=args.category or "")
