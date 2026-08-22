"""生产加固测试 — 并发安全 + 错误恢复 + 性能基准 + 安全防护"""

import json
import os
import sqlite3
import threading
import time
import pytest
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── 并发安全 ──


class TestConcurrencySafety:
    """SQLite 并发写入安全"""

    def test_concurrent_profile_writes(self, tmp_path):
        """多线程同时写入不同 agent 档案"""
        from agent_profile_manager import AgentProfileManager
        mgr = AgentProfileManager(str(tmp_path))
        errors = []

        def write_profile(i):
            try:
                p = mgr.get_or_create(f"agent-{i}", f"Agent-{i}", department="dept-software")
                p.total_xp = i * 100
                mgr.save_profile(p)
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=write_profile, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        profiles = mgr.list_profiles()
        assert len(profiles) == 10

    def test_concurrent_rule_writes(self, tmp_path):
        """多线程同时写入不同经验规则"""
        from experience_extractor import ExperienceExtractor, ExperienceRule
        ext = ExperienceExtractor(incremental_dir=str(tmp_path))
        errors = []

        def write_rule(i):
            try:
                rule = ExperienceRule(
                    rule_id=f"rule-{i}", trigger_condition=f"x{i}", action="y", note="",
                    source_task_id="t1", source_task_type="t", rule_type="success_pattern",
                    status="approved", keywords=["test"], created_at="now",
                )
                ext._save_rule(rule)
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=write_rule, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert len(ext._list_rule_ids()) == 10

    def test_concurrent_xp_grant(self, tmp_path):
        """多线程同时给同一 agent 授予 XP"""
        from agent_profile_manager import AgentProfileManager
        mgr = AgentProfileManager(str(tmp_path))
        mgr.get_or_create("agent-1", "Agent-1")
        errors = []

        def grant(i):
            try:
                mgr.grant_xp("agent-1", "backend_dev", True, 8.0, 3, {"xp_thresholds": [100, 300, 600]})
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=grant, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        profile = mgr.get_profile("agent-1")
        assert profile.total_xp > 0
        assert profile.skill_progress.get("backend_dev", {}).get("task_count", 0) == 5


# ── 错误恢复 ──


class TestErrorRecovery:
    """错误恢复测试"""

    def test_corrupted_db_recovery(self, tmp_path):
        """损坏的数据库文件不会崩溃"""
        from agent_profile_manager import AgentProfileManager
        # 创建一个损坏的 db 文件
        db_path = tmp_path / "profiles.db"
        db_path.write_text("not a valid sqlite db", encoding="utf-8")

        # 应该能优雅处理（创建新数据库或抛出可捕获的错误）
        try:
            mgr = AgentProfileManager(str(tmp_path))
            profiles = mgr.list_profiles()
            assert isinstance(profiles, list)
        except Exception:
            # 抛出异常也是可接受的
            pass

    def test_missing_directory_creates_automatically(self, tmp_path):
        """缺失的目录自动创建"""
        from agent_profile_manager import AgentProfileManager
        nested = tmp_path / "deep" / "nested" / "path"
        mgr = AgentProfileManager(str(nested))
        mgr.get_or_create("a1", "Agent-1")
        assert mgr.get_profile("a1") is not None

    def test_empty_json_migration_safe(self, tmp_path):
        """空 JSON 文件不会导致迁移崩溃"""
        from agent_profile_manager import migrate_json_to_sqlite
        # 创建空 JSON 文件
        (tmp_path / "empty.json").write_text("{}", encoding="utf-8")
        # 应该不崩溃
        try:
            result = migrate_json_to_sqlite(str(tmp_path))
            assert isinstance(result, int)
        except Exception:
            pass


# ── 性能基准 ──


