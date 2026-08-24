"""
系统集成测试 — 验证本次会话所有关键改动的端到端行为

覆盖：
1. LLM 缓存（SQLite 持久化 + 语义规范化）
2. 评测基准系统（任务 + 运行 + 分析）
3. Artifact 存储（保存 + 加载 + 读取）
4. 会话持久化（快照 + 幂等执行）
5. 投票机制精简（仅 SIMPLE_MAJORITY）
6. HITL 白名单扩展
7. Agent 状态通知消息
"""

import json
import os
import time

import pytest


@pytest.fixture(autouse=True)
def _clean_global_state():
    """每个测试前清空全局缓存"""
    from llm_cache import llm_cache
    llm_cache.clear()
    yield
    llm_cache.clear()


# ── 1. LLM 缓存集成 ──

class TestLLMCacheIntegration:
    """LLM 缓存：SQLite 持久化 + 语义规范化 + 分层 TTL"""

    def test_cache_put_get_roundtrip(self):
        from llm_cache import llm_cache
        llm_cache.put("integration test prompt", "cached response", role="test")
        assert llm_cache.get("integration test prompt", role="test") == "cached response"
        llm_cache.clear()

    def test_semantic_normalization_hits(self):
        from llm_cache import llm_cache
        llm_cache.put("任务在 2026-08-23T10:00:00 完成", "result")
        # 不同时间戳应命中同一缓存
        assert llm_cache.get("任务在 2026-08-23T15:30:00 完成") == "result"
        llm_cache.clear()

    def test_sqlite_persistence(self, tmp_path):
        from llm_cache import LLMCache
        db = str(tmp_path / "test.db")
        c1 = LLMCache(db_path=db)
        c1.put("persist test", "value")
        # 模拟重启
        c2 = LLMCache(db_path=db)
        assert c2.get("persist test") == "value"

    def test_tiered_ttl(self):
        from llm_cache import llm_cache, TTL_PRESETS
        llm_cache.put("实现一个函数", "code")
        key = llm_cache._make_key("实现一个函数")
        assert llm_cache._cache[key]["ttl"] == TTL_PRESETS["creative"]
        llm_cache.clear()

    def test_stats_include_by_type(self):
        from llm_cache import llm_cache
        llm_cache.put("请判断是否正确", "yes")
        llm_cache.put("实现排序", "code")
        stats = llm_cache.stats
        assert "by_type" in stats
        assert stats["by_type"].get("deterministic", 0) >= 1
        assert stats["by_type"].get("creative", 0) >= 1
        llm_cache.clear()


# ── 2. 评测基准系统 ──

class TestBenchmarkSystem:
    """评测基准：任务 + 运行 + 分析"""

    def test_task_dataset_loaded(self):
        from benchmark.tasks import BENCHMARK_TASKS, get_benchmark_tasks
        assert len(BENCHMARK_TASKS) == 16
        assert len(get_benchmark_tasks(category="simple")) == 6
        assert len(get_benchmark_tasks(category="standard")) == 5
        assert len(get_benchmark_tasks(category="complex")) == 5

    def test_task_tags_filter(self):
        from benchmark.tasks import get_benchmark_tasks
        python_tasks = get_benchmark_tasks(tags=["python"])
        assert len(python_tasks) >= 4

    def test_runner_produces_report(self, tmp_path):
        from benchmark.runner import run_benchmark
        from benchmark.tasks import get_benchmark_tasks
        tasks = get_benchmark_tasks(category="simple")[:1]
        report = run_benchmark(tasks=tasks, workspace=str(tmp_path))
        assert report.total == 1
        assert report.passed + report.failed == 1
        assert report.avg_latency_s >= 0

    def test_analysis_on_report(self, tmp_path):
        from benchmark.runner import run_benchmark
        from benchmark.analysis import analyze_report, format_analysis
        from benchmark.tasks import get_benchmark_tasks
        from dataclasses import asdict
        tasks = get_benchmark_tasks(category="simple")[:2]
        report = run_benchmark(tasks=tasks, workspace=str(tmp_path))
        analysis = analyze_report(asdict(report))
        assert analysis.total_tasks == 2
        assert "simple" in analysis.by_category
        text = format_analysis(analysis)
        assert "评测结果分析" in text

    def test_baseline_compare(self, tmp_path):
        from benchmark.runner import compare_with_baseline, BenchmarkReport, TaskResult
        bl = {"results": [{"task_id": "t1", "success": True, "llm_calls": 3, "latency_s": 1.0}]}
        bl_path = str(tmp_path / "bl.json")
        with open(bl_path, "w") as f:
            json.dump(bl, f)
        report = BenchmarkReport(
            total=1, passed=0, failed=1,
            results=[TaskResult(task_id="t1", success=False, llm_calls=3, latency_s=1.0, error="fail")],
        )
        report = compare_with_baseline(report, bl_path)
        assert len(report.regressions) == 1

    def test_gate_self_check(self):
        from benchmark_gate import run_self_check, check_thresholds
        report = run_self_check()
        failures = check_thresholds(report)
        assert failures == []  # 自检应通过


# ── 3. Artifact 存储 ──

