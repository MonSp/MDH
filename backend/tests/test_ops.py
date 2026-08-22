"""Tests for OpsManager — 生产运维"""
import os
import sqlite3
import pytest
from ops import OpsManager


@pytest.fixture
def ops(tmp_path):
    # 创建一个模拟的 SQLite 数据库
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO test VALUES (1, 'hello')")
    conn.commit()
    conn.close()
    return OpsManager(str(tmp_path))


class TestOpsManager:
    def test_backup_database(self, ops, tmp_path):
        """备份数据库"""
        result = ops.backup_database("test")
        assert "backup_path" in result
        assert os.path.isfile(result["backup_path"])
        assert result["size"] > 0

    def test_list_backups(self, ops, tmp_path):
        """列出备份"""
        ops.backup_database("b1")
        ops.backup_database("b2")
        backups = ops.list_backups()
        assert len(backups) == 2

    def test_restore_backup(self, ops, tmp_path):
        """恢复备份"""
        backup = ops.backup_database("test")
        result = ops.restore_backup(backup["backup_name"])
        assert result["restored"] is True

    def test_restore_nonexistent(self, ops):
        """恢复不存在的备份"""
        result = ops.restore_backup("nonexistent.db")
        assert "error" in result

    def test_cleanup_old_backups(self, ops, tmp_path):
        """清理旧备份"""
        for i in range(8):
            ops.backup_database(f"b{i}")
        removed = ops.cleanup_old_backups(keep_count=3)
        assert removed == 5
        assert len(ops.list_backups()) == 3

    def test_health_check(self, ops):
        """健康检查"""
        result = ops.health_check()
        assert "healthy" in result
        assert "checks" in result
        assert result["checks"]["database"]["healthy"] is True

    def test_health_check_disk(self, ops):
        """磁盘检查"""
        result = ops.health_check()
        disk = result["checks"]["disk"]
        assert disk["healthy"] is True
        assert disk["free_mb"] > 0

    def test_health_check_modules(self, ops):
        """模块检查"""
        result = ops.health_check()
        modules = result["checks"]["modules"]
        assert modules["healthy"] is True

    def test_error_summary_no_log(self, ops):
        """无日志文件"""
        result = ops.get_error_summary()
        assert "error" in result