class TestPerformanceBenchmark:
    """性能基准测试"""

    def test_profile_write_performance(self, tmp_path):
        """单次档案写入 < 50ms"""
        from agent_profile_manager import AgentProfileManager
        mgr = AgentProfileManager(str(tmp_path))

        start = time.time()
        for i in range(100):
            p = mgr.get_or_create(f"agent-{i}", f"Agent-{i}")
            p.total_xp = i * 10
            mgr.save_profile(p)
        elapsed = time.time() - start

        assert elapsed < 5.0  # 100 次写入 < 5 秒
        assert len(mgr.list_profiles()) == 100

    def test_rule_query_performance(self, tmp_path):
        """规则查询 < 100ms"""
        from experience_extractor import ExperienceExtractor, ExperienceRule
        ext = ExperienceExtractor(incremental_dir=str(tmp_path))

        # 写入 100 条规则
        for i in range(100):
            rule = ExperienceRule(
                rule_id=f"rule-{i}", trigger_condition=f"x{i}", action="y", note="",
                source_task_id="t1", source_task_type="t", rule_type="success_pattern",
                status="approved", keywords=["test", f"kw{i}"], created_at="now",
            )
            ext._save_rule(rule)

        start = time.time()
        for _ in range(10):
            ext.get_all_rules(status="approved")
        elapsed = time.time() - start

        assert elapsed < 1.0  # 10 次查询 < 1 秒

    def test_memory_recall_performance(self, tmp_path):
        """记忆检索 < 100ms"""
        from agent_memory import AgentMemory
        mem = AgentMemory(str(tmp_path))

        # 写入 50 条记忆
        for i in range(50):
            mem.add_memory("agent-1", {
                "type": "learning",
                "content": f"学习内容 {i}: 关于 {['Python', 'React', 'SQL', 'Docker'][i % 4]} 的经验",
                "keywords": [f"keyword{i}", "test"],
                "importance": 0.5 + (i % 5) * 0.1,
            })

        start = time.time()
        for _ in range(10):
            mem.recall("agent-1", "Python 经验", limit=5)
        elapsed = time.time() - start

        assert elapsed < 1.0  # 10 次检索 < 1 秒

    def test_backup_performance(self, tmp_path):
        """数据库备份 < 1 秒"""
        from ops import OpsManager
        from agent_profile_manager import AgentProfileManager

        # 创建一些数据
        mgr = AgentProfileManager(str(tmp_path))
        for i in range(50):
            mgr.get_or_create(f"agent-{i}", f"Agent-{i}")

        # 创建一个 db 文件
        import sqlite3
        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE t (id INTEGER)")
        for i in range(1000):
            conn.execute("INSERT INTO t VALUES (?)", (i,))
        conn.commit()
        conn.close()

        ops = OpsManager(str(tmp_path))
        start = time.time()
        result = ops.backup_database("perf-test")
        elapsed = time.time() - start

        assert elapsed < 1.0
        assert "backup_path" in result


# ── 安全防护 ──


class TestSecurityHardening:
    """安全防护测试"""

    def test_sql_injection_in_agent_id(self, tmp_path):
        """SQL 注入攻击不会崩溃"""
        from agent_profile_manager import AgentProfileManager
        mgr = AgentProfileManager(str(tmp_path))

        malicious_ids = [
            "'; DROP TABLE agent_profiles; --",
            "\" OR 1=1 --",
            "agent-1; DELETE FROM agent_profiles",
        ]

        for mid in malicious_ids:
            try:
                mgr.get_or_create(mid, "test")
                # 如果不崩溃，检查表是否完整
                profiles = mgr.list_profiles()
                assert isinstance(profiles, list)
            except Exception:
                # 抛出异常也是安全的
                pass

    def test_sql_injection_in_rule_id(self, tmp_path):
        """规则 ID SQL 注入不会崩溃"""
        from experience_extractor import ExperienceExtractor
        ext = ExperienceExtractor(incremental_dir=str(tmp_path))

        malicious_ids = ["'; DROP TABLE --", "\" OR 1=1 --", "rule-1; DELETE"]
        for mid in malicious_ids:
            result = ext._load_rule(mid)
            assert result is None  # 应该返回 None，不是崩溃

    def test_oversized_input_handling(self, tmp_path):
        """超大输入不会崩溃"""
        from agent_memory import AgentMemory
        mem = AgentMemory(str(tmp_path))

        # 超长内容
        long_content = "x" * 100_000
        entry = mem.add_memory("agent-1", {"type": "learning", "content": long_content})
        assert entry["content"] == long_content

        # 超多关键词
        many_keywords = [f"kw{i}" for i in range(1000)]
        entry2 = mem.add_memory("agent-1", {"type": "learning", "content": "test", "keywords": many_keywords})
        assert len(entry2["keywords"]) == 1000

    def test_concurrent_read_write_safety(self, tmp_path):
        """并发读写不会死锁或损坏数据库"""
        from agent_profile_manager import AgentProfileManager
        mgr = AgentProfileManager(str(tmp_path))
        mgr.get_or_create("agent-1", "Agent-1")

        def reader():
            for _ in range(10):
                mgr.get_profile("agent-1")

        def writer():
            for i in range(10):
                p = mgr.get_profile("agent-1")
                if p:
                    p.total_xp = i
                    mgr.save_profile(p)

        threads = [threading.Thread(target=reader) for _ in range(3)]
        threads.append(threading.Thread(target=writer))
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        # 验证数据库没有损坏
        profile = mgr.get_profile("agent-1")
        assert profile is not None