class TestArtifactStore:
    """Artifact 存储：保存 + 加载 + 读取"""

    def test_save_and_load(self, tmp_path):
        from artifact_store import ArtifactStore
        ws = str(tmp_path)
        os.makedirs(os.path.join(ws, "src"), exist_ok=True)
        with open(os.path.join(ws, "src", "main.py"), "w") as f:
            f.write("print('hello')\n")
        store = ArtifactStore(ws)
        refs = store.save_artifacts("task-1", "agent-1", ["src/main.py"], "created file")
        assert len(refs) == 1
        assert refs[0].type == "code"
        loaded = store.load_artifacts("task-1")
        assert len(loaded) == 1

    def test_read_content(self, tmp_path):
        from artifact_store import ArtifactStore
        ws = str(tmp_path)
        os.makedirs(os.path.join(ws, "src"), exist_ok=True)
        with open(os.path.join(ws, "src", "main.py"), "w") as f:
            f.write("def hello(): return 'world'\n")
        store = ArtifactStore(ws)
        refs = store.save_artifacts("t1", "a1", ["src/main.py"])
        content = store.read_artifact_content(refs[0])
        assert "def hello" in content

    def test_build_context(self, tmp_path):
        from artifact_store import ArtifactStore
        ws = str(tmp_path)
        os.makedirs(os.path.join(ws, "src"), exist_ok=True)
        with open(os.path.join(ws, "src", "a.py"), "w") as f:
            f.write("# file a\n")
        with open(os.path.join(ws, "src", "b.py"), "w") as f:
            f.write("# file b\n")
        store = ArtifactStore(ws)
        store.save_artifacts("t1", "a1", ["src/a.py", "src/b.py"])
        ctx = store.build_artifact_context(["t1"])
        assert "file a" in ctx
        assert "file b" in ctx


# ── 4. 会话持久化 ──

class TestSessionPersistence:
    """会话持久化：快照 + 幂等执行"""

    def test_snapshot_roundtrip(self, tmp_path):
        from session_persistence import SessionPersistence
        sp = SessionPersistence(db_path=str(tmp_path / "test.db"))
        state = {"meeting_id": "m1", "agents": [{"id": "a1"}]}
        assert sp.save_snapshot("m1", state) is True
        loaded = sp.load_snapshot("m1")
        assert loaded["meeting_id"] == "m1"

    def test_idempotent_execution(self, tmp_path):
        from session_persistence import SessionPersistence
        sp = SessionPersistence(db_path=str(tmp_path / "test.db"))
        # 首次执行
        assert sp.mark_task_started("t1:step1", "t1") is True
        sp.mark_task_completed("t1:step1")
        # 重复执行应跳过
        assert sp.mark_task_started("t1:step1", "t1") is False
        assert sp.check_task_executed("t1:step1") == "completed"

    def test_latest_snapshot(self, tmp_path):
        from session_persistence import SessionPersistence
        sp = SessionPersistence(db_path=str(tmp_path / "test.db"))
        sp.save_snapshot("m1", {"order": 1})
        sp.save_snapshot("m2", {"order": 2})
        latest = sp.load_latest_snapshot()
        assert latest["session_id"] == "m2"


# ── 5. 投票机制 ──

class TestVotingSimplified:
    """投票精简：仅 SIMPLE_MAJORITY"""

    def test_only_one_strategy(self):
        from negotiation import ConsensusStrategy
        assert len(ConsensusStrategy) == 1
        assert ConsensusStrategy.SIMPLE_MAJORITY.value == "simple_majority"

    def test_simple_majority_vote(self):
        from negotiation import NegotiationEngine
        engine = NegotiationEngine()
        p = engine.create_proposal("coordinator", "方案A")
        engine.cast_vote(p.id, "agent-a", True)
        engine.cast_vote(p.id, "agent-b", True)
        engine.cast_vote(p.id, "agent-c", False)
        result = engine.evaluate_consensus(p.id)
        assert result.accepted is True  # 2 > 1

    def test_no_arguments_support(self):
        """add_argument 已删除，不再支持"""
        from negotiation import NegotiationEngine
        engine = NegotiationEngine()
        assert not hasattr(engine, 'add_argument')

    def test_no_agent_weights(self):
        """set_agent_weight 已删除"""
        from negotiation import NegotiationEngine
        engine = NegotiationEngine()
        assert not hasattr(engine, 'set_agent_weight')


# ── 6. HITL 白名单 ──

class TestHITLWhitelist:
    """HITL 白名单扩展：常见开发操作自动通过"""

    def test_write_file_auto_approve(self):
        from approval_manager import classify_approval_tier
        assert classify_approval_tier("write_file") == "auto_approve"

    def test_run_tests_auto_approve(self):
        from approval_manager import classify_approval_tier
        assert classify_approval_tier("run_tests") == "auto_approve"

    def test_git_push_still_human(self):
        from approval_manager import classify_approval_tier
        assert classify_approval_tier("git_push") == "human"

    def test_read_still_auto_approve(self):
        from approval_manager import classify_approval_tier
        assert classify_approval_tier("read_file") == "auto_approve"


# ── 7. DB Schema ──

class TestDatabaseSchema:
    """数据库 schema：新增表和列"""

    def test_session_snapshots_table(self, tmp_path):
        from db import init_db
        conn = init_db(str(tmp_path / "test.db"))
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert "session_snapshots" in tables
        assert "task_executions" in tables

    def test_tenant_id_column(self, tmp_path):
        from db import init_db
        conn = init_db(str(tmp_path / "test.db"))
        cols = {r[1] for r in conn.execute("PRAGMA table_info(agent_profiles)").fetchall()}
        assert "tenant_id" in cols

    def test_llm_cache_table(self, tmp_path):
        from llm_cache import LLMCache
        cache = LLMCache(db_path=str(tmp_path / "cache.db"))
        cache.put("test", "value")
        # 验证 SQLite 表存在
        import sqlite3
        conn = sqlite3.connect(str(tmp_path / "cache.db"))
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert "llm_cache" in tables
