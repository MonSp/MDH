#!/usr/bin/env python3
"""
端到端验证脚本 — 启动后端，运行真实 API 测试，验证所有功能
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN = "e2e-test-token"
BASE = "http://localhost:8765"
PASS = 0
FAIL = 0


def api(method, path, data=None):
    """Make API request with auth"""
    url = f"{BASE}{path}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    try:
        if method == "GET":
            req = urllib.request.Request(url, headers=headers)
        else:
            req = urllib.request.Request(url, data=json.dumps(data or {}).encode(), headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} {detail}")


def main():
    global PASS, FAIL

    # Start server
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

    # Wait for server to be ready
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

    print(f"Server started (PID {proc.pid})\n")

    try:
        # ── Test 1: Health Check ──
        print("=== 1. Health Check ===")
        r = api("GET", "/health")
        check("health endpoint", r.get("healthy") is True)
        check("database healthy", r.get("checks", {}).get("database", {}).get("healthy") is True)

        # ── Test 2: Benchmark Tasks ──
        print("\n=== 2. Benchmark System ===")
        r = api("GET", "/api/benchmark/tasks")
        tasks = r.get("data", r)
        if isinstance(tasks, list):
            check(f"benchmark tasks loaded ({len(tasks)} tasks)", len(tasks) == 16, f"got {len(tasks)}")
            cats = {}
            for t in tasks:
                c = t.get("category", "?")
                cats[c] = cats.get(c, 0) + 1
            check(f"categories: {cats}", cats.get("simple", 0) == 6 and cats.get("standard", 0) == 5 and cats.get("complex", 0) == 5)
        else:
            check("benchmark tasks loaded", False, f"response: {str(tasks)[:100]}")

        # ── Test 3: Performance Dashboard ──
        print("\n=== 3. Performance Dashboard ===")
        r = api("GET", "/api/dashboard/performance")
        data = r.get("data", r)
        if "error" not in data and "detail" not in data:
            check("dashboard loaded", True)
            check("has evolution stats", "evolution" in data)
            check("has system stats", "system" in data)
            check("has session stats", "sessions" in data)
            check("has cost stats", "costs" in data)
        else:
            check("dashboard loaded", False, f"response: {str(data)[:100]}")

        # ── Test 4: Routing ──
        print("\n=== 4. Dynamic Router ===")
        # Test via Python directly since the API requires auth
        sys.path.insert(0, BACKEND_DIR)
        from dynamic_router import DynamicRouter
        router = DynamicRouter(os.path.join(BACKEND_DIR, "data", "routing_table.json"))
        test_cases = [
            ("前端 React 组件开发", "dept-frontend"),
            ("后端 Python API", "dept-backend"),
            ("编写测试用例", "dept-qa"),
            ("Docker 部署配置", "dept-devops"),
            ("数据分析报告", "dept-data"),
        ]
        correct = 0
        for msg, expected in test_cases:
            d = router.route(msg)
            got = d.selected_dept
            if got == expected:
                correct += 1
            else:
                print(f"    '{msg}' → {got} (expected {expected})")
        check(f"routing accuracy: {correct}/{len(test_cases)}", correct == len(test_cases))

        # ── Test 5: LLM Cache ──
        print("\n=== 5. LLM Cache ===")
        from llm_cache import LLMCache
        cache = LLMCache(db_path=os.path.join(BACKEND_DIR, "data", "llm_cache.db"))

        # Write and read
        cache.put("e2e-test-prompt", "e2e-response", role="test")
        result = cache.get("e2e-test-prompt", role="test")
        check("cache put/get", result == "e2e-response")

        # Semantic normalization
        cache.put("任务在 2026-08-23T10:00:00 完成", "normalized-result")
        hit = cache.get("任务在 2026-08-23T15:30:00 完成")
        check("semantic normalization hit", hit == "normalized-result")

        # Tiered TTL
        from llm_cache import TTL_PRESETS
        cache.put("实现一个排序函数", "code")
        key = cache._make_key("实现一个排序函数")
        ttl = cache._cache[key]["ttl"]
        check(f"tiered TTL (creative={TTL_PRESETS['creative']}s)", ttl == TTL_PRESETS["creative"])

        cache.clear()

        # ── Test 6: Session Persistence ──
        print("\n=== 6. Session Persistence ===")
        from session_persistence import SessionPersistence
        sp = SessionPersistence(db_path=os.path.join(BACKEND_DIR, "data", "mdh.db"))

        # Snapshot roundtrip
        sp.save_snapshot("e2e-test-session", {"meeting_id": "e2e", "agents": [{"id": "a1"}]})
        loaded = sp.load_snapshot("e2e-test-session")
        check("snapshot save/load", loaded is not None and loaded["meeting_id"] == "e2e")

        # Idempotent execution
        sp.mark_task_started("e2e-idempotent", "task-1", "session-1")
        sp.mark_task_completed("e2e-idempotent")
        first = sp.mark_task_started("e2e-idempotent", "task-1", "session-1")
        check("idempotent skip", first is False)
        check("idempotent status", sp.check_task_executed("e2e-idempotent") == "completed")

        # Cleanup
        sp.delete_snapshot("e2e-test-session")

        # ── Test 7: Voting ──
        print("\n=== 7. Voting (SIMPLE_MAJORITY only) ===")
        from negotiation import ConsensusStrategy, NegotiationEngine
        check("only one strategy", len(ConsensusStrategy) == 1)

        engine = NegotiationEngine()
        p = engine.create_proposal("coordinator", "方案A")
        engine.cast_vote(p.id, "a1", True)
        engine.cast_vote(p.id, "a2", True)
        engine.cast_vote(p.id, "a3", False)
        result = engine.evaluate_consensus(p.id)
        check("majority vote accepted", result.accepted is True)
        check("no add_argument method", not hasattr(engine, "add_argument"))
        check("no set_agent_weight method", not hasattr(engine, "set_agent_weight"))

        # ── Test 8: HITL Whitelist ──
        print("\n=== 8. HITL Whitelist ===")
        from approval_manager import classify_approval_tier
        check("write_file auto_approve", classify_approval_tier("write_file") == "auto_approve")
        check("run_tests auto_approve", classify_approval_tier("run_tests") == "auto_approve")
        check("read_file auto_approve", classify_approval_tier("read_file") == "auto_approve")
        check("git_push human", classify_approval_tier("git_push") == "human")

        # ── Test 9: Artifact Store ──
        print("\n=== 9. Artifact Store ===")
        from artifact_store import ArtifactStore
        ws = os.path.join(BACKEND_DIR, "data", "benchmark_workspace")
        os.makedirs(os.path.join(ws, "e2e"), exist_ok=True)
        test_file = os.path.join(ws, "e2e", "test.py")
        with open(test_file, "w") as f:
            f.write("# e2e test\nprint('hello')\n")
        store = ArtifactStore(ws)
        refs = store.save_artifacts("e2e-task", "e2e-agent", ["e2e/test.py"], "test")
        check("artifact save", len(refs) == 1 and refs[0].type == "code")
        content = store.read_artifact_content(refs[0])
        check("artifact read", "e2e test" in content)
        os.remove(test_file)

        # ── Test 10: Parallel Execution ──
        print("\n=== 10. Parallel Execution ===")
        from task_orchestrator import TaskOrchestrator
        check("has _execute_one_task method", hasattr(TaskOrchestrator, "_execute_one_task"))
        check("has _execute_parallel method", hasattr(TaskOrchestrator, "_execute_parallel"))

        # ── Test 11: A2A Protocol ──
        print("\n=== 11. A2A Protocol ===")
        from a2a_client import A2AClient
        from a2a_registry import A2ARegistry, AgentCard, AgentSkill
        from a2a_task_router import A2ATaskRouter
        from state_sync import StateSyncManager

        reg = A2ARegistry(persist_path=os.path.join(BACKEND_DIR, "data", "a2a_agents.json"))
        check("A2ARegistry instantiation", True)
        check("A2ARegistry list_active", isinstance(reg.list_active(), list))

        card = AgentCard(name="test", description="test", url="http://example.com",
                         skills=[AgentSkill(id="test", name="test", description="test", tags=["file"])])
        check("AgentCard creation", card.name == "test")

        router = A2ATaskRouter(reg)
        check("A2ATaskRouter instantiation", True)
        check("A2ATaskRouter route (no agents)", router.route("test") is None)

        client = A2AClient()
        check("A2AClient instantiation", True)
        check("A2AClient task log empty", client.get_task_log() == [])

        sync = StateSyncManager(experience_extractor=None)
        check("StateSyncManager instantiation", True)
        metadata = sync.prepare_task_metadata("test", "test-agent")
        check("StateSync metadata is dict", isinstance(metadata, dict))

        # ── Test 12: DB Schema ──
        print("\n=== 12. Database Schema ===")
        import sqlite3
        conn = sqlite3.connect(os.path.join(BACKEND_DIR, "data", "mdh.db"))
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        check("session_snapshots table", "session_snapshots" in tables)
        check("task_executions table", "task_executions" in tables)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(agent_profiles)").fetchall()}
        check("tenant_id column", "tenant_id" in cols)
        conn.close()

    finally:
        proc.kill()
        proc.wait()

    # Summary
    print(f"\n{'='*50}")
    print(f"Results: {PASS} passed, {FAIL} failed, {PASS+FAIL} total")
    print(f"{'='*50}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
