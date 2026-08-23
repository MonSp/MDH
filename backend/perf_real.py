#!/usr/bin/env python3
"""
真实性能测量 — 启动后端，测量 API 延迟和系统吞吐量
"""
import json
import os
import signal
import subprocess
import statistics
import sys
import time
import urllib.request
import urllib.error
import threading

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN = "perf-test-token"
BASE = "http://localhost:8765"


def api(method, path, data=None, timeout=10):
    url = f"{BASE}{path}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    try:
        if method == "GET":
            req = urllib.request.Request(url, headers=headers)
        else:
            req = urllib.request.Request(url, data=json.dumps(data or {}).encode(), headers=headers, method=method)
        start = time.perf_counter()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
        elapsed_ms = (time.perf_counter() - start) * 1000
        return json.loads(body), elapsed_ms
    except Exception as e:
        return {"error": str(e)}, -1


def measure(name, fn, iterations=50):
    """Run fn() iterations times, report latency stats"""
    times = []
    errors = 0
    for _ in range(iterations):
        try:
            result, elapsed = fn()
            if elapsed > 0:
                times.append(elapsed)
            if isinstance(result, dict) and result.get("error"):
                errors += 1
        except Exception:
            errors += 1

    if not times:
        print(f"  {name:<50} FAILED ({errors} errors)")
        return

    times.sort()
    avg = statistics.mean(times)
    p50 = times[len(times) // 2]
    p95 = times[int(len(times) * 0.95)]
    p99 = times[int(len(times) * 0.99)]
    ops = 1000 / avg if avg > 0 else 0
    err_str = f"  ❌ {errors} errors" if errors else ""
    print(f"  {name:<50} avg={avg:>8.1f}ms  p50={p50:>8.1f}ms  p95={p95:>8.1f}ms  p99={p99:>8.1f}ms  ops/s={ops:>7.0f}{err_str}")


def measure_concurrent(name, fn, concurrency=4, total=100):
    """Run fn() concurrently with concurrency threads"""
    results = []
    errors = []
    lock = threading.Lock()

    def worker():
        for _ in range(total // concurrency):
            try:
                _, elapsed = fn()
                if elapsed > 0:
                    with lock:
                        results.append(elapsed)
                else:
                    with lock:
                        errors.append(1)
            except Exception:
                with lock:
                    errors.append(1)

    threads = [threading.Thread(target=worker) for _ in range(concurrency)]
    wall_start = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall_ms = (time.perf_counter() - wall_start) * 1000

    if not results:
        print(f"  {name:<50} FAILED ({len(errors)} errors)")
        return

    results.sort()
    avg = statistics.mean(results)
    p95 = results[int(len(results) * 0.95)]
    throughput = len(results) / (wall_ms / 1000)
    err_str = f"  ❌ {len(errors)} errors" if errors else ""
    print(f"  {name:<50} avg={avg:>8.1f}ms  p95={p95:>8.1f}ms  throughput={throughput:>7.0f} req/s  wall={wall_ms:>7.0f}ms{err_str}")


def main():
    # Start server — capture stdout to extract the generated token
    print("Starting backend...")
    env = os.environ.copy()
    env["BACKEND_TOKEN"] = TOKEN
    proc = subprocess.Popen(
        [sys.executable, "server.py"],
        cwd=BACKEND_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Wait for ready
    for i in range(30):
        try:
            urllib.request.urlopen(f"{BASE}/health", timeout=2)
            break
        except Exception:
            time.sleep(1)
    else:
        print("❌ Server failed to start")
        proc.kill()
        return 1

    # Verify auth works
    try:
        req = urllib.request.Request(f"{BASE}/api/benchmark/tasks", headers={"Authorization": f"Bearer {TOKEN}"})
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f"❌ Auth verification failed: {e}")
        proc.kill()
        return 1

    print(f"Server ready (PID {proc.pid})\n")

    try:
        # ── 1. API 延迟 ──
        print("=" * 90)
        print("API 延迟测量（50 次/端点）")
        print("=" * 90)

        measure("GET /health", lambda: api("GET", "/health"))
        measure("GET /api/benchmark/tasks", lambda: api("GET", "/api/benchmark/tasks"))
        measure("GET /api/dashboard/performance", lambda: api("GET", "/api/dashboard/performance"))

        # ── 2. 路由引擎（直接调用，无网络开销）──
        print(f"\n{'='*90}")
        print("路由引擎（直接调用，无网络）")
        print("=" * 90)

        sys.path.insert(0, BACKEND_DIR)
        from dynamic_router import DynamicRouter
        router = DynamicRouter(os.path.join(BACKEND_DIR, "data", "routing_table.json"))
        msgs = [
            "前端 React 组件开发", "后端 Python API 实现", "编写测试用例",
            "Docker 部署配置", "数据分析报告", "全栈开发任务",
            "文档编写", "数据库 schema 设计",
        ]

        def bench_route():
            for m in msgs:
                router.route(m)

        times = []
        for _ in range(200):
            start = time.perf_counter()
            bench_route()
            times.append((time.perf_counter() - start) * 1000)
        times.sort()
        avg = statistics.mean(times)
        per_msg = avg / len(msgs)
        print(f"  8 条消息路由: avg={avg:.3f}ms  per-message={per_msg:.4f}ms  ops/s={1000/avg:.0f}")

        # Accuracy
        cases = [
            ("前端 React 组件", "dept-frontend"), ("后端 Python API", "dept-backend"),
            ("编写测试用例", "dept-qa"), ("Docker 部署", "dept-devops"),
            ("数据分析报告", "dept-data"),
        ]
        correct = sum(1 for msg, exp in cases if router.route(msg).selected_dept == exp)
        print(f"  准确率: {correct}/{len(cases)} ({correct/len(cases):.0%})")

        # ── 3. LLM 缓存 ──
        print(f"\n{'='*90}")
        print("LLM 缓存（SQLite 持久化）")
        print("=" * 90)

        from llm_cache import LLMCache, normalize_prompt
        import tempfile
        perf_cache_db = os.path.join(tempfile.gettempdir(), "llm_cache_perf.db")

        # 写入延迟
        cache = LLMCache(db_path=perf_cache_db)
        cache.clear()
        put_times = []
        for i in range(100):
            start = time.perf_counter()
            cache.put(f"perf-{i}", f"response-{i}", role="bench")
            put_times.append((time.perf_counter() - start) * 1000)
        put_times.sort()
        print(f"  PUT: avg={statistics.mean(put_times):.3f}ms  p95={put_times[95]:.3f}ms  ops/s={1000/statistics.mean(put_times):.0f}")

        # 读取延迟
        get_times = []
        for i in range(100):
            start = time.perf_counter()
            result = cache.get(f"perf-{i}", role="bench")
            get_times.append((time.perf_counter() - start) * 1000)
            assert result == f"response-{i}"
        get_times.sort()
        print(f"  GET: avg={statistics.mean(get_times):.3f}ms  p95={get_times[95]:.3f}ms  ops/s={1000/statistics.mean(get_times):.0f}")

        # 命中率
        cache.put("common prompt", "response")
        hits = sum(1 for _ in range(100) if cache.get("common prompt") is not None)
        print(f"  命中率: {hits}/100 ({hits}%)")

        # 语义规范化
        cache.put("任务在 2026-08-23T10:00:00 完成", "norm-result")
        norm_hits = sum(1 for _ in range(100) if cache.get(f"任务在 2026-08-23T{10+_%24:02d}:00:00 完成") is not None)
        print(f"  语义规范化命中: {norm_hits}/100")

        # 分层 TTL
        from llm_cache import TTL_PRESETS
        cache.put("实现一个排序函数", "creative")
        cache.put("审查代码质量", "review")
        cache.put("请判断是否正确", "deterministic")
        k1 = cache._make_key("实现一个排序函数")
        k2 = cache._make_key("审查代码质量")
        k3 = cache._make_key("请判断是否正确")
        print(f"  TTL: creative={cache._cache[k1]['ttl']}s review={cache._cache[k2]['ttl']}s det={cache._cache[k3]['ttl']}s")
        cache.clear()

        # ── 4. SQLite ──
        print(f"\n{'='*90}")
        print("SQLite 数据库")
        print("=" * 90)

        import sqlite3
        from session_persistence import SessionPersistence

        # 读取延迟
        conn = sqlite3.connect(os.path.join(BACKEND_DIR, "data", "mdh.db"))
        conn.row_factory = sqlite3.Row
        read_times = []
        for _ in range(200):
            start = time.perf_counter()
            conn.execute("SELECT * FROM evolution_log ORDER BY id DESC LIMIT 20").fetchall()
            read_times.append((time.perf_counter() - start) * 1000)
        read_times.sort()
        print(f"  evolution_log 读取: avg={statistics.mean(read_times):.3f}ms  p95={read_times[190]:.3f}ms  ops/s={1000/statistics.mean(read_times):.0f}")

        # 快照写入
        sp = SessionPersistence(db_path=os.path.join(BACKEND_DIR, "data", "mdh.db"))
        write_times = []
        for i in range(100):
            start = time.perf_counter()
            sp.save_snapshot(f"perf-{i}", {"data": f"value-{i}", "timestamp": time.time()})
            write_times.append((time.perf_counter() - start) * 1000)
        write_times.sort()
        print(f"  快照写入: avg={statistics.mean(write_times):.3f}ms  p95={write_times[95]:.3f}ms  ops/s={1000/statistics.mean(write_times):.0f}")

        # 快照读取
        read_times = []
        for i in range(100):
            start = time.perf_counter()
            sp.load_snapshot(f"perf-{i}")
            read_times.append((time.perf_counter() - start) * 1000)
        read_times.sort()
        print(f"  快照读取: avg={statistics.mean(read_times):.3f}ms  p95={read_times[95]:.3f}ms  ops/s={1000/statistics.mean(read_times):.0f}")

        # 幂等检查
        sp.mark_task_started("perf-idem", "t1", "s1")
        sp.mark_task_completed("perf-idem")
        idem_times = []
        for _ in range(200):
            start = time.perf_counter()
            sp.check_task_executed("perf-idem")
            idem_times.append((time.perf_counter() - start) * 1000)
        idem_times.sort()
        print(f"  幂等检查: avg={statistics.mean(idem_times):.3f}ms  p95={idem_times[190]:.3f}ms  ops/s={1000/statistics.mean(idem_times):.0f}")

        # 清理
        conn.execute("DELETE FROM session_snapshots WHERE session_id LIKE 'perf-%'")
        conn.execute("DELETE FROM task_executions WHERE execution_key LIKE 'perf-%'")
        conn.commit()
        conn.close()

        # ── 5. Artifact 存储 ──
        print(f"\n{'='*90}")
        print("Artifact 存储")
        print("=" * 90)

        from artifact_store import ArtifactStore
        ws = os.path.join(BACKEND_DIR, "data", "benchmark_workspace")
        os.makedirs(os.path.join(ws, "perf"), exist_ok=True)
        test_file = os.path.join(ws, "perf", "test.py")
        with open(test_file, "w") as f:
            f.write("# perf test\n" + "x = 1\n" * 200)

        store = ArtifactStore(ws)

        # 写入
        write_times = []
        for i in range(100):
            start = time.perf_counter()
            store.save_artifacts(f"perf-{i}", f"agent-{i}", ["perf/test.py"], "summary")
            write_times.append((time.perf_counter() - start) * 1000)
        write_times.sort()
        print(f"  写入: avg={statistics.mean(write_times):.3f}ms  p95={write_times[95]:.3f}ms  ops/s={1000/statistics.mean(write_times):.0f}")

        # 读取
        refs = store.save_artifacts("perf-read", "agent", ["perf/test.py"])
        read_times = []
        for _ in range(200):
            start = time.perf_counter()
            store.read_artifact_content(refs[0])
            read_times.append((time.perf_counter() - start) * 1000)
        read_times.sort()
        print(f"  读取: avg={statistics.mean(read_times):.3f}ms  p95={read_times[190]:.3f}ms  ops/s={1000/statistics.mean(read_times):.0f}")

        os.remove(test_file)

        # ── 6. 并发 ──
        print(f"\n{'='*90}")
        print("并发安全")
        print("=" * 90)

        # 并发缓存
        cache = LLMCache(db_path=perf_cache_db)
        cache.clear()
        errors = []
        def cache_worker(tid):
            try:
                for i in range(20):
                    cache.put(f"c-{tid}-{i}", f"r{i}")
                    cache.get(f"c-{tid}-{i}")
            except Exception as e:
                errors.append(str(e))

        wall_start = time.perf_counter()
        threads = [threading.Thread(target=cache_worker, args=(t,)) for t in range(4)]
        for t in threads: t.start()
        for t in threads: t.join()
        wall_ms = (time.perf_counter() - wall_start) * 1000
        status = "✅ PASS" if not errors else f"❌ {len(errors)} errors"
        print(f"  并发缓存 (4线程×20次): {status}  wall={wall_ms:.0f}ms")
        cache.clear()

        # 并发 SQLite
        sp = SessionPersistence(db_path=os.path.join(BACKEND_DIR, "data", "mdh.db"))
        errors = []
        def db_worker(tid):
            try:
                for i in range(10):
                    sp.save_snapshot(f"conc-{tid}-{i}", {"data": i})
            except Exception as e:
                errors.append(str(e))

        wall_start = time.perf_counter()
        threads = [threading.Thread(target=db_worker, args=(t,)) for t in range(4)]
        for t in threads: t.start()
        for t in threads: t.join()
        wall_ms = (time.perf_counter() - wall_start) * 1000
        status = "✅ PASS" if not errors else f"❌ {len(errors)} errors"
        print(f"  并发 SQLite (4线程×10次): {status}  wall={wall_ms:.0f}ms")

        # Cleanup
        conn = sqlite3.connect(os.path.join(BACKEND_DIR, "data", "mdh.db"))
        conn.execute("DELETE FROM session_snapshots WHERE session_id LIKE 'conc-%'")
        conn.commit()
        conn.close()

        print(f"\n{'='*90}")

    finally:
        proc.kill()
        proc.wait()

    return 0


if __name__ == "__main__":
    sys.exit(main())
