"""RBAC 权限控制 — API key 角色分级

角色：
- admin: 全部权限
- agent: 执行权限（任务/规则/记忆），无管理权限
- viewer: 只读权限
"""

import hashlib
import hmac
import json
import logging
import os
import secrets
from typing import Dict, Optional

logger = logging.getLogger("rbac")

# 角色权限定义
ROLE_PERMISSIONS = {
    "admin": {"*"},  # 全部权限
    "agent": {
        "read", "execute", "feedback", "memory",
        "delivery", "monitor", "documents",
    },
    "viewer": {"read"},
}

# 写操作需要的最低权限
WRITE_OPERATIONS = {
    "POST": "execute",
    "PUT": "execute",
    "DELETE": "admin",
}


class RBACManager:
    """RBAC 权限管理器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._keys_path = os.path.join(data_dir, "api_keys.json")
        self._keys: Dict[str, Dict] = {}
        self._load_keys()

    def _load_keys(self):
        try:
            if os.path.isfile(self._keys_path):
                with open(self._keys_path, encoding="utf-8") as f:
                    self._keys = json.load(f)
        except Exception:
            self._keys = {}

    def _save_keys(self):
        try:
            os.makedirs(os.path.dirname(self._keys_path), exist_ok=True)
            tmp = self._keys_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._keys, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._keys_path)
        except Exception:
            pass

    def create_api_key(self, name: str, role: str = "agent") -> str:
        """创建 API key

        Args:
            name: key 名称
            role: 角色 (admin/agent/viewer)

        Returns:
            生成的 API key
        """
        if role not in ROLE_PERMISSIONS:
            raise ValueError(f"无效角色: {role}")

        key = f"mdh_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(key.encode()).hexdigest()

        self._keys[key_hash] = {
            "name": name,
            "role": role,
            "created_at": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
        }
        self._save_keys()
        logger.info("创建 API key: %s (role=%s)", name, role)
        return key

    def verify_key(self, key: str) -> Optional[Dict]:
        """验证 API key，返回 key 信息或 None"""
        if not key:
            return None
        key_hash = hashlib.sha256(key.replace("Bearer ", "").encode()).hexdigest()
        return self._keys.get(key_hash)

    def check_permission(self, role: str, method: str, path: str) -> bool:
        """检查角色是否有权限执行操作

        Args:
            role: 角色名
            method: HTTP 方法
            path: 请求路径
        """
        if role not in ROLE_PERMISSIONS:
            return False

        perms = ROLE_PERMISSIONS[role]
        if "*" in perms:
            return True

        # 写操作检查
        required = WRITE_OPERATIONS.get(method)
        if required and required not in perms:
            return False

        return True

    def delete_key(self, key_hash: str) -> bool:
        """删除 API key"""
        if key_hash in self._keys:
            del self._keys[key_hash]
            self._save_keys()
            return True
        return False

    def list_keys(self) -> list:
        """列出所有 API key（不返回 key 值）"""
        return [
            {"hash": k[:8] + "...", **v}
            for k, v in self._keys.items()
        ]
