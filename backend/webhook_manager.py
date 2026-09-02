"""Webhook 集成 — 事件注册 + 触发 + 重试 + 签名验证

支持的事件：
- task.completed: 任务完成
- agent.promoted: agent 晋升
- rule.demoted: 规则降级
- rule.evolved: 规则自进化
- health.alert: 健康告警
"""

import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from db import get_db

logger = logging.getLogger("webhook")

SUPPORTED_EVENTS = [
    "task.completed",
    "agent.promoted",
    "rule.demoted",
    "rule.evolved",
    "health.alert",
]


@dataclass
class WebhookSubscription:
    sub_id: str
    url: str
    events: list[str]
    secret: str
    is_active: bool = True
    created_at: str = ""


class WebhookManager:
    """Webhook 管理器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._db_path = os.path.join(data_dir, "webhooks.db")
        self._db = get_db(self._db_path)
        self._lock = threading.Lock()
        self._ensure_table()

    def _ensure_table(self):
        self._db.executescript("""
            CREATE TABLE IF NOT EXISTS webhook_subscriptions (
                sub_id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                events TEXT NOT NULL,
                secret TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS webhook_deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sub_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                response_code INTEGER,
                attempts INTEGER DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL,
                delivered_at TEXT
            );
        """)
        self._db.commit()

    def subscribe(self, url: str, events: list[str]) -> WebhookSubscription:
        """注册 webhook 订阅"""
        sub_id = f"wh-{secrets.token_urlsafe(8)}"
        secret = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._db.execute(
                "INSERT INTO webhook_subscriptions (sub_id, url, events, secret, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                (sub_id, url, json.dumps(events), secret, now),
            )
            self._db.commit()
        logger.info("注册 webhook: %s → %s (events=%s)", sub_id, url, events)
        return WebhookSubscription(sub_id=sub_id, url=url, events=events, secret=secret, is_active=True, created_at=now)

    def unsubscribe(self, sub_id: str) -> bool:
        """取消订阅"""
        with self._lock:
            cursor = self._db.execute("DELETE FROM webhook_subscriptions WHERE sub_id = ?", (sub_id,))
            self._db.commit()
            return cursor.rowcount > 0

    def list_subscriptions(self) -> list[WebhookSubscription]:
        """列出所有订阅"""
        rows = self._db.execute("SELECT * FROM webhook_subscriptions WHERE is_active = 1").fetchall()
        return [
            WebhookSubscription(
                sub_id=r["sub_id"], url=r["url"],
                events=json.loads(r["events"]) if isinstance(r["events"], str) else r["events"],
                secret=r["secret"], is_active=bool(r["is_active"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def trigger(self, event_type: str, payload: dict[str, Any]) -> int:
        """触发事件，通知所有匹配的订阅者

        Returns:
            通知的订阅者数量
        """
        subs = self.list_subscriptions()
        matching = [s for s in subs if event_type in s.events]
        if not matching:
            return 0

        now = datetime.now(timezone.utc).isoformat()
        payload_json = json.dumps(payload, ensure_ascii=False)
        notified = 0

        for sub in matching:
            signature = self._sign(sub.secret, payload_json)
            success = False
            last_error = ""
            for attempt in range(3):
                try:
                    self._deliver(sub.url, payload_json, signature)
                    self._record_delivery(sub.sub_id, event_type, payload_json, "success", 200, now)
                    notified += 1
                    success = True
                    break
                except Exception as e:
                    last_error = str(e)
                    if attempt < 2:
                        time.sleep(2 ** attempt)  # 指数退避: 1s, 2s
            if not success:
                self._record_delivery(sub.sub_id, event_type, payload_json, "failed", 0, now, last_error)
                logger.warning("Webhook 投递失败 (3次重试): %s → %s: %s", sub.sub_id, sub.url, last_error)

        return notified

    def _sign(self, secret: str, payload: str) -> str:
        """生成 HMAC-SHA256 签名（含时间戳防重放）"""
        timestamp = str(int(time.time()))
        message = f"{timestamp}.{payload}"
        sig = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        return f"t={timestamp},v1={sig}"

    def _deliver(self, url: str, payload: str, signature: str):
        """投递 webhook（同步）"""
        req = Request(url, data=payload.encode(), method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("X-MDH-Signature", signature)
        req.add_header("X-MDH-Event", "webhook")
        req.add_header("X-MDH-Timestamp", str(int(time.time())))
        resp = urlopen(req, timeout=10)
        if resp.status >= 400:
            raise URLError(f"HTTP {resp.status}")

    def _record_delivery(self, sub_id: str, event_type: str, payload: str, status: str, code: int, now: str, error: str = ""):
        with self._lock:
            self._db.execute(
                "INSERT INTO webhook_deliveries (sub_id, event_type, payload, status, response_code, attempts, last_error, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
                (sub_id, event_type, payload, status, code, error, now, now if status == "success" else None),
            )
            self._db.commit()

    def get_delivery_log(self, sub_id: str = "", limit: int = 20) -> list[dict]:
        """获取投递日志"""
        if sub_id:
            rows = self._db.execute(
                "SELECT * FROM webhook_deliveries WHERE sub_id = ? ORDER BY id DESC LIMIT ?", (sub_id, limit)
            ).fetchall()
        else:
            rows = self._db.execute(
                "SELECT * FROM webhook_deliveries ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def get_stats(self) -> dict:
        """投递统计"""
        rows = self._db.execute("SELECT status, COUNT(*) as cnt FROM webhook_deliveries GROUP BY status").fetchall()
        by_status = {r["status"]: r["cnt"] for r in rows}
        total = sum(by_status.values())
        subs = self.list_subscriptions()
        return {
            "total_deliveries": total,
            "by_status": by_status,
            "active_subscriptions": len(subs),
            "supported_events": SUPPORTED_EVENTS,
        }
