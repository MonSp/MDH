"""
SessionPersistence — 会话状态持久化

将会话/会议状态定期快照到 SQLite，支持崩溃恢复和任务幂等执行。
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("session_persistence")

# 默认数据库路径
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "mdh.db")


class SessionPersistence:
    """会话持久化管理器

    职责：
    - 定期快照会议状态到 SQLite（session_snapshots 表）
    - 启动时恢复最近快照
    - 任务幂等执行（task_executions 表）
    """

    def __init__(self, db_path: str = ""):
        self._db_path = db_path or DEFAULT_DB_PATH
        self._ensure_db()

    def _ensure_db(self):
        """确保数据库和表存在"""
        from db import get_db
        os.makedirs(os.path.dirname(self._db_path), exist_ok=True)
        get_db(self._db_path)

    def _get_conn(self):
        from db import get_db
        return get_db(self._db_path)

    def _get_write_lock(self):
        from db import get_write_lock
        return get_write_lock(self._db_path)

    # ── 会话快照 ──

    def save_snapshot(self, session_id: str, state: dict[str, Any]) -> bool:
        """保存或更新会话快照

        Args:
            session_id: 会话 ID
            state: 可序列化的状态字典

        Returns:
            是否成功
        """
        now = datetime.now(timezone.utc).isoformat()
        state_json = json.dumps(state, ensure_ascii=False, default=str)
        try:
            with self._get_write_lock():
                conn = self._get_conn()
                conn.execute(
                    """INSERT INTO session_snapshots (session_id, state_json, created_at, updated_at)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(session_id) DO UPDATE SET
                         state_json=excluded.state_json,
                         updated_at=excluded.updated_at""",
                    (session_id, state_json, now, now),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.warning("保存会话快照失败: %s", e)
            return False

    def load_snapshot(self, session_id: str) -> dict[str, Any] | None:
        """加载会话快照

        Args:
            session_id: 会话 ID

        Returns:
            状态字典，不存在返回 None
        """
        try:
            conn = self._get_conn()
            row = conn.execute(
                "SELECT state_json FROM session_snapshots WHERE session_id=?",
                (session_id,),
            ).fetchone()
            if row:
                return json.loads(row["state_json"])
        except Exception as e:
            logger.warning("加载会话快照失败: %s", e)
        return None

    def load_latest_snapshot(self) -> dict[str, Any] | None:
        """加载最近的会话快照（用于崩溃恢复）

        Returns:
            (session_id, state) 元组，无快照返回 None
        """
        try:
            conn = self._get_conn()
            row = conn.execute(
                "SELECT session_id, state_json FROM session_snapshots ORDER BY updated_at DESC LIMIT 1"
            ).fetchone()
            if row:
                return {
                    "session_id": row["session_id"],
                    "state": json.loads(row["state_json"]),
                }
        except Exception as e:
            logger.warning("加载最近快照失败: %s", e)
        return None

    def delete_snapshot(self, session_id: str) -> bool:
        """删除会话快照（会议正常结束后清理）"""
        try:
            with self._get_write_lock():
                conn = self._get_conn()
                conn.execute("DELETE FROM session_snapshots WHERE session_id=?", (session_id,))
                conn.commit()
            return True
        except Exception as e:
            logger.warning("删除会话快照失败: %s", e)
            return False

    # ── 任务幂等执行 ──

    def check_task_executed(self, execution_key: str) -> str | None:
        """检查任务是否已执行（幂等检查）

        Args:
            execution_key: 幂等键（如 task_id + "_" + step）

        Returns:
            任务状态（"running"/"completed"/"failed"），未执行返回 None
        """
        try:
            conn = self._get_conn()
            row = conn.execute(
                "SELECT status FROM task_executions WHERE execution_key=?",
                (execution_key,),
            ).fetchone()
            return row["status"] if row else None
        except Exception as e:
            logger.warning("检查任务执行状态失败: %s", e)
            return None

    def mark_task_started(
        self, execution_key: str, task_id: str, session_id: str = ""
    ) -> bool:
        """标记任务开始执行（幂等：已存在则跳过）

        Returns:
            True 表示本次是首次执行，False 表示已执行过
        """
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_write_lock():
                conn = self._get_conn()
                conn.execute(
                    """INSERT OR IGNORE INTO task_executions
                       (execution_key, task_id, session_id, status, started_at)
                       VALUES (?, ?, ?, 'running', ?)""",
                    (execution_key, task_id, session_id, now),
                )
                conn.commit()
                # 检查是否是新插入
                row = conn.execute(
                    "SELECT status FROM task_executions WHERE execution_key=?",
                    (execution_key,),
                ).fetchone()
                return row is not None and row["status"] == "running"
        except Exception as e:
            logger.warning("标记任务开始失败: %s", e)
            return True  # 出错时允许执行（不阻塞）

    def mark_task_completed(self, execution_key: str) -> bool:
        """标记任务完成"""
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_write_lock():
                conn = self._get_conn()
                conn.execute(
                    "UPDATE task_executions SET status='completed', completed_at=? WHERE execution_key=?",
                    (now, execution_key),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.warning("标记任务完成失败: %s", e)
            return False

    def mark_task_failed(self, execution_key: str) -> bool:
        """标记任务失败"""
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_write_lock():
                conn = self._get_conn()
                conn.execute(
                    "UPDATE task_executions SET status='failed', completed_at=? WHERE execution_key=?",
                    (now, execution_key),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.warning("标记任务失败失败: %s", e)
            return False

    def cleanup_old_executions(self, days: int = 7) -> int:
        """清理旧的任务执行记录

        Args:
            days: 保留天数

        Returns:
            删除的记录数
        """
        try:
            with self._get_write_lock():
                conn = self._get_conn()
                cursor = conn.execute(
                    "DELETE FROM task_executions WHERE completed_at != '' AND completed_at < datetime('now', ?)",
                    (f"-{days} days",),
                )
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            logger.warning("清理旧执行记录失败: %s", e)
            return 0
