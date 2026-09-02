"""SQLite 数据库层 — 统一存储管理

受 Cumora 'Postgres as source of truth' 原则启发，
用 SQLite 替代 JSON 文件存储，解决并发安全和数据一致性问题。

使用 Python 内置 sqlite3，无新依赖。
"""

import logging
import sqlite3
import threading

logger = logging.getLogger("mdh_db")

# 数据库版本，用于未来迁移
DB_VERSION = 1


def get_connection(db_path: str) -> sqlite3.Connection:
    """获取数据库连接（WAL 模式，支持并发读）"""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> sqlite3.Connection:
    """初始化数据库表结构"""
    conn = get_connection(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS agent_profiles (
            agent_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at REAL NOT NULL,
            career_stage TEXT NOT NULL DEFAULT 'junior',
            department TEXT NOT NULL DEFAULT '',
            total_xp INTEGER NOT NULL DEFAULT 0,
            skill_progress TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS experience_rules (
            rule_id TEXT PRIMARY KEY,
            trigger_condition TEXT NOT NULL,
            action TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            source_task_id TEXT NOT NULL DEFAULT '',
            source_task_type TEXT NOT NULL DEFAULT '',
            rule_type TEXT NOT NULL DEFAULT 'success_pattern',
            status TEXT NOT NULL DEFAULT 'pending_review',
            keywords TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            team_id TEXT NOT NULL DEFAULT '',
            source_agent_id TEXT NOT NULL DEFAULT '',
            effectiveness_score REAL NOT NULL DEFAULT 0.0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            success_count INTEGER NOT NULL DEFAULT 0,
            parent_rule_id TEXT NOT NULL DEFAULT '',
            evolution_count INTEGER NOT NULL DEFAULT 0,
            last_used_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS agent_memories (
            agent_id TEXT NOT NULL,
            memory_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'observation',
            content TEXT NOT NULL,
            task_id TEXT NOT NULL DEFAULT '',
            keywords TEXT NOT NULL DEFAULT '[]',
            importance REAL NOT NULL DEFAULT 0.5,
            referenced_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            last_referenced_at TEXT NOT NULL,
            PRIMARY KEY (agent_id, memory_id)
        );

        CREATE TABLE IF NOT EXISTS demotion_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id TEXT NOT NULL,
            trigger_condition TEXT NOT NULL,
            action TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            effectiveness_score REAL NOT NULL,
            usage_count INTEGER NOT NULL,
            success_count INTEGER NOT NULL,
            reason TEXT NOT NULL,
            team_id TEXT NOT NULL DEFAULT '',
            demoted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS evolution_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_rule_id TEXT NOT NULL,
            evolved_rule_id TEXT NOT NULL,
            trigger_condition TEXT NOT NULL,
            original_action TEXT NOT NULL,
            evolved_action TEXT NOT NULL,
            original_score REAL NOT NULL,
            usage_count INTEGER NOT NULL,
            failure_reason TEXT NOT NULL,
            evolved_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS delivery_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            task_description TEXT NOT NULL,
            delivery_types TEXT NOT NULL,
            results TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_snapshots (
            session_id TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_executions (
            execution_key TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            session_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'running',
            started_at TEXT NOT NULL,
            completed_at TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_rules_status ON experience_rules(status);
        CREATE INDEX IF NOT EXISTS idx_rules_team ON experience_rules(team_id);
        CREATE INDEX IF NOT EXISTS idx_rules_type ON experience_rules(rule_type);
        CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_id);
        CREATE INDEX IF NOT EXISTS idx_demotion_time ON demotion_log(demoted_at);
        CREATE INDEX IF NOT EXISTS idx_evolution_time ON evolution_log(evolved_at);
        CREATE INDEX IF NOT EXISTS idx_delivery_time ON delivery_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_task_exec_session ON task_executions(session_id);
        CREATE INDEX IF NOT EXISTS idx_task_exec_status ON task_executions(status);
    """)
    # 迁移：为已有表添加 tenant_id 列（已存在则跳过），在索引前执行
    _safe_add_column(conn, "agent_profiles", "tenant_id", "TEXT NOT NULL DEFAULT ''")
    _safe_add_column(conn, "session_snapshots", "tenant_id", "TEXT NOT NULL DEFAULT ''")
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON agent_profiles(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON session_snapshots(tenant_id);
    """)
    return conn


def _safe_add_column(conn: sqlite3.Connection, table: str, column: str, col_def: str):
    """安全添加列（已存在则跳过）"""
    try:
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
    except Exception as e:
        logger.warning("迁移 %s.%s 失败（可能已存在）: %s", table, column, e)


# 全局连接池（线程安全）
_db_lock = threading.Lock()
_connections: dict[str, sqlite3.Connection] = {}
_write_locks: dict[str, threading.RLock] = {}


def get_db(db_path: str) -> sqlite3.Connection:
    """获取或创建数据库连接（单例模式）"""
    with _db_lock:
        if db_path not in _connections:
            _connections[db_path] = init_db(db_path)
            _write_locks[db_path] = threading.RLock()
        return _connections[db_path]


def get_write_lock(db_path: str) -> threading.RLock:
    """获取数据库写锁（可重入）"""
    with _db_lock:
        if db_path not in _write_locks:
            _write_locks[db_path] = threading.RLock()
        return _write_locks[db_path]


def close_connection(db_path: str):
    """关闭指定数据库连接"""
    with _db_lock:
        conn = _connections.pop(db_path, None)
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        _write_locks.pop(db_path, None)


def close_all():
    """关闭所有数据库连接"""
    with _db_lock:
        for conn in _connections.values():
            try:
                conn.close()
            except Exception:
                pass
        _connections.clear()
        _write_locks.clear()
