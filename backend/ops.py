"""生产运维 — 数据库备份 + 健康检查 + 日志聚合

核心能力：
1. 数据库备份：SQLite 自动备份 + 手动备份 + 恢复
2. 健康检查：数据库连接、磁盘空间、模块状态
3. 日志聚合：结构化日志 + 错误统计
"""

import json
import logging
import os
import shutil
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

logger = logging.getLogger("ops")


class OpsManager:
    """生产运维管理器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._backup_dir = os.path.join(data_dir, "backups")
        os.makedirs(self._backup_dir, exist_ok=True)

    # ── 数据库备份 ──

    def backup_database(self, label: str = "") -> Dict[str, Any]:
        """备份 SQLite 数据库

        Args:
            label: 备份标签（可选）

        Returns:
            {"backup_path": str, "size": int, "timestamp": str}
        """
        db_path = os.path.join(self._data_dir, "mdh.db")
        if not os.path.isfile(db_path):
            # 尝试找到任何 .db 文件
            for fname in os.listdir(self._data_dir):
                if fname.endswith(".db"):
                    db_path = os.path.join(self._data_dir, fname)
                    break
            else:
                return {"error": "未找到数据库文件"}

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        label_str = f"_{label}" if label else ""
        backup_name = f"backup_{timestamp}{label_str}.db"
        backup_path = os.path.join(self._backup_dir, backup_name)

        try:
            # 使用 SQLite 在线备份 API（不锁库）
            src = sqlite3.connect(db_path)
            dst = sqlite3.connect(backup_path)
            src.backup(dst)
            dst.close()
            src.close()

            size = os.path.getsize(backup_path)
            logger.info("数据库备份完成: %s (%d bytes)", backup_name, size)
            return {
                "backup_path": backup_path,
                "backup_name": backup_name,
                "size": size,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error("数据库备份失败: %s", e)
            return {"error": str(e)}

    def list_backups(self) -> List[Dict]:
        """列出所有备份"""
        backups = []
        for fname in sorted(os.listdir(self._backup_dir), reverse=True):
            if fname.endswith(".db"):
                fpath = os.path.join(self._backup_dir, fname)
                backups.append({
                    "name": fname,
                    "size": os.path.getsize(fpath),
                    "created_at": datetime.fromtimestamp(os.path.getctime(fpath), timezone.utc).isoformat(),
                })
        return backups

    def restore_backup(self, backup_name: str) -> Dict[str, Any]:
        """从备份恢复数据库

        Args:
            backup_name: 备份文件名

        Returns:
            {"restored": bool, "backup_name": str}
        """
        backup_path = os.path.join(self._backup_dir, backup_name)
        if not os.path.isfile(backup_path):
            return {"error": f"备份文件不存在: {backup_name}"}

        db_path = os.path.join(self._data_dir, "mdh.db")
        try:
            # 先备份当前数据库
            if os.path.isfile(db_path):
                self.backup_database(label="before_restore")
            shutil.copy2(backup_path, db_path)
            logger.info("数据库恢复完成: %s", backup_name)
            return {"restored": True, "backup_name": backup_name}
        except Exception as e:
            logger.error("数据库恢复失败: %s", e)
            return {"error": str(e)}

    def cleanup_old_backups(self, keep_count: int = 5) -> int:
        """清理旧备份，只保留最近 N 个"""
        backups = sorted(
            [f for f in os.listdir(self._backup_dir) if f.endswith(".db")],
            key=lambda f: os.path.getctime(os.path.join(self._backup_dir, f)),
            reverse=True,
        )
        removed = 0
        for fname in backups[keep_count:]:
            try:
                os.remove(os.path.join(self._backup_dir, fname))
                removed += 1
            except Exception:
                pass
        return removed

    # ── 健康检查 ──

    def health_check(self) -> Dict[str, Any]:
        """综合健康检查"""
        checks = {}

        # 1. 数据库连接
        checks["database"] = self._check_database()

        # 2. 磁盘空间
        checks["disk"] = self._check_disk()

        # 3. 模块状态
        checks["modules"] = self._check_modules()

        # 4. 备份状态
        checks["backups"] = self._check_backups()

        overall = all(c.get("healthy", False) for c in checks.values())
        return {
            "healthy": overall,
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _check_database(self) -> Dict:
        """检查数据库连接"""
        db_files = [f for f in os.listdir(self._data_dir) if f.endswith(".db")]
        if not db_files:
            return {"healthy": True, "message": "数据库将在首次使用时创建", "files": 0}

        for fname in db_files:
            db_path = os.path.join(self._data_dir, fname)
            try:
                conn = sqlite3.connect(db_path)
                conn.execute("SELECT 1")
                conn.close()
                size = os.path.getsize(db_path)
                return {"healthy": True, "file": fname, "size": size}
            except Exception as e:
                return {"healthy": False, "file": fname, "error": str(e)}

        return {"healthy": True, "message": "无数据库文件"}

    def _check_disk(self) -> Dict:
        """检查磁盘空间"""
        try:
            usage = shutil.disk_usage(self._data_dir)
            free_mb = usage.free / (1024 * 1024)
            total_mb = usage.total / (1024 * 1024)
            used_pct = (usage.used / usage.total) * 100
            healthy = free_mb > 100  # 至少 100MB 可用
            return {
                "healthy": healthy,
                "free_mb": round(free_mb),
                "total_mb": round(total_mb),
                "used_pct": round(used_pct, 1),
            }
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    def _check_modules(self) -> Dict:
        """检查核心模块状态"""
        modules = {}
        for mod_name in ["agent_profile_manager", "experience_extractor", "agent_memory",
                         "dynamic_router", "promotion_engine", "delivery_engine"]:
            try:
                __import__(mod_name)
                modules[mod_name] = "ok"
            except Exception as e:
                modules[mod_name] = f"error: {e}"

        healthy = all(v == "ok" for v in modules.values())
        return {"healthy": healthy, "modules": modules}

    def _check_backups(self) -> Dict:
        """检查备份状态"""
        backups = self.list_backups()
        if not backups:
            return {"healthy": True, "message": "无备份", "count": 0}
        latest = backups[0]
        return {
            "healthy": True,
            "count": len(backups),
            "latest": latest["name"],
            "latest_size": latest["size"],
        }

    # ── 日志聚合 ──

    def get_error_summary(self, log_path: str = "") -> Dict:
        """获取错误日志摘要"""
        if not log_path:
            # 尝试找到日志文件
            for candidate in ["backend.log", "server.log", "app.log"]:
                path = os.path.join(self._data_dir, candidate)
                if os.path.isfile(path):
                    log_path = path
                    break
        if not log_path or not os.path.isfile(log_path):
            return {"error": "未找到日志文件"}

        error_lines = []
        try:
            with open(log_path, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if "ERROR" in line or "Exception" in line or "Traceback" in line:
                        error_lines.append(line.strip()[:200])
        except Exception as e:
            return {"error": str(e)}

        return {
            "log_path": log_path,
            "total_errors": len(error_lines),
            "recent_errors": error_lines[-10:],
        }
