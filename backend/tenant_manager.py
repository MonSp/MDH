"""多租户基础 — 团队隔离 + 数据分域

核心概念：
- Tenant = 一个独立的团队，有自己的数据空间
- 所有数据查询按 tenant_id 分域
- 每个 tenant 有独立的 API key
"""

import json
import logging
import os
import secrets
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from db import get_db, get_write_lock

logger = logging.getLogger("tenant")


@dataclass
class Tenant:
    tenant_id: str
    name: str
    description: str = ""
    created_at: str = ""
    api_key: str = ""
    is_active: bool = True


class TenantManager:
    """租户管理器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._db_path = os.path.join(data_dir, "tenants.db")
        self._db = get_db(self._db_path)
        self._ensure_table()
        self._lock = threading.Lock()
        self._previous_keys: Dict[str, tuple] = {}  # api_key → (tenant_id, expires_at)

    def _ensure_table(self):
        self._db.executescript("""
            CREATE TABLE IF NOT EXISTS tenants (
                tenant_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                api_key TEXT NOT NULL,
                is_active INTEGER DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key);
        """)
        self._db.commit()

    def create_tenant(self, name: str, description: str = "") -> Tenant:
        """创建租户"""
        tenant_id = f"t-{secrets.token_urlsafe(8)}"
        api_key = f"mdh_tenant_{secrets.token_urlsafe(24)}"
        now = datetime.now(timezone.utc).isoformat()

        with self._lock:
            self._db.execute(
                "INSERT INTO tenants (tenant_id, name, description, created_at, api_key, is_active) VALUES (?, ?, ?, ?, ?, 1)",
                (tenant_id, name, description, now, api_key),
            )
            self._db.commit()

        logger.info("创建租户: %s (%s)", name, tenant_id)
        return Tenant(tenant_id=tenant_id, name=name, description=description, created_at=now, api_key=api_key, is_active=True)

    def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        """获取租户"""
        row = self._db.execute("SELECT * FROM tenants WHERE tenant_id = ?", (tenant_id,)).fetchone()
        if not row:
            return None
        return Tenant(
            tenant_id=row["tenant_id"], name=row["name"], description=row["description"] or "",
            created_at=row["created_at"], api_key=row["api_key"], is_active=bool(row["is_active"]),
        )

    def get_tenant_by_api_key(self, api_key: str, include_inactive: bool = False) -> Optional[Tenant]:
        """通过 API key 获取租户（含旧 key 宽限期检查）

        Args:
            api_key: 租户 API key
            include_inactive: 若为 True，也返回已停用的租户（用于中间件区分 401/403）
        """
        active_filter = "" if include_inactive else " AND is_active = 1"
        row = self._db.execute(f"SELECT * FROM tenants WHERE api_key = ?{active_filter}", (api_key,)).fetchone()
        if row:
            return Tenant(
                tenant_id=row["tenant_id"], name=row["name"], description=row["description"] or "",
                created_at=row["created_at"], api_key=row["api_key"], is_active=bool(row["is_active"]),
            )
        # 检查宽限期内的旧 key
        import time
        prev = self._previous_keys.get(api_key)
        if prev:
            tenant_id, expires_at = prev
            if time.time() < expires_at:
                row = self._db.execute(f"SELECT * FROM tenants WHERE tenant_id = ?{active_filter}", (tenant_id,)).fetchone()
                if row:
                    return Tenant(
                        tenant_id=row["tenant_id"], name=row["name"], description=row["description"] or "",
                        created_at=row["created_at"], api_key=row["api_key"], is_active=bool(row["is_active"]),
                    )
            else:
                del self._previous_keys[api_key]
        return None

    def list_tenants(self) -> List[Tenant]:
        """列出所有租户"""
        rows = self._db.execute("SELECT * FROM tenants ORDER BY created_at DESC").fetchall()
        return [
            Tenant(tenant_id=r["tenant_id"], name=r["name"], description=r["description"] or "",
                   created_at=r["created_at"], api_key=r["api_key"], is_active=bool(r["is_active"]))
            for r in rows
        ]

    def deactivate_tenant(self, tenant_id: str) -> bool:
        """停用租户"""
        with self._lock:
            cursor = self._db.execute("UPDATE tenants SET is_active = 0 WHERE tenant_id = ?", (tenant_id,))
            self._db.commit()
            return cursor.rowcount > 0

    def regenerate_api_key(self, tenant_id: str) -> Optional[str]:
        """重新生成 API key（旧 key 保留 5 分钟宽限期）"""
        new_key = f"mdh_tenant_{secrets.token_urlsafe(24)}"
        with self._lock:
            # 保存旧 key 用于宽限期
            row = self._db.execute("SELECT api_key FROM tenants WHERE tenant_id = ?", (tenant_id,)).fetchone()
            if row and row["api_key"]:
                import time
                self._previous_keys[row["api_key"]] = (tenant_id, time.time() + 300)  # 5 分钟
            cursor = self._db.execute("UPDATE tenants SET api_key = ? WHERE tenant_id = ?", (new_key, tenant_id))
            self._db.commit()
            if cursor.rowcount > 0:
                return new_key
        return None

    def get_tenant_stats(self, tenant_id: str) -> Dict:
        """获取租户数据统计（隔离验证用）"""
        from db import get_db as get_main_db
        db_path = os.path.join(self._data_dir, "mdh.db")
        if not os.path.isfile(db_path):
            return {"agent_profiles": 0, "experience_rules": 0, "session_snapshots": 0}
        conn = get_main_db(db_path)
        stats = {}
        # agent_profiles 按 tenant_id
        try:
            stats["agent_profiles"] = conn.execute(
                "SELECT COUNT(*) FROM agent_profiles WHERE tenant_id = ?", (tenant_id,)
            ).fetchone()[0]
        except Exception:
            stats["agent_profiles"] = 0
        # experience_rules 按 team_id (tenant 映射到 team)
        try:
            stats["experience_rules"] = conn.execute(
                "SELECT COUNT(*) FROM experience_rules WHERE team_id = ?", (tenant_id,)
            ).fetchone()[0]
        except Exception:
            stats["experience_rules"] = 0
        # session_snapshots 按 tenant_id
        try:
            stats["session_snapshots"] = conn.execute(
                "SELECT COUNT(*) FROM session_snapshots WHERE tenant_id = ?", (tenant_id,)
            ).fetchone()[0]
        except Exception:
            stats["session_snapshots"] = 0
        return stats
